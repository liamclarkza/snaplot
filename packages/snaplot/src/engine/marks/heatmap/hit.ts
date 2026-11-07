/**
 * The heatmap mark's hit half: a slot mark that leads the tooltip (rank 3). The cell under the
 * pointer is its point (its X and Y centres and spans, and its value), a click lands inside a
 * cell, and the hover indicator outlines the cell.
 */
import type { ChartCore } from '../../Engine';
import { formatCellValue, formatX } from '../../format';
import type { MarkHit } from '../../hit';
import type { ScaleRange, TooltipPoint } from '../../spec';
import { cellAt, gridScales, rowSpans } from './cells';
import { colorMapping, colorOf } from './colors';

/** The cell of heatmap series `si` under a plot pixel, or null where there is no value. */
export function cellUnder(
  engine: ChartCore,
  si: number,
  pixelX: number,
  pixelY: number,
): TooltipPoint | null {
  const series = engine.config.series[si];
  const spec = series?.heatmap;
  if (!spec || series.visible === false) return null;
  const store = engine.storeForSeries(si);
  const xScale = engine.scales.get(series.xAxis ?? 'x');
  const yScale = engine.scales.get(series.yAxis ?? 'y');
  if (!xScale || !yScale || store.length === 0) return null;
  const { rowScale, binScale } = gridScales(spec, xScale, yScale);
  const across = spec.rows === 'x';
  const bins = spec.binLo.length;
  const bin = cellAt(spec.binLo, spec.binHi, bins, binScale.pixelToData(across ? pixelY : pixelX));
  if (bin < 0) return null;
  // The rows either side of the position, with their spans.
  const position = rowScale.pixelToData(across ? pixelX : pixelY);
  const near = store.upperBoundX(position);
  const from = Math.max(0, near);
  const to = Math.min(store.length - 1, near + 1);
  const lo = new Float64Array(2);
  const hi = new Float64Array(2);
  rowSpans(store, spec, from, to, lo, hi);
  const k = cellAt(lo, hi, to - from + 1, position);
  if (k < 0) return null;
  const row = from + k;
  const first = series.yColumn ?? 1;
  if (first + bin > store.seriesCount) return null;
  const value = store.valueAt(first + bin, row);
  if (!Number.isFinite(value)) return null;

  // A lone row's span is unbounded: the cell is the window.
  const rowRange: ScaleRange = {
    min: Number.isFinite(lo[k]) ? lo[k] : Math.min(rowScale.min, rowScale.max),
    max: Number.isFinite(hi[k]) ? hi[k] : Math.max(rowScale.min, rowScale.max),
  };
  const binRange: ScaleRange = { min: spec.binLo[bin], max: spec.binHi[bin] };
  const rowAt = store.xAt(row);
  const binAt = spec.binMid[bin];
  const mapping = colorMapping(engine, si);
  const x = across ? rowAt : binAt;
  const y = across ? binAt : rowAt;
  const xAxis = series.xAxis ?? 'x';
  const yAxis = series.yAxis ?? 'y';
  return {
    seriesIndex: si,
    dataIndex: row,
    bin,
    label: series.label,
    x,
    y,
    xRange: across ? rowRange : binRange,
    yRange: across ? binRange : rowRange,
    value,
    color: colorOf(mapping, value),
    formattedX: formatX(engine, x, xAxis),
    formattedY: formatX(engine, y, yAxis),
    formattedValue: formatCellValue(engine, si, value, [mapping.min, mapping.max]),
    xName: engine.config.axes?.[xAxis]?.title,
    yName: engine.config.axes?.[yAxis]?.title,
  };
}

/** The cell under the cursor: the pointer's own position on a chart it is over. */
function heatmapPoint(engine: ChartCore, si: number): TooltipPoint | null {
  const x = engine.mouseX ?? engine.cursorX;
  const y = engine.mouseY ?? engine.cursorY;
  if (x === null || y === null || !engine.cursorIsLocal) return null;
  return cellUnder(engine, si, x, y);
}

export const heatmapHit: MarkHit = {
  tooltipRank: 3,
  slotPoint: heatmapPoint,
  slotSpan: (_engine, point, xScale) =>
    point.xRange
      ? [xScale.dataToPixel(point.xRange.min), xScale.dataToPixel(point.xRange.max)]
      : [Number.NaN, Number.NaN],
  contains(engine, point, pixelX, pixelY) {
    const hit = cellUnder(engine, point.seriesIndex, pixelX, pixelY);
    return hit !== null && hit.dataIndex === point.dataIndex && hit.bin === point.bin;
  },
  indicator({ engine, ctx, point, xScale, yScale }) {
    if (!point.xRange || !point.yRange) return;
    const { plot } = engine.layout;
    const x0 = Math.max(
      plot.left,
      Math.min(xScale.dataToPixel(point.xRange.min), xScale.dataToPixel(point.xRange.max)),
    );
    const x1 = Math.min(
      plot.left + plot.width,
      Math.max(xScale.dataToPixel(point.xRange.min), xScale.dataToPixel(point.xRange.max)),
    );
    const y0 = Math.max(
      plot.top,
      Math.min(yScale.dataToPixel(point.yRange.min), yScale.dataToPixel(point.yRange.max)),
    );
    const y1 = Math.min(
      plot.top + plot.height,
      Math.max(yScale.dataToPixel(point.yRange.min), yScale.dataToPixel(point.yRange.max)),
    );
    if (!(x1 > x0 && y1 > y0)) return;
    // Two rings, the surface outside the text colour, so the outline reads on any cell colour.
    const surface = engine.theme.surfaceColor ?? '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeStyle = surface;
    ctx.strokeRect(x0 - 1.5, y0 - 1.5, x1 - x0 + 3, y1 - y0 + 3);
    ctx.strokeStyle = engine.theme.textColor;
    ctx.strokeRect(x0 - 0.5, y0 - 0.5, x1 - x0 + 1, y1 - y0 + 1);
  },
};
