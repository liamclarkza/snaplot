import type { Scale, ScaleType } from '../types';

/**
 * Time scale: linear on epoch milliseconds with hierarchical interval
 * selection, calendar-aligned tick generation, and multi-level formatting.
 *
 * Ticks land where a reader expects dates to land: hour-level intervals
 * anchor to the viewer's local midnight, day and week intervals land on
 * local midnights (weeks on Mondays), and month/year intervals walk the
 * real calendar (the 1st of the month, January 1st) instead of stepping
 * fixed 30/365-day widths from the UTC epoch. Remaining approximations:
 * sub-hour timezone offsets and a DST change inside a single hour-stepped
 * day can shift sub-day ticks, and `nice()` still rounds to nominal
 * interval multiples.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
// Nominal widths for month/year entries; used only to pick an interval.
// Tick generation for these walks the actual calendar.
const MONTH_MS = 2_592_000_000;
const YEAR_MS = 31_536_000_000;

// [milliseconds, label]
const TIME_INTERVALS: [number, string][] = [
  [10,               '10ms'],
  [50,               '50ms'],
  [100,              '100ms'],
  [250,              '250ms'],
  [500,              '500ms'],
  [1000,             '1s'],
  [5000,             '5s'],
  [15000,            '15s'],
  [30000,            '30s'],
  [60000,            '1m'],
  [300000,           '5m'],
  [900000,           '15m'],
  [1800000,          '30m'],
  [3600000,          '1h'],
  [10800000,         '3h'],
  [21600000,         '6h'],
  [43200000,         '12h'],
  [86400000,         '1d'],
  [172800000,        '2d'],
  [604800000,        '1w'],
  [1209600000,       '2w'],
  [2592000000,       '1M'],
  [5184000000,       '2M'],
  [7776000000,       '3M'],
  [15552000000,      '6M'],
  [31536000000,      '1y'],
];

export class TimeScale implements Scale {
  readonly type: ScaleType = 'time';
  readonly key: string;
  min: number;
  max: number;
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
   * (about one label per 100px). Ticks land on calendar boundaries in the
   * viewer's local time; the axis fit pass in the renderer may thin them
   * further when the formatted labels are wide.
   */
  ticks(count: number = 6): number[] {
    const pxRange = Math.abs(this.pxMax - this.pxMin);
    if (pxRange <= 0) return [];

    const domain = this.max - this.min;
    if (domain <= 0) return [this.min];

    const widthTarget = Math.max(2, Math.floor(pxRange / 100));
    const targetLabels = Math.max(2, Math.min(count, widthTarget));
    const rawStep = domain / targetLabels;

    // Find the best matching time interval
    const interval = this.pickInterval(rawStep);

    // Generate ticks aligned to the interval
    const ticks = this.alignTicks(interval);
    if (ticks.length >= 2) return ticks;

    // The picked interval straddles the domain: e.g. a 90-day window on a
    // narrow chart picks 2-month ticks, but only one 1st-of-month lands
    // inside. Step down the ladder until at least two aligned boundaries
    // fit, so the axis keeps calendar dates instead of arbitrary ones.
    for (const smaller of this.intervalsBelow(interval)) {
      const stepped = this.alignTicks(smaller);
      if (stepped.length >= 2) return stepped;
    }

    // Safety net: the domain is tighter than the smallest interval (or
    // degenerate). Fall back to an even linear subdivision so the axis
    // always has multiple references.
    const fallbackSteps = Math.max(2, Math.min(targetLabels, 6));
    const fallback: number[] = new Array(fallbackSteps + 1);
    for (let i = 0; i <= fallbackSteps; i++) {
      fallback[i] = this.min + (domain * i) / fallbackSteps;
    }
    return fallback;
  }

  /** Ladder intervals strictly below `interval`, largest first. */
  private *intervalsBelow(interval: number): Generator<number> {
    for (const years of [100, 50, 20, 10, 5, 2, 1]) {
      const ms = years * YEAR_MS;
      if (ms < interval) yield ms;
    }
    for (let i = TIME_INTERVALS.length - 1; i >= 0; i--) {
      const ms = TIME_INTERVALS[i][0];
      if (ms < interval) yield ms;
    }
  }

  private alignTicks(interval: number): number[] {
    if (interval >= YEAR_MS) return this.yearTicks(Math.round(interval / YEAR_MS));
    if (interval >= MONTH_MS) return this.monthTicks(Math.round(interval / MONTH_MS));
    if (interval >= DAY_MS) return this.dayTicks(Math.round(interval / DAY_MS));
    if (interval >= HOUR_MS) return this.hourAnchoredTicks(interval);
    // Sub-hour intervals: epoch multiples divide evenly into local time for
    // whole-hour timezone offsets, so plain alignment reads correctly.
    const start = Math.ceil(this.min / interval) * interval;
    const ticks: number[] = [];
    for (let t = start; t <= this.max; t += interval) {
      ticks.push(t);
    }
    return ticks;
  }

  /**
   * Hour-level intervals anchored to the local midnight of the first
   * visible day, so 6h ticks read 00:00 / 06:00 / 12:00 rather than the
   * UTC-offset residue (02:00 / 08:00 / 14:00 in a UTC+2 zone).
   */
  private hourAnchoredTicks(interval: number): number[] {
    const anchor = new Date(this.min);
    anchor.setHours(0, 0, 0, 0);
    let t = anchor.getTime();
    if (!Number.isFinite(t)) return [];
    t += Math.ceil((this.min - t) / interval) * interval;
    const ticks: number[] = [];
    while (t <= this.max) {
      ticks.push(t);
      t += interval;
    }
    return ticks;
  }

  /** Local midnights stepped by whole days; week steps anchor to Monday. */
  private dayTicks(stepDays: number): number[] {
    const d = new Date(this.min);
    d.setHours(0, 0, 0, 0);
    if (!Number.isFinite(d.getTime())) return [];
    if (d.getTime() < this.min) d.setDate(d.getDate() + 1);
    if (stepDays % 7 === 0) {
      while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    }
    const ticks: number[] = [];
    while (d.getTime() <= this.max) {
      ticks.push(d.getTime());
      d.setDate(d.getDate() + stepDays);
    }
    return ticks;
  }

  /** The 1st of the month at local midnight, on multiples of the step. */
  private monthTicks(stepMonths: number): number[] {
    const d = new Date(this.min);
    if (!Number.isFinite(d.getTime())) return [];
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    // Steps count from January so 3M reads Jan / Apr / Jul / Oct.
    d.setMonth(Math.floor(d.getMonth() / stepMonths) * stepMonths);
    while (d.getTime() < this.min) d.setMonth(d.getMonth() + stepMonths);
    const ticks: number[] = [];
    while (d.getTime() <= this.max) {
      ticks.push(d.getTime());
      d.setMonth(d.getMonth() + stepMonths);
    }
    return ticks;
  }

  /** January 1st at local midnight, on multiples of the step. */
  private yearTicks(stepYears: number): number[] {
    const d = new Date(this.min);
    if (!Number.isFinite(d.getTime())) return [];
    d.setMonth(0, 1);
    d.setHours(0, 0, 0, 0);
    d.setFullYear(Math.floor(d.getFullYear() / stepYears) * stepYears);
    while (d.getTime() < this.min) d.setFullYear(d.getFullYear() + stepYears);
    const ticks: number[] = [];
    while (d.getTime() <= this.max) {
      ticks.push(d.getTime());
      d.setFullYear(d.getFullYear() + stepYears);
    }
    return ticks;
  }

  tickFormat(value: number): string {
    const domain = this.max - this.min;
    const date = new Date(value);

    if (domain < 1000) {
      // < 1 second: show HH:MM:SS.mmm so sub-second ticks are distinguishable.
      const base = date.toLocaleTimeString(undefined, {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
      // Floored-modulo: JS `%` keeps the sign of the dividend, so a pre-1970
      // epoch (negative value) would otherwise yield a negative "sub-second"
      // label like ".-500". Wrap into [0, 999].
      const ms = String(((Math.floor(value) % 1000) + 1000) % 1000).padStart(3, '0');
      return `${base}.${ms}`;
    }
    if (domain < 3600000) {
      // < 1 hour: show HH:MM:SS so per-second precision is visible whenever
      // the visible window is short enough that adjacent minute-only ticks
      // would otherwise read identically.
      return date.toLocaleTimeString(undefined, {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    }
    if (domain < 86400000) {
      // < 1 day: show HH:MM
      return date.toLocaleTimeString(undefined, {
        hour: '2-digit', minute: '2-digit',
      });
    }
    const isLocalMidnight =
      date.getHours() === 0 &&
      date.getMinutes() === 0 &&
      date.getSeconds() === 0 &&
      date.getMilliseconds() === 0;

    if (domain < 2592000000) {
      // < 30 days: Mon DD, with the time only when the tick is not a day
      // boundary. Day-aligned ticks used to render a junk "02:00" suffix
      // (the local rendering of a UTC-aligned midnight).
      const datePart = date.toLocaleDateString(undefined, {
        month: 'short', day: 'numeric',
      });
      if (isLocalMidnight) return datePart;
      return datePart + ' ' + date.toLocaleTimeString(undefined, {
        hour: '2-digit', minute: '2-digit',
      });
    }
    if (domain < 31536000000) {
      // < 1 year: Mon DD; a month boundary reads as the bare month name.
      if (isLocalMidnight && date.getDate() === 1) {
        return date.toLocaleDateString(undefined, { month: 'short' });
      }
      return date.toLocaleDateString(undefined, {
        month: 'short', day: 'numeric',
      });
    }
    // >= 1 year: Mon YYYY; a year boundary reads as the bare year.
    if (isLocalMidnight && date.getMonth() === 0 && date.getDate() === 1) {
      return String(date.getFullYear());
    }
    return date.toLocaleDateString(undefined, {
      year: 'numeric', month: 'short',
    });
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
    // domain targeting 6 labels (rawStep 2.3d) should pick 2d ticks, not
    // jump to weekly and leave the axis nearly empty. Overshoot is capped
    // by the renderer's width fit pass.
    let best = TIME_INTERVALS[0][0];
    let bestScore = Number.POSITIVE_INFINITY;
    for (const [ms] of TIME_INTERVALS) {
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
