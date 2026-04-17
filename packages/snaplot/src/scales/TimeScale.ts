import type { Scale, ScaleType } from '../types';

/**
 * Time scale: linear on epoch milliseconds with hierarchical interval
 * selection and multi-level formatting.
 *
 * Intervals: 1s, 5s, 15s, 30s, 1m, 5m, 15m, 30m, 1h, 3h, 6h, 12h, 1d, 1w, 1M, 1y
 * Picks the interval nearest to rawStep without exceeding ~1 label per 80-120px.
 */

// [milliseconds, label]
const TIME_INTERVALS: [number, string][] = [
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
  [604800000,        '1w'],
  [2592000000,       '1M'],
  [31536000000,      '1y'],
];

export class TimeScale implements Scale {
  readonly type: ScaleType = 'time';
  readonly key: string;
  min: number;
  max: number;
  private pxMin = 0;
  private pxMax = 0;

  constructor(key: string, min = 0, max = Date.now()) {
    this.key = key;
    this.min = min;
    this.max = max;
  }

  dataToPixel(value: number): number {
    const domain = this.max - this.min;
    if (domain === 0) return this.pxMin;
    return this.pxMin + ((value - this.min) / domain) * (this.pxMax - this.pxMin);
  }

  pixelToData(pixel: number): number {
    const pxRange = this.pxMax - this.pxMin;
    if (pxRange === 0) return this.min;
    return this.min + ((pixel - this.pxMin) / pxRange) * (this.max - this.min);
  }

  // `count` matches the Scale interface but TimeScale sizes its ticks from
  // the available pixel width instead, so one label per ~100px at the
  // current zoom. The param stays in the signature for interface conformance.
  ticks(_count: number = 6): number[] {
    const pxRange = this.pxMax - this.pxMin;
    if (pxRange <= 0) return [];

    const domain = this.max - this.min;
    if (domain <= 0) return [this.min];

    // Target ~1 label per 100px
    const targetLabels = Math.max(2, Math.floor(pxRange / 100));
    const rawStep = domain / targetLabels;

    // Find the best matching time interval
    const interval = this.pickInterval(rawStep);

    // Generate ticks aligned to the interval
    const start = Math.ceil(this.min / interval) * interval;
    const ticks: number[] = [];
    for (let t = start; t <= this.max; t += interval) {
      ticks.push(t);
    }

    return ticks;
  }

  tickFormat(value: number): string {
    const domain = this.max - this.min;
    const date = new Date(value);

    if (domain < 60000) {
      // < 1 minute: show seconds.millis
      return date.toLocaleTimeString(undefined, {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    }
    if (domain < 3600000) {
      // < 1 hour: show HH:MM
      return date.toLocaleTimeString(undefined, {
        hour: '2-digit', minute: '2-digit',
      });
    }
    if (domain < 86400000) {
      // < 1 day: show HH:MM
      return date.toLocaleTimeString(undefined, {
        hour: '2-digit', minute: '2-digit',
      });
    }
    if (domain < 2592000000) {
      // < 30 days: show Mon DD HH:MM
      return date.toLocaleDateString(undefined, {
        month: 'short', day: 'numeric',
      }) + ' ' + date.toLocaleTimeString(undefined, {
        hour: '2-digit', minute: '2-digit',
      });
    }
    if (domain < 31536000000) {
      // < 1 year: show Mon DD
      return date.toLocaleDateString(undefined, {
        month: 'short', day: 'numeric',
      });
    }
    // >= 1 year: show YYYY-MM
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
    for (const [ms] of TIME_INTERVALS) {
      if (ms >= rawStep) return ms;
    }
    // Beyond 1 year: use multiples of years
    return Math.ceil(rawStep / 31536000000) * 31536000000;
  }
}
