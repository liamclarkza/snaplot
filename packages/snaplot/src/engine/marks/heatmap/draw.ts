/**
 * The heatmap mark's draw half: a grid of cells coloured by value. Rows run along one axis (the
 * store's X column holds each row's position) and bins across the other (one store column per
 * bin). The plot is drawn per device pixel into a bitmap: each pixel column and row looks up the
 * cell it shows once, a run of pixels in one cell is one fill, and a pixel row showing the same
 * cells as the one above is a copy, so a frame costs about the plot's pixels whatever the grid's
 * size, and any scale (log, time, a zoomed or panned window) and any gap draws the same way.
 */
import type { ChartCore } from '../../Engine';
import type { DataStore } from '../../data/DataStore';
import { context2d } from '../../render/surface';
import type { HeatmapSpec, Scale, SeriesSpec } from '../../spec';
import type { MarkDraw, SeriesPass } from '../index';
import { NO_COLUMNS } from '../columns';
import { gridScales, pixelCells, rowSpans, rowWindow } from './cells';
import { type ColorMapping, colorMapping, pixelOf } from './colors';

/** One heatmap series' bitmap and what it was drawn for. */
interface Bitmap {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  image: ImageData | null;
  pixels: Uint32Array | null;
  key: string;
  spec: HeatmapSpec | null;
  mapping: ColorMapping | null;
}

const bitmaps = new WeakMap<ChartCore, Map<number, Bitmap>>();

function bitmapOf(engine: ChartCore, seriesIndex: number): Bitmap {
  let byChart = bitmaps.get(engine);
  if (!byChart) bitmaps.set(engine, (byChart = new Map()));
  let bitmap = byChart.get(seriesIndex);
  if (!bitmap) {
    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(1, 1)
        : document.createElement('canvas');
    bitmap = {
      canvas,
      context: context2d(canvas),
      image: null,
      pixels: null,
      key: '',
      spec: null,
      mapping: null,
    };
    byChart.set(seriesIndex, bitmap);
  }
  return bitmap;
}

/**
 * Fill `pixels` (`width` × `height`, row by row from the top) with the cells the plot shows:
 * `columns[p]` is the cell index along the image's width for pixel column p, `rows[q]` along its
 * height, -1 for none. `colorRow(v, out)` packs the colours of every cell across at index `v`
 * into `out` (one call per distinct pixel row). Pixels outside every cell are 0 (transparent).
 */
export function fillCells(
  pixels: Uint32Array,
  width: number,
  height: number,
  columns: Int32Array,
  rows: Int32Array,
  across: number,
  colorRow: (v: number, out: Uint32Array) => void,
): void {
  // Runs of pixel columns showing one cell: a cell is one write per pixel row.
  const runStart: number[] = [];
  const runCell: number[] = [];
  for (let p = 0; p < width; p++) {
    if (p === 0 || columns[p] !== columns[p - 1]) {
      runStart.push(p);
      runCell.push(columns[p]);
    }
  }
  runStart.push(width);
  const colors = new Uint32Array(across);
  for (let q = 0; q < height; q++) {
    const v = rows[q];
    const base = q * width;
    if (q > 0 && v === rows[q - 1]) {
      pixels.copyWithin(base, base - width, base);
      continue;
    }
    if (v < 0) {
      pixels.fill(0, base, base + width);
      continue;
    }
    colorRow(v, colors);
    for (let k = 0; k < runCell.length; k++) {
      const h = runCell[k];
      const color = h < 0 ? 0 : colors[h];
      const end = base + runStart[k + 1];
      let p = base + runStart[k];
      // Most cells are a few pixels wide: a loop beats fill()'s call there.
      if (end - p > 16) pixels.fill(color, p, end);
      else for (; p < end; p++) pixels[p] = color;
    }
  }
}

/** Draw one heatmap series' cells into its bitmap, sized to the plot in device pixels. */
function rasterize(
  engine: ChartCore,
  bitmap: Bitmap,
  series: SeriesSpec,
  spec: HeatmapSpec,
  store: DataStore,
  mapping: ColorMapping,
  xScale: Scale,
  yScale: Scale,
  width: number,
  height: number,
): void {
  const { plot } = engine.layout;
  if (bitmap.canvas.width !== width || bitmap.canvas.height !== height || !bitmap.image) {
    bitmap.canvas.width = width;
    bitmap.canvas.height = height;
    bitmap.image = bitmap.context.createImageData(width, height) ?? null;
    bitmap.pixels = bitmap.image?.data ? new Uint32Array(bitmap.image.data.buffer) : null;
  }
  const pixels = bitmap.pixels;
  if (!pixels || !bitmap.image) return;

  const { rowScale, binScale } = gridScales(spec, xScale, yScale);
  const { from, to } = rowWindow(
    store,
    Math.min(rowScale.min, rowScale.max),
    Math.max(rowScale.min, rowScale.max),
  );
  const count = Math.max(0, to - from + 1);
  const lo = new Float64Array(count);
  const hi = new Float64Array(count);
  rowSpans(store, spec, from, to, lo, hi);
  // The physical slot of each row in the window: a ring store wraps.
  const slot = new Int32Array(count);
  if (count > 0)
    for (const segment of store.getSegments(from, to))
      for (let i = segment.logicalStart; i <= segment.logicalEnd; i++)
        slot[i - from] = segment.physicalStart + (i - segment.logicalStart);
  const bins = spec.binLo.length;
  const first = series.yColumn ?? 1;
  const columns: Float64Array[] = [];
  for (let b = 0; b < bins; b++)
    columns.push(
      first + b <= store.seriesCount ? store.getPhysicalColumn(first + b) : new Float64Array(0),
    );

  const across = spec.rows === 'x';
  const rowCells = pixelCells(
    lo,
    hi,
    count,
    rowScale,
    across ? plot.left : plot.top,
    across ? plot.width : plot.height,
    new Int32Array(across ? width : height),
  );
  const binCells = pixelCells(
    spec.binLo,
    spec.binHi,
    bins,
    binScale,
    across ? plot.top : plot.left,
    across ? plot.height : plot.width,
    new Int32Array(across ? height : width),
  );
  const span = mapping.max - mapping.min;
  const scale = span === 0 ? 0 : 1 / span;
  fillCells(
    pixels,
    width,
    height,
    across ? rowCells : binCells,
    across ? binCells : rowCells,
    across ? count : bins,
    across
      ? (bin, out) => {
          // A pixel row is one bin: its column across the visible rows.
          const column = columns[bin];
          for (let row = 0; row < count; row++)
            out[row] = pixelOf(mapping, column[slot[row]] ?? Number.NaN, scale);
        }
      : (row, out) => {
          // A pixel row is one row: its value in each bin's column.
          const at = slot[row];
          for (let bin = 0; bin < bins; bin++)
            out[bin] = pixelOf(mapping, columns[bin][at] ?? Number.NaN, scale);
        },
  );
  bitmap.context.putImageData(bitmap.image, 0, 0);
  engine.debugCounters.heatmapRasters++;
}

function drawHeatmap(pass: SeriesPass): void {
  const { engine, ctx, seriesIndex, series, store, xScale, yScale } = pass;
  const spec = series.heatmap;
  if (!spec || store.length === 0) return;
  const { plot, dpr } = engine.layout;
  const width = Math.round(plot.width * dpr);
  const height = Math.round(plot.height * dpr);
  if (width <= 0 || height <= 0) return;
  const mapping = colorMapping(engine, seriesIndex);
  const bitmap = bitmapOf(engine, seriesIndex);
  // The bitmap holds until the data, the window, the plot, the grid or the colours change: a
  // repaint for a highlight, another series or a plugin only draws it again.
  const key = `${engine.dataVersion}|${xScale.min}|${xScale.max}|${yScale.min}|${yScale.max}|${plot.left}|${plot.top}|${width}|${height}`;
  if (bitmap.key !== key || bitmap.spec !== spec || bitmap.mapping !== mapping) {
    rasterize(engine, bitmap, series, spec, store, mapping, xScale, yScale, width, height);
    bitmap.key = key;
    bitmap.spec = spec;
    bitmap.mapping = mapping;
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.width, plot.height);
  ctx.clip();
  ctx.globalAlpha = (series.opacity ?? 1) * pass.opacity;
  // Cells are whole device pixels already: no smoothing between them.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bitmap.canvas, plot.left, plot.top, plot.width, plot.height);
  ctx.restore();
}

/** The extent of a heatmap series along one of its axes: its rows' cells, or its bins'. */
function heatmapExtent(
  _engine: ChartCore,
  series: SeriesSpec,
  store: DataStore,
  axis: 'x' | 'y',
): readonly [number, number] | null {
  const spec = series.heatmap;
  if (!spec || store.length === 0) return null;
  if (axis !== spec.rows) {
    const bins = spec.binLo.length;
    return bins > 0 ? [spec.binLo[0], spec.binHi[bins - 1]] : null;
  }
  const last = store.length - 1;
  // A lone row has no width of its own: its position, which the axis pads.
  if (last === 0 && !spec.rowLo) return [store.xAt(0), store.xAt(0)];
  const lo = new Float64Array(1);
  const hi = new Float64Array(1);
  rowSpans(store, spec, 0, 0, lo, hi);
  const min = lo[0];
  rowSpans(store, spec, last, last, lo, hi);
  return [min, hi[0]];
}

export const heatmapDraw: MarkDraw = {
  x: 'continuous',
  zeroBased: false,
  cloud: false,
  cells: true,
  interaction: 'none',
  xColumn: () => 0,
  extentColumns: () => NO_COLUMNS,
  legendFill: (color) => color,
  extent: heatmapExtent,
  draw: drawHeatmap,
};
