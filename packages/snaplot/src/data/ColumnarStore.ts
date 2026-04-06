import type { ColumnarData } from '../types';
import { viewportIndices } from './binarySearch';

/**
 * ColumnarStore wraps ColumnarData, validates invariants, and provides
 * efficient viewport slicing and streaming append.
 *
 * Per P3: the store never mutates user data. setData() swaps references.
 * append() creates new arrays internally.
 */
export class ColumnarStore {
  private columns: Float64Array[];

  constructor(data: ColumnarData) {
    ColumnarStore.validate(data);
    this.columns = [...data];
  }

  /** Validate: equal column lengths, sorted X (monotonically non-decreasing) */
  static validate(data: ColumnarData): void {
    if (data.length === 0) {
      throw new Error('ColumnarData must have at least one column (X values)');
    }

    const len = data[0].length;
    for (let c = 1; c < data.length; c++) {
      if (data[c].length !== len) {
        throw new Error(
          `Column ${c} length (${data[c].length}) does not match X column length (${len})`,
        );
      }
    }

    // Verify X is sorted (monotonically non-decreasing)
    const x = data[0];
    for (let i = 1; i < x.length; i++) {
      if (x[i] < x[i - 1]) {
        throw new Error(
          `X values must be sorted. Found x[${i}]=${x[i]} < x[${i - 1}]=${x[i - 1]}`,
        );
      }
    }
  }

  /** Get the X column */
  get x(): Float64Array {
    return this.columns[0];
  }

  /** Get a Y column by series index (0-based: 0 = first Y series = columns[1]) */
  y(seriesIdx: number): Float64Array {
    return this.columns[seriesIdx + 1];
  }

  /** Get raw column by absolute index (0 = X, 1+ = Y series) */
  getColumn(index: number): Float64Array {
    return this.columns[index];
  }

  /** Number of data points */
  get length(): number {
    return this.columns[0].length;
  }

  /** Number of Y series (total columns minus the X column) */
  get seriesCount(): number {
    return this.columns.length - 1;
  }

  /** Get all columns as ColumnarData */
  getData(): ColumnarData {
    return this.columns as unknown as ColumnarData;
  }

  /**
   * Get visible indices [left, right] for the given viewport X range.
   * Includes ±1 point for line continuity at edges.
   */
  getViewportIndices(xMin: number, xMax: number): [number, number] {
    return viewportIndices(this.columns[0], xMin, xMax);
  }

  /** Replace all data */
  setData(data: ColumnarData): void {
    ColumnarStore.validate(data);
    this.columns = [...data];
  }

  /**
   * Append new data points for streaming.
   * If maxLen is specified, evicts oldest points to stay within budget.
   */
  append(data: ColumnarData, maxLen?: number): void {
    if (data.length !== this.columns.length) {
      throw new Error(
        `Append data has ${data.length} columns but store has ${this.columns.length}`,
      );
    }

    const addLen = data[0].length;
    if (addLen === 0) return;

    const curLen = this.length;
    const newLen = curLen + addLen;

    if (maxLen !== undefined && newLen > maxLen) {
      // Evict oldest points: keep the most recent (maxLen - addLen) from existing + all new
      const keepFromExisting = Math.max(0, maxLen - addLen);
      const skipFromExisting = curLen - keepFromExisting;

      this.columns = this.columns.map((col, c) => {
        const out = new Float64Array(keepFromExisting + addLen);
        if (keepFromExisting > 0) {
          out.set(col.subarray(skipFromExisting));
        }
        out.set(data[c], keepFromExisting);
        return out;
      });
    } else {
      // Simple concatenation
      this.columns = this.columns.map((col, c) => {
        const out = new Float64Array(newLen);
        out.set(col);
        out.set(data[c], curLen);
        return out;
      });
    }
  }

  /**
   * Compute Y min/max across specified series for the given index range.
   * Returns [min, max]. Skips NaN values.
   */
  yRange(seriesIndices: number[], startIdx: number, endIdx: number): [number, number] {
    let min = Infinity;
    let max = -Infinity;

    for (const si of seriesIndices) {
      const col = this.columns[si + 1];
      if (!col) continue;
      for (let i = startIdx; i <= endIdx && i < col.length; i++) {
        const v = col[i];
        if (v !== v) continue; // NaN
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }

    if (min === Infinity) return [0, 1]; // all NaN fallback
    return [min, max];
  }
}
