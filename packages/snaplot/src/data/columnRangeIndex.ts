import { lowerBound, upperBound } from './binarySearch';

/**
 * Block-aggregated min/max over a Float64Array column.
 *
 * Vertical auto-range runs on every pan/zoom frame and previously scanned
 * every visible point per series per frame. This index answers the same
 * query from per-block aggregates: O(n / BLOCK + BLOCK) per query after an
 * O(n) build, which is what makes "zoom X, Y follows" affordable during a
 * gesture on large data.
 *
 * The index snapshots nothing: it reads the column at build time, so it is
 * only valid for one data version. Callers rebuild (lazily) when data
 * changes.
 */
const BLOCK = 256;

export class ColumnRangeIndex {
  private readonly mins: Float64Array;
  private readonly maxs: Float64Array;
  /** Min over strictly positive values per block; +Infinity when none. */
  private readonly positiveMins: Float64Array;

  constructor(private readonly column: Float64Array) {
    const blockCount = Math.ceil(column.length / BLOCK) || 1;
    this.mins = new Float64Array(blockCount).fill(Number.POSITIVE_INFINITY);
    this.maxs = new Float64Array(blockCount).fill(Number.NEGATIVE_INFINITY);
    this.positiveMins = new Float64Array(blockCount).fill(Number.POSITIVE_INFINITY);

    for (let b = 0; b < blockCount; b++) {
      const start = b * BLOCK;
      const end = Math.min(start + BLOCK, column.length);
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      let positiveMin = Number.POSITIVE_INFINITY;
      for (let i = start; i < end; i++) {
        const v = column[i];
        if (!Number.isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
        if (v > 0 && v < positiveMin) positiveMin = v;
      }
      this.mins[b] = min;
      this.maxs[b] = max;
      this.positiveMins[b] = positiveMin;
    }
  }

  /**
   * Min/max of finite values in [start, end] (inclusive). With
   * `positiveOnly` (log scales), values <= 0 are excluded from both
   * bounds, matching the direct-scan semantics in vertical auto-range.
   * Returns null when the range holds no qualifying value.
   */
  query(start: number, end: number, positiveOnly: boolean): [number, number] | null {
    start = Math.max(0, start);
    end = Math.min(this.column.length - 1, end);
    if (end < start) return null;

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    const scan = (from: number, to: number) => {
      for (let i = from; i <= to; i++) {
        const v = this.column[i];
        if (!Number.isFinite(v) || (positiveOnly && v <= 0)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    };

    const firstBlock = Math.floor(start / BLOCK);
    const lastBlock = Math.floor(end / BLOCK);

    if (firstBlock === lastBlock) {
      scan(start, end);
    } else {
      scan(start, (firstBlock + 1) * BLOCK - 1);
      for (let b = firstBlock + 1; b < lastBlock; b++) {
        if (positiveOnly) {
          if (this.positiveMins[b] === Number.POSITIVE_INFINITY) continue;
          // A block with any positive value has a positive max, because
          // max >= that positive value.
          if (this.positiveMins[b] < min) min = this.positiveMins[b];
          if (this.maxs[b] > max) max = this.maxs[b];
        } else {
          if (this.mins[b] < min) min = this.mins[b];
          if (this.maxs[b] > max) max = this.maxs[b];
        }
      }
      scan(lastBlock * BLOCK, end);
    }

    return min === Number.POSITIVE_INFINITY ? null : [min, max];
  }
}

/**
 * Range index for scatter series whose X column is not the sorted column 0.
 *
 * Sorting an index permutation by X once per data version turns the
 * per-frame "Y extent of points inside the X viewport" query from a full
 * O(n) scan into binary search plus a block-aggregate query. The permuted
 * Y copy exists so the block aggregates cover contiguous memory.
 */
export class ScatterColumnRangeIndex {
  private readonly sortedX: Float64Array;
  private readonly permutedY: Float64Array;
  private readonly yIndex: ColumnRangeIndex;
  private readonly finiteCount: number;

  constructor(xColumn: Float64Array, yColumn: Float64Array) {
    const n = Math.min(xColumn.length, yColumn.length);
    const order = new Uint32Array(n);
    for (let i = 0; i < n; i++) order[i] = i;
    // Non-finite X sorts to the tail and is excluded from queries.
    const sorted = Array.from(order).sort((a, b) => {
      const xa = xColumn[a];
      const xb = xColumn[b];
      const fa = Number.isFinite(xa);
      const fb = Number.isFinite(xb);
      if (fa && fb) return xa - xb;
      if (fa) return -1;
      if (fb) return 1;
      return 0;
    });

    let finiteCount = 0;
    this.sortedX = new Float64Array(n);
    this.permutedY = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const src = sorted[i];
      this.sortedX[i] = xColumn[src];
      this.permutedY[i] = yColumn[src];
      if (Number.isFinite(xColumn[src])) finiteCount = i + 1;
    }
    this.finiteCount = finiteCount;
    this.yIndex = new ColumnRangeIndex(this.permutedY);
  }

  /** Y extent of points whose X lies in [xMin, xMax]. */
  query(xMin: number, xMax: number, positiveOnly: boolean): [number, number] | null {
    if (this.finiteCount === 0) return null;
    const finite = this.sortedX.subarray(0, this.finiteCount);
    const start = lowerBound(finite, xMin);
    const end = upperBound(finite, xMax) - 1;
    if (end < start) return null;
    return this.yIndex.query(start, end, positiveOnly);
  }
}
