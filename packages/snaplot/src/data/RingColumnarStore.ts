import type { ColumnarData } from '../types';
import type { ColumnarSegment, DataStore } from './DataStore';
import { validateMaxLen } from './DataStore';
import { ColumnarStore } from './ColumnarStore';

/**
 * Fixed-capacity columnar ring buffer for streaming charts.
 *
 * Logical indices are always ordered oldest -> newest. Physical storage may
 * wrap, so renderers should prefer getSegments() + getPhysicalColumn() over
 * x/y/getData() when they need the no-copy hot path.
 */
export class RingColumnarStore implements DataStore {
  private columns: Float64Array[] = [];
  private head = 0;
  private len = 0;
  private materialized: Float64Array[] | null = null;

  readonly maxLen: number;

  constructor(data: ColumnarData, maxLen: number) {
    validateMaxLen(maxLen);
    this.maxLen = maxLen;
    this.reset(data);
  }

  get x(): Float64Array {
    return this.getColumn(0);
  }

  y(seriesIdx: number): Float64Array {
    return this.getColumn(seriesIdx + 1);
  }

  getColumn(index: number): Float64Array {
    return this.materialize()[index];
  }

  getPhysicalColumn(index: number): Float64Array {
    return this.columns[index];
  }

  get length(): number {
    return this.len;
  }

  get seriesCount(): number {
    return this.columns.length - 1;
  }

  getData(): ColumnarData {
    return this.materialize() as unknown as ColumnarData;
  }

  setData(data: ColumnarData): void {
    this.reset(data);
  }

  append(data: ColumnarData): boolean {
    ColumnarStore.validate(data);
    this.validateShape(data);

    const addLen = data[0].length;
    if (addLen === 0) return false;

    if (this.len > 0 && data[0][0] < this.xAt(this.len - 1)) {
      throw new Error(
        `append() X values must continue in non-decreasing order, but ` +
          `new x[0] = ${data[0][0]} < current last X = ${this.xAt(this.len - 1)}. ` +
          `Append only newer points, or call setData() with a fully sorted dataset.`,
      );
    }

    if (this.maxLen === 0) return false;

    this.materialized = null;

    if (addLen >= this.maxLen) {
      const skip = addLen - this.maxLen;
      for (let c = 0; c < this.columns.length; c++) {
        this.columns[c].set(data[c].subarray(skip), 0);
      }
      this.head = 0;
      this.len = this.maxLen;
      return true;
    }

    const writeStart = (this.head + this.len) % this.maxLen;
    for (let c = 0; c < this.columns.length; c++) {
      this.writeWrapped(this.columns[c], writeStart, data[c]);
    }

    const overflow = Math.max(0, this.len + addLen - this.maxLen);
    this.head = (this.head + overflow) % this.maxLen;
    this.len = Math.min(this.maxLen, this.len + addLen);
    return true;
  }

  xAt(index: number): number {
    return this.valueAt(0, index);
  }

  yAt(seriesIdx: number, index: number): number {
    return this.valueAt(seriesIdx + 1, index);
  }

  valueAt(columnIdx: number, index: number): number {
    return this.columns[columnIdx][this.physicalIndex(index)];
  }

  lowerBoundX(value: number): number {
    let lo = 0;
    let hi = this.len;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.xAt(mid) < value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  upperBoundX(value: number): number {
    let lo = 0;
    let hi = this.len;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.xAt(mid) <= value) lo = mid + 1;
      else hi = mid;
    }
    return lo - 1;
  }

  nearestXIndex(value: number): number {
    if (this.len === 0) return 0;
    if (this.len === 1) return 0;

    const idx = this.lowerBoundX(value);
    if (idx === 0) return 0;
    if (idx === this.len) return this.len - 1;

    const dPrev = value - this.xAt(idx - 1);
    const dNext = this.xAt(idx) - value;
    return dPrev <= dNext ? idx - 1 : idx;
  }

  getViewportIndices(xMin: number, xMax: number): [number, number] {
    if (this.len === 0) return [0, 0];

    const left = Math.max(0, this.lowerBoundX(xMin) - 1);
    const right = Math.min(this.len - 1, this.upperBoundX(xMax) + 1);
    return [left, right];
  }

  getSegments(startIdx: number, endIdx: number): ColumnarSegment[] {
    if (this.len === 0 || endIdx < startIdx) return [];

    const logicalStart = Math.max(0, startIdx);
    const logicalEnd = Math.min(this.len - 1, endIdx);
    if (logicalEnd < logicalStart) return [];

    const physicalStart = this.physicalIndex(logicalStart);
    const physicalEnd = this.physicalIndex(logicalEnd);

    if (physicalStart <= physicalEnd) {
      return [{
        logicalStart,
        logicalEnd,
        physicalStart,
        physicalEnd,
      }];
    }

    const firstLength = this.maxLen - physicalStart;
    const firstLogicalEnd = logicalStart + firstLength - 1;
    return [
      {
        logicalStart,
        logicalEnd: firstLogicalEnd,
        physicalStart,
        physicalEnd: this.maxLen - 1,
      },
      {
        logicalStart: firstLogicalEnd + 1,
        logicalEnd,
        physicalStart: 0,
        physicalEnd,
      },
    ];
  }

  yRange(seriesIndices: number[], startIdx: number, endIdx: number): [number, number] {
    let min = Infinity;
    let max = -Infinity;

    const start = Math.max(0, startIdx);
    const end = Math.min(this.len - 1, endIdx);
    for (const si of seriesIndices) {
      const col = this.columns[si + 1];
      if (!col) continue;
      for (let i = start; i <= end; i++) {
        const v = col[this.physicalIndex(i)];
        if (!Number.isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }

    if (min === Infinity) return [0, 1];
    return [min, max];
  }

  private reset(data: ColumnarData): void {
    ColumnarStore.validate(data);

    this.columns = data.map(() => new Float64Array(this.maxLen));
    this.head = 0;
    this.len = Math.min(data[0].length, this.maxLen);
    this.materialized = null;

    if (this.len === 0) return;

    const skip = data[0].length - this.len;
    for (let c = 0; c < data.length; c++) {
      this.columns[c].set(data[c].subarray(skip), 0);
    }
  }

  private validateShape(data: ColumnarData): void {
    if (data.length !== this.columns.length) {
      throw new Error(
        `append() expects ${this.columns.length} columns to match the initial ` +
          `data shape, but got ${data.length}. Pass the same number of ` +
          `Float64Arrays you passed to setData/the constructor, one X column ` +
          `plus one per Y series.`,
      );
    }
  }

  private physicalIndex(logicalIndex: number): number {
    return (this.head + logicalIndex) % this.maxLen;
  }

  private writeWrapped(target: Float64Array, start: number, source: Float64Array): void {
    const firstLen = Math.min(source.length, this.maxLen - start);
    target.set(source.subarray(0, firstLen), start);
    if (firstLen < source.length) {
      target.set(source.subarray(firstLen), 0);
    }
  }

  private materialize(): Float64Array[] {
    if (this.materialized) return this.materialized;

    if (this.len === 0) {
      this.materialized = this.columns.map(() => new Float64Array(0));
      return this.materialized;
    }

    if (this.head === 0) {
      this.materialized = this.columns.map((col) => col.subarray(0, this.len));
      return this.materialized;
    }

    this.materialized = this.columns.map((col) => {
      const out = new Float64Array(this.len);
      const firstLen = Math.min(this.len, this.maxLen - this.head);
      out.set(col.subarray(this.head, this.head + firstLen), 0);
      if (firstLen < this.len) {
        out.set(col.subarray(0, this.len - firstLen), firstLen);
      }
      return out;
    });
    return this.materialized;
  }
}
