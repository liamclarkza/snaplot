import { cachedNumberFormat, stepDecimals } from '../format';
import type { Scale, ScaleType } from '../spec';
import { niceTicks, niceRange, niceStep } from './niceNumbers';
import { DEFAULT_TICK_COUNT } from '../../constants';

/**
 * Linear scale: maps data values to pixel coordinates via linear interpolation.
 * dataToPixel(v) = pxMin + (v - min) / (max - min) * (pxMax - pxMin)
 */
export class LinearScale implements Scale {
  readonly type: ScaleType = 'linear';
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
  // Spacing of the ticks last produced by ticks(). tickFormat derives its
  // decimal precision from this so labels match whatever count was requested,
  // not a fixed DEFAULT_TICK_COUNT assumption. NaN until ticks() has run.
  private lastTickStep = Number.NaN;
  // Tick labels by value, in `labelsDecimals` and `labelsLocale`: a stream or a pan labels the
  // same values frame after frame.
  private labels = new Map<number, string>();
  private labelsDecimals = -1;
  private labelsLocale: string | undefined = undefined;

  constructor(key: string, min = 0, max = 1) {
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

  ticks(count: number = DEFAULT_TICK_COUNT): number[] {
    const ticks = niceTicks(this.min, this.max, count);
    // Remember the actual spacing so tickFormat can pick a matching precision.
    // The integer fast-path and the subdivision fallback both produce spacings
    // that niceStep(min, max, DEFAULT_TICK_COUNT) would not predict.
    this.lastTickStep = ticks.length >= 2 ? ticks[1] - ticks[0] : Number.NaN;
    return ticks;
  }

  /** Ticks are multiples of the step, so a tick's number is how many steps it is from zero. */
  tickOrdinal(value: number): number {
    return Math.round(value / this.lastTickStep);
  }

  /** BCP 47 locale of tick labels; the runtime default when unset (plan D7). */
  locale: string | undefined = undefined;

  tickFormat(value: number): string {
    // Every tick of one axis gets the decimals of the step the last ticks() call used, so the
    // column lines up and adjacent ticks differ: 0.2 → 1, 0.25 → 2, 5 → 0. Grouped, one locale.
    const step = Number.isFinite(this.lastTickStep)
      ? this.lastTickStep
      : niceStep(this.min, this.max, DEFAULT_TICK_COUNT);
    if (step === 0 || !Number.isFinite(step)) return String(value);
    const rounded = Math.abs(value) < Math.abs(step) * 1e-9 ? 0 : value;
    // Values under a ten-thousandth or past a quadrillion are unreadable in positional digits:
    // write them in exponent form with the mantissa decimals the step needs (1.5e-13, 2.0e-13).
    const magnitude = Math.max(Math.abs(this.min), Math.abs(this.max));
    if (magnitude < 1e-4 || magnitude >= 1e15) {
      if (rounded === 0) return '0';
      const exponent = Math.floor(Math.log10(Math.abs(rounded)));
      return rounded.toExponential(Math.min(6, stepDecimals(step / 10 ** exponent)));
    }
    const decimals = Math.min(20, stepDecimals(step));
    if (decimals !== this.labelsDecimals || this.locale !== this.labelsLocale) {
      this.labels.clear();
      this.labelsDecimals = decimals;
      this.labelsLocale = this.locale;
    }
    // -0 (a tick rounded from just below zero) reads as 0.
    const key = rounded === 0 ? 0 : rounded;
    let label = this.labels.get(key);
    if (label === undefined) {
      label = tickNumberFormat(this.locale, decimals).format(key);
      if (this.labels.size >= LABELS_MAX) this.labels.clear();
      this.labels.set(key, label);
    }
    return label;
  }

  nice(count: number = DEFAULT_TICK_COUNT): void {
    const [nMin, nMax] = niceRange(this.min, this.max, count);
    this.min = nMin;
    this.max = nMax;
  }

  setPixelRange(pxMin: number, pxMax: number): void {
    this.pxMin = pxMin;
    this.pxMax = pxMax;
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

const LABELS_MAX = 512;

/** A cached fixed-decimals number format for tick labels. */
export function tickNumberFormat(locale: string | undefined, decimals: number): Intl.NumberFormat {
  return cachedNumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
