/**
 * A heatmap's slice as the chart reports it: `getSlice()` (one row of cells, at the cursor or at a
 * position) and `sliceBins()`, which turns a slice into the bins a histogram series draws, for a
 * second chart of the distribution under the cursor.
 */
import { fail, hint } from '../engine/errors';
import { formatX } from '../engine/format';
import { rowAt } from '../engine/marks/heatmap/cells';
import { cursorRow, readRow } from '../engine/marks/index';
import { toNumber } from './checks';
import type { PointView } from './points';
import type { HeatmapSlice, HistogramBins, SliceOptions } from './types';

/** The heatmap series `getSlice()` reads: the one named, else the chart's first. */
function heatmapIndex<Row>(view: PointView<Row>, id: string | undefined): number {
  const series = view.engine.config.series;
  if (id === undefined) {
    const first = series.findIndex((s) => s.heatmap);
    if (first < 0) fail('getSlice() reads a heatmap series, and this chart has none.');
    return first;
  }
  const si = view.ingested.seriesIds.indexOf(id);
  if (si < 0)
    fail(`getSlice() got "${id}", which is not a series.${hint(id, view.ingested.seriesIds)}`);
  if (!series[si].heatmap) fail(`getSlice() got "${id}", which is not a heatmap series.`);
  return si;
}

export function heatmapSlice<Row>(
  view: PointView<Row>,
  seriesId?: string,
  options: SliceOptions = {},
): HeatmapSlice<Row> | null {
  const { engine } = view;
  const si = heatmapIndex(view, seriesId);
  const series = engine.config.series[si];
  const spec = series.heatmap!;
  const store = engine.storeForSeries(si);
  if (store.length === 0) return null;

  let row = -1;
  let source: HeatmapSlice['source'] = 'position';
  if (options.at !== undefined) {
    row = rowAt(store, spec, toNumber(options.at, 'getSlice() at'));
  } else {
    const fallback = options.fallback ?? 'hide';
    if (fallback !== 'hide' && fallback !== 'latest' && fallback !== 'first')
      fail(`getSlice() fallback must be 'hide', 'latest' or 'first', not ${String(fallback)}.`);
    row = cursorRow(engine, si) ?? -1;
    source = 'cursor';
    if (row < 0 && fallback !== 'hide') {
      row = fallback === 'latest' ? store.length - 1 : 0;
      source = fallback;
    }
  }
  if (row < 0) return null;

  const values = new Float64Array(spec.binLo.length);
  readRow(engine, si, row, values);
  const position = store.xAt(row);
  const origin = view.ingested.sources[view.ingested.seriesSources[si]];
  const at = origin.head + row;
  return {
    seriesId: view.ingested.seriesIds[si],
    position,
    formattedPosition: formatX(
      engine,
      position,
      spec.rows === 'x' ? (series.xAxis ?? 'x') : (series.yAxis ?? 'y'),
    ),
    row: origin.rows?.[at],
    rowIndex: origin.index ? (origin.index[at] ?? row) : origin.evicted + row,
    values,
    bins: { min: spec.binLo.slice(), max: spec.binHi.slice() },
    source,
  };
}

/**
 * A slice's cells as the bins of a histogram series: the distribution under the cursor of one
 * chart, drawn by another. A gap between two cells becomes an empty bin, and an empty cell or a
 * value below zero counts as 0, as a histogram has no other way to draw them.
 *
 * @example
 * ```ts
 * heatmap.on('cursor:change', () => {
 *   const slice = heatmap.getSlice('latency', { fallback: 'latest' });
 *   if (slice)
 *     detail.update({ series: [{ type: 'histogram', id: 'slice', data: sliceBins(slice) }] });
 * });
 * ```
 */
export function sliceBins(slice: Pick<HeatmapSlice, 'values' | 'bins'>): HistogramBins {
  if (!slice?.bins || !slice.values)
    fail('sliceBins() takes a slice from getSlice(); check it is not null first.');
  const { min, max } = slice.bins;
  const edges: number[] = [];
  const counts: number[] = [];
  let maxCount = 0;
  for (let i = 0; i < min.length; i++) {
    if (i === 0) edges.push(min[i]);
    else if (min[i] > max[i - 1]) {
      counts.push(0);
      edges.push(min[i]);
    }
    const count = slice.values[i] > 0 ? slice.values[i] : 0;
    if (count > maxCount) maxCount = count;
    counts.push(count);
    edges.push(max[i]);
  }
  return { edges: Float64Array.from(edges), counts: Float64Array.from(counts), maxCount };
}
