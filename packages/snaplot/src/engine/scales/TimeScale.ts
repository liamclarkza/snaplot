import { cachedDateFormat, runtimeTimeZone } from '../format';
import type { Scale, ScaleType } from '../spec';

/**
 * Time scale: linear on epoch milliseconds, with ticks on calendar boundaries
 * in the viewer's local time or in UTC (`timeZone`, plan D7).
 *
 * Ticks land where a reader expects dates to land: hours on the hour grid of
 * the day (stepped on the calendar, so a DST change does not shift them),
 * minutes and seconds on the local hour (so :00/:30 also hold in zones with a
 * :45 offset), days on midnights (weeks on Mondays), months on the 1st and
 * years on January 1st. Labels are chosen from the tick interval, not the
 * visible span, so adjacent labels never read the same, and all text goes
 * through cached `Intl.DateTimeFormat`s in one `locale`.
 */

const SECOND_MS = 1000;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
// Nominal widths for month/year entries; used only to pick an interval.
// Tick generation for these walks the actual calendar.
const MONTH_MS = 2_592_000_000;
const YEAR_MS = 31_536_000_000;

const TIME_INTERVALS: number[] = [
  10,
  50,
  100,
  250,
  500,
  SECOND_MS,
  5 * SECOND_MS,
  15 * SECOND_MS,
  30 * SECOND_MS,
  MINUTE_MS,
  5 * MINUTE_MS,
  15 * MINUTE_MS,
  30 * MINUTE_MS,
  HOUR_MS,
  3 * HOUR_MS,
  6 * HOUR_MS,
  12 * HOUR_MS,
  DAY_MS,
  2 * DAY_MS,
  7 * DAY_MS,
  14 * DAY_MS,
  MONTH_MS,
  2 * MONTH_MS,
  3 * MONTH_MS,
  6 * MONTH_MS,
  YEAR_MS,
];

export type TimeZoneMode = 'local' | 'UTC';

interface Parts {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
  ms: number;
  dow: number;
}

function parts(t: number, zone: TimeZoneMode): Parts {
  const date = new Date(t);
  return zone === 'UTC'
    ? {
        y: date.getUTCFullYear(),
        mo: date.getUTCMonth(),
        d: date.getUTCDate(),
        h: date.getUTCHours(),
        mi: date.getUTCMinutes(),
        s: date.getUTCSeconds(),
        ms: date.getUTCMilliseconds(),
        dow: date.getUTCDay(),
      }
    : {
        y: date.getFullYear(),
        mo: date.getMonth(),
        d: date.getDate(),
        h: date.getHours(),
        mi: date.getMinutes(),
        s: date.getSeconds(),
        ms: date.getMilliseconds(),
        dow: date.getDay(),
      };
}

/** Epoch ms of a calendar time; out-of-range fields roll over (month 13, hour 26). */
function make(zone: TimeZoneMode, y: number, mo: number, d = 1, h = 0, mi = 0): number {
  return zone === 'UTC' ? Date.UTC(y, mo, d, h, mi) : new Date(y, mo, d, h, mi).getTime();
}

function dateFormat(
  locale: string | undefined,
  zone: TimeZoneMode,
  zoneKey: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  return zone === 'UTC'
    ? cachedDateFormat(locale, { ...options, timeZone: 'UTC' }, 'UTC')
    : cachedDateFormat(locale, options, zoneKey);
}

const HM: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
const HMS: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', second: '2-digit' };
const MD: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
const MDY: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };

export class TimeScale implements Scale {
  readonly type: ScaleType = 'time';
  readonly key: string;
  min: number;
  max: number;
  /** Calendar of ticks and labels (plan D7). */
  timeZone: TimeZoneMode = 'local';
  /** BCP 47 locale of labels; the runtime default when unset. */
  locale: string | undefined = undefined;
  private pxMin = 0;
  private pxMax = 0;
  private cacheMin = Number.NaN;
  private cacheMax = Number.NaN;
  private cachePxMin = Number.NaN;
  private cachePxMax = Number.NaN;
  private dataToPxScale = 0;
  private dataToPxOffset = 0;
  private pxToDataScale = 0;
  private pxToDataOffset = 0;
  /** The interval of the ticks last produced by ticks(); labels and readouts read it. */
  private lastInterval = Number.NaN;
  /** The runtime's zone when ticks() last ran, so cached local formats follow a TZ change. */
  private zoneKey = '';

  constructor(key: string, min = 0, max = Date.now()) {
    this.key = key;
    this.min = min;
    this.max = max;
  }

  dataToPixel(value: number): number {
    if (!this.updateTransformCache()) return this.pxMin;
    return value * this.dataToPxScale + this.dataToPxOffset;
  }

  pixelToData(pixel: number): number {
    if (!this.updateTransformCache()) return this.min;
    return pixel * this.pxToDataScale + this.pxToDataOffset;
  }

  /**
   * `count` caps the label density; the pixel width sets the default
   * (about one label per 75px). The axis fit pass may thin them further.
   */
  ticks(count: number = 6): number[] {
    this.zoneKey = this.timeZone === 'UTC' ? 'UTC' : localZone();
    const pxRange = Math.abs(this.pxMax - this.pxMin);
    if (pxRange <= 0) return [];

    const domain = this.max - this.min;
    if (domain <= 0) return [this.min];

    // A label per 75 px at most: the axis' measured fit pass (axes/render.ts) drops any that
    // still collide, so a phone-width quarter reads Jul Aug Sep rather than Jul Sep.
    const widthTarget = Math.max(2, Math.floor(pxRange / 75));
    const targetLabels = Math.max(2, Math.min(count, widthTarget));
    const interval = this.pickInterval(domain / targetLabels);

    const ticks = this.alignTicks(interval);
    if (ticks.length >= 2) {
      this.lastInterval = interval;
      return ticks;
    }

    // The picked interval straddles the domain (a 90-day window on a narrow
    // chart picks 2-month ticks, one 1st-of-month inside): step down the
    // ladder until two aligned boundaries fit.
    for (const smaller of this.intervalsBelow(interval)) {
      const stepped = this.alignTicks(smaller);
      if (stepped.length >= 2) {
        this.lastInterval = smaller;
        return stepped;
      }
    }

    // The domain is tighter than the smallest interval: an even subdivision.
    const steps = Math.max(2, Math.min(targetLabels, 6));
    const fallback: number[] = new Array(steps + 1);
    for (let i = 0; i <= steps; i++) fallback[i] = this.min + (domain * i) / steps;
    this.lastInterval = domain / steps;
    return fallback;
  }

  /** Ladder intervals strictly below `interval`, largest first. */
  private *intervalsBelow(interval: number): Generator<number> {
    for (const years of [100, 50, 20, 10, 5, 2, 1]) {
      const ms = years * YEAR_MS;
      if (ms < interval) yield ms;
    }
    for (let i = TIME_INTERVALS.length - 1; i >= 0; i--) {
      if (TIME_INTERVALS[i] < interval) yield TIME_INTERVALS[i];
    }
  }

  private alignTicks(interval: number): number[] {
    const zone = this.timeZone;
    const p = parts(this.min, zone);
    if (!Number.isFinite(p.y)) return [];
    const out: number[] = [];
    const push = (t: number) => {
      if (t >= this.min && t <= this.max && (out.length === 0 || t > out[out.length - 1]))
        out.push(t);
    };

    if (interval >= YEAR_MS) {
      const step = Math.round(interval / YEAR_MS);
      for (let y = Math.floor(p.y / step) * step; make(zone, y, 0) <= this.max; y += step) {
        push(make(zone, y, 0));
      }
      return out;
    }
    if (interval >= MONTH_MS) {
      // Steps count from January so 3M reads Jan / Apr / Jul / Oct.
      const step = Math.round(interval / MONTH_MS);
      for (let m = Math.floor(p.mo / step) * step; make(zone, p.y, m) <= this.max; m += step) {
        push(make(zone, p.y, m));
      }
      return out;
    }
    if (interval >= DAY_MS) {
      const step = Math.round(interval / DAY_MS);
      let d = p.d;
      // Week steps start on a Monday.
      if (step % 7 === 0) d += (8 - p.dow) % 7;
      for (; make(zone, p.y, p.mo, d) <= this.max; d += step) push(make(zone, p.y, p.mo, d));
      return out;
    }
    if (interval >= HOUR_MS) {
      // On the hour grid of the first day, stepped on the calendar.
      const step = Math.round(interval / HOUR_MS);
      for (let h = 0; make(zone, p.y, p.mo, p.d, h) <= this.max; h += step) {
        push(make(zone, p.y, p.mo, p.d, h));
      }
      return out;
    }
    if (interval >= MINUTE_MS) {
      // On the minute grid of the first hour (local hours start on whole minutes).
      const step = Math.round(interval / MINUTE_MS);
      for (let mi = 0; make(zone, p.y, p.mo, p.d, p.h, mi) <= this.max; mi += step) {
        push(make(zone, p.y, p.mo, p.d, p.h, mi));
      }
      return out;
    }
    // Seconds and below: every zone's minutes start on whole seconds of the epoch.
    for (let t = Math.ceil(this.min / interval) * interval; t <= this.max; t += interval) push(t);
    return out;
  }

  private fmt(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    if (!this.zoneKey) this.zoneKey = this.timeZone === 'UTC' ? 'UTC' : localZone();
    return dateFormat(this.locale, this.timeZone, this.zoneKey, options);
  }

  private interval(): number {
    if (Number.isFinite(this.lastInterval)) return this.lastInterval;
    return this.pickInterval((this.max - this.min) / 6);
  }

  /** A tick label, as fine as the tick interval needs and no finer. */
  tickFormat(value: number): string {
    if (!Number.isFinite(value)) return '';
    const interval = this.interval();
    const p = parts(value, this.timeZone);
    const midnight = p.h === 0 && p.mi === 0 && p.s === 0 && p.ms === 0;
    if (interval < SECOND_MS) {
      const digits = interval >= 100 ? 1 : interval >= 10 ? 2 : 3;
      return this.fmt({ ...HMS, fractionalSecondDigits: digits as 1 | 2 | 3 }).format(value);
    }
    if (interval < MINUTE_MS) return this.fmt(HMS).format(value);
    if (interval < DAY_MS) {
      // A day boundary on an hour axis names the day.
      return midnight ? this.fmt(MD).format(value) : this.fmt(HM).format(value);
    }
    if (interval < MONTH_MS) return this.fmt(MD).format(value);
    if (interval < YEAR_MS) {
      if (midnight && p.d === 1) {
        return p.mo === 0
          ? this.fmt({ month: 'short', year: 'numeric' }).format(value)
          : this.fmt({ month: 'short' }).format(value);
      }
      return this.fmt(MD).format(value);
    }
    if (midnight && p.d === 1 && p.mo === 0) return this.fmt({ year: 'numeric' }).format(value);
    return this.fmt({ month: 'short', year: 'numeric' }).format(value);
  }

  /**
   * A readout of one moment (the tooltip header, the cursor's X): always the date, plus the time
   * of day as finely as the visible ticks need it.
   */
  readoutFormat(value: number): string {
    if (!Number.isFinite(value)) return '';
    const interval = this.interval();
    if (interval >= DAY_MS) {
      // Daily records (midnight) read as a date; an event keeps its time of day.
      const p = parts(value, this.timeZone);
      const midnight = p.h === 0 && p.mi === 0 && p.s === 0 && p.ms === 0;
      return midnight ? this.fmt(MDY).format(value) : this.fmt({ ...MDY, ...HM }).format(value);
    }
    if (interval >= MINUTE_MS) return this.fmt({ ...MD, ...HM }).format(value);
    if (interval >= SECOND_MS) return this.fmt({ ...MD, ...HMS }).format(value);
    return this.fmt({ ...HMS, fractionalSecondDigits: 3 }).format(value);
  }

  nice(_count?: number): void {
    const domain = this.max - this.min;
    const interval = this.pickInterval(domain / 6);
    this.min = Math.floor(this.min / interval) * interval;
    this.max = Math.ceil(this.max / interval) * interval;
  }

  setPixelRange(pxMin: number, pxMax: number): void {
    this.pxMin = pxMin;
    this.pxMax = pxMax;
  }

  private pickInterval(rawStep: number): number {
    // Beyond 1 year: whole nice-year steps.
    if (rawStep > YEAR_MS) {
      const years = rawStep / YEAR_MS;
      const nice = [1, 2, 5, 10, 20, 50, 100].find((y) => y >= years);
      return (nice ?? Math.ceil(years / 100) * 100) * YEAR_MS;
    }
    // Closest interval in log space, not the next larger one: a 14-day
    // domain targeting 6 labels (rawStep 2.3d) picks 2d ticks.
    let best = TIME_INTERVALS[0];
    let bestScore = Number.POSITIVE_INFINITY;
    for (const ms of TIME_INTERVALS) {
      const score = Math.abs(Math.log(ms / rawStep));
      if (score < bestScore) {
        bestScore = score;
        best = ms;
      }
    }
    return best;
  }

  private updateTransformCache(): boolean {
    const domain = this.max - this.min;
    const pxRange = this.pxMax - this.pxMin;
    if (domain === 0 || pxRange === 0) return false;

    if (
      this.cacheMin === this.min &&
      this.cacheMax === this.max &&
      this.cachePxMin === this.pxMin &&
      this.cachePxMax === this.pxMax
    ) {
      return true;
    }

    this.cacheMin = this.min;
    this.cacheMax = this.max;
    this.cachePxMin = this.pxMin;
    this.cachePxMax = this.pxMax;
    this.dataToPxScale = pxRange / domain;
    this.dataToPxOffset = this.pxMin - this.min * this.dataToPxScale;
    this.pxToDataScale = domain / pxRange;
    this.pxToDataOffset = this.min - this.pxMin * this.pxToDataScale;
    return true;
  }
}

/** The runtime's IANA zone (a cache key for local formats; read once per tick pass). */
const localZone = runtimeTimeZone;
