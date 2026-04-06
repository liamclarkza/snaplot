import type { Scale, ScaleType } from '../types';
import { niceTicks, niceRange } from './niceNumbers';
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

  constructor(key: string, min = 0, max = 1) {
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

  ticks(count: number = DEFAULT_TICK_COUNT): number[] {
    return niceTicks(this.min, this.max, count);
  }

  tickFormat(value: number): string {
    // If the value is effectively an integer, show it as one
    if (Number.isInteger(value) || Math.abs(value - Math.round(value)) < 1e-9) {
      return String(Math.round(value));
    }

    // Determine appropriate precision from the step size
    const step = (this.max - this.min) / DEFAULT_TICK_COUNT;
    if (step === 0) return String(value);

    const absStep = Math.abs(step);
    if (absStep >= 1) {
      return value.toFixed(1);
    }

    const decimals = Math.max(0, -Math.floor(Math.log10(absStep)) + 1);
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
}
