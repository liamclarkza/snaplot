/**
 * Where a series reads its values, and the store's runs as the segments a mark draws. A leaf
 * module: the marks (`<type>/draw.ts`, `<type>/hit.ts`) and the engine modules share it, and it
 * imports nothing at run time.
 */
import type { ColumnarSegment } from '../data/DataStore';
import type { SeriesSpec } from '../spec';

/** The extra columns of a mark that spans only its value column (`MarkDraw.extentColumns`). */
export const NO_COLUMNS: readonly number[] = Object.freeze([]);

/** The store column of the series' value (`yColumn`; the counts of a histogram), or -1. */
export function seriesYColumn(series: SeriesSpec): number {
  return series.yColumn ?? -1;
}

/**
 * A run of points in a store's physical columns, as the marks draw it: `startIdx` to `endIdx`
 * (inclusive) of `xData` and `yData`, with the scatter colour and size columns when a series
 * encodes them. M4 decimation hands the line marks copies without the extra columns.
 */
export interface RenderSegment {
  xData: Float64Array;
  yData: Float64Array;
  colorData?: Float64Array;
  sizeData?: Float64Array;
  startIdx: number;
  endIdx: number;
  /**
   * The logical index of `startIdx`'s datum. Ring stores wrap, so a physical position is not the
   * index the datum was appended at; per-datum callbacks (a bar `fill`) receive logical indices.
   */
  logicalStartIdx?: number;
}

export function toRenderSegments(
  segments: ColumnarSegment[],
  xData: Float64Array,
  yData: Float64Array,
  colorData?: Float64Array,
  sizeData?: Float64Array,
): RenderSegment[] {
  return segments.map((segment) => ({
    xData,
    yData,
    colorData,
    sizeData,
    startIdx: segment.physicalStart,
    endIdx: segment.physicalEnd,
    // Ring stores wrap: per-datum callbacks (bar fill) receive logical
    // indices, so carry the logical origin of each physical run.
    logicalStartIdx: segment.logicalStart,
  }));
}
