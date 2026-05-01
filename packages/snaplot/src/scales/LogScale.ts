import type { Scale, ScaleType } from '../types';

/**
 * Logarithmic scale: maps data values to pixel coordinates via log10.
 * Ticks are placed at powers of 10.
 */
export class LogScale implements Scale {
  readonly type: ScaleType = 'log';
  readonly key: string;
  min: number;
  max: number;
  private pxMin = 0;
  private pxMax = 0;
  private cacheMin = Number.NaN;
  private cacheMax = Number.NaN;
  private cachePxMin = Number.NaN;
  private cachePxMax = Number.NaN;
  private logMin = 0;
  private dataToPxScale = 0;
  private pxToLogScale = 0;

  /** Minimum positive value to clamp to (avoid log(0)) */
  private static readonly EPSILON = 1e-10;

  constructor(key: string, min = 1, max = 1000) {
    this.key = key;
    this.min = Math.max(min, LogScale.EPSILON);
    this.max = Math.max(max, LogScale.EPSILON);
  }

  private log(v: number): number {
    return Math.log10(Math.max(v, LogScale.EPSILON));
  }

  dataToPixel(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return Number.NaN;
    if (!this.updateTransformCache()) return this.pxMin;
    return this.pxMin + (this.log(value) - this.logMin) * this.dataToPxScale;
  }

  pixelToData(pixel: number): number {
    if (!this.updateTransformCache()) return this.min;
    const logValue = this.logMin + (pixel - this.pxMin) * this.pxToLogScale;
    return Math.pow(10, logValue);
  }

  ticks(_count?: number): number[] {
    const logMin = Math.floor(this.log(this.min));
    const logMax = Math.ceil(this.log(this.max));
    const ticks: number[] = [];

    for (let exp = logMin; exp <= logMax; exp++) {
      const base = Math.pow(10, exp);
      ticks.push(base);

      // Add sub-ticks (2, 5) if range is small enough
      if (logMax - logMin <= 3) {
        if (base * 2 <= this.max && base * 2 >= this.min) ticks.push(base * 2);
        if (base * 5 <= this.max && base * 5 >= this.min) ticks.push(base * 5);
      }
    }

    return ticks.filter(t => t >= this.min && t <= this.max).sort((a, b) => a - b);
  }

  tickFormat(value: number): string {
    if (value >= 1e6) return value.toExponential(0);
    if (value >= 1) return String(Math.round(value));
    if (value >= 0.01) return value.toFixed(2);
    return value.toExponential(0);
  }

  nice(_count?: number): void {
    this.min = Math.pow(10, Math.floor(this.log(this.min)));
    this.max = Math.pow(10, Math.ceil(this.log(this.max)));
  }

  setPixelRange(pxMin: number, pxMax: number): void {
    this.pxMin = pxMin;
    this.pxMax = pxMax;
  }

  private updateTransformCache(): boolean {
    const logMin = this.log(this.min);
    const logMax = this.log(this.max);
    const logDomain = logMax - logMin;
    const pxRange = this.pxMax - this.pxMin;
    if (logDomain === 0 || pxRange === 0) return false;

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
    this.logMin = logMin;
    this.dataToPxScale = pxRange / logDomain;
    this.pxToLogScale = logDomain / pxRange;
    return true;
  }
}
