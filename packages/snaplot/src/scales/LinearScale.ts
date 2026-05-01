import type { Scale, ScaleType } from '../types';
import { niceTicks, niceRange, niceStep } from './niceNumbers';
import { DEFAULT_TICK_COUNT } from '../constants';

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
    return niceTicks(this.min, this.max, count);
  }

  tickFormat(value: number): string {
    // Derive precision from the nice step the ticks actually use, and apply
    // the same decimal count to every value so ticks line up visually.
    // Previously integer-valued ticks short-circuited to "6" while their
    // neighbours rendered as "6.20" / "6.40", breaking the column.
    const step = niceStep(this.min, this.max, DEFAULT_TICK_COUNT);
    if (step === 0 || !Number.isFinite(step)) return String(value);

    const absStep = Math.abs(step);

    // Integer step >= 1: format every tick as an integer.
    if (absStep >= 1 && Math.abs(absStep - Math.round(absStep)) < 1e-9) {
      return String(Math.round(value));
    }

    // Fractional step: pad one extra decimal past the step's magnitude so
    // adjacent ticks stay visually distinguishable (0.2 step -> 2 decimals).
    const decimals = Math.max(1, -Math.floor(Math.log10(absStep)) + 1);
    return value.toFixed(Math.min(decimals, 8));
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
