/**
 * A heatmap's slice: one row of its cells as a profile of their values (the distribution at a
 * moment of a heatmap of counts, the spectrum of a spectrogram's frame). The profile is drawn on
 * the colour domain, so a bar's length and its cell's colour say the same thing. This module finds
 * the row under the cursor, reads rows, and draws the panel on the bin axis (the layout reserves
 * it) and the pinned rows' marks, all on the overlay: a cursor move repaints nothing else.
 */
import type { ChartCore } from '../../Engine';
import { crisp } from '../../render/crisp';
import type { CursorConfig, HeatmapSpec, PixelRect, Scale, SliceProfile } from '../../spec';
import { cellAt, gridScales, rowAt, rowWindow } from './cells';
import { colorMapping } from './colors';

/** The panel's default size: its width beside the plot, its height above it. */
const PANEL_BESIDE = 120;
const PANEL_ABOVE = 64;
/** The gap between the plot's side of a panel beside it and the profiles' baseline. */
const GAP = 12;
/** The most rows the mean of the rows in view reads: more are sampled at an even stride. */
const MEAN_ROWS = 256;

/** The series whose panel and pins the chart draws: the first visible heatmap with either, or -1. */
export function sliceSeries(engine: ChartCore): number {
  return engine.config.series.findIndex((series) => {
    const slice = series.visible !== false && series.heatmap?.slice;
    return slice && (slice.panel !== false || slice.pins.length > 0);
  });
}

/** The room the slice panel asks of the layout: its side of the plot and its size, or null. */
export function slicePanel(engine: ChartCore): { side: 'right' | 'top'; size: number } | null {
  const si = sliceSeries(engine);
  const spec = si < 0 ? undefined : engine.config.series[si].heatmap;
  const panel = spec?.slice?.panel;
  if (!spec || !panel) return null;
  const side = spec.rows === 'x' ? 'right' : 'top';
  return { side, size: panel.size ?? (side === 'right' ? PANEL_BESIDE : PANEL_ABOVE) };
}

function scalesOf(engine: ChartCore, si: number): { rowScale: Scale; binScale: Scale } | null {
  const series = engine.config.series[si];
  const xScale = engine.scales.get(series.xAxis ?? 'x');
  const yScale = engine.scales.get(series.yAxis ?? 'y');
  return xScale && yScale ? gridScales(series.heatmap!, xScale, yScale) : null;
}

/**
 * The row of heatmap `si` under the cursor: -1 over no row (a gap, past the ends), null when
 * there is no cursor along the rows' axis. Rows along X follow a group's or the keyboard's cursor
 * too; rows up the plot only the pointer, as no other cursor has a Y.
 */
export function cursorRow(engine: ChartCore, si: number): number | null {
  const spec = engine.config.series[si].heatmap!;
  const scales = scalesOf(engine, si);
  const pixel = spec.rows === 'x' ? engine.cursorX : engine.cursorIsLocal ? engine.cursorY : null;
  if (!scales || pixel === null) return null;
  return rowAt(engine.storeForSeries(si), spec, scales.rowScale.pixelToData(pixel));
}

/** The values of row `row` of heatmap `si`, one per bin, into `out`; NaN is an empty cell. */
export function readRow(engine: ChartCore, si: number, row: number, out: Float64Array): void {
  const store = engine.storeForSeries(si);
  const first = engine.config.series[si].yColumn ?? 1;
  for (let b = 0; b < out.length; b++)
    out[b] = first + b <= store.seriesCount ? store.valueAt(first + b, row) : Number.NaN;
}

/** A value's place on the colour domain, from 0 to 1 (NaN stays NaN). */
function onDomain(value: number, min: number, max: number): number {
  const t = (value - min) / (max - min);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Row `row` of heatmap `si` as a profile for the tooltip, with `bin` marked. Bins are placed as
 * the bin axis spaces them (a log axis' bins evenly), whatever window the plot shows. The bars
 * stand on the low end of the colour domain and are scaled to the row's tallest: a tooltip shows
 * one row, so it shows its shape at full height (the panel keeps rows comparable instead).
 */
export function sliceProfile(
  engine: ChartCore,
  si: number,
  row: number,
  bin: number,
): SliceProfile {
  const spec = engine.config.series[si].heatmap!;
  const bins = spec.binLo.length;
  const profile: SliceProfile = {
    from: new Float64Array(bins),
    to: new Float64Array(bins),
    length: new Float64Array(bins),
    bin,
  };
  readRow(engine, si, row, profile.length);
  const { min, max } = colorMapping(engine, si);
  const scale = scalesOf(engine, si)?.binScale;
  const low = spec.binLo[0];
  const high = spec.binHi[bins - 1];
  const p0 = scale ? scale.dataToPixel(low) : Number.NaN;
  const p1 = scale ? scale.dataToPixel(high) : Number.NaN;
  // A bin axis that cannot place the ends (a log axis with a bin at 0) spaces the bins linearly.
  const scaled = scale && Number.isFinite(p0) && Number.isFinite(p1) && p0 !== p1;
  const place = (value: number) =>
    scaled ? (scale.dataToPixel(value) - p0) / (p1 - p0) : (value - low) / (high - low || 1);
  let tallest = 0;
  for (let b = 0; b < bins; b++) {
    profile.from[b] = place(spec.binLo[b]);
    profile.to[b] = place(spec.binHi[b]);
    const length = onDomain(profile.length[b], min, max);
    profile.length[b] = length;
    if (length > tallest) tallest = length;
  }
  if (tallest > 0) for (let b = 0; b < bins; b++) profile.length[b] /= tallest;
  return profile;
}

const means = new WeakMap<ChartCore, { key: string; values: Float64Array }>();

/**
 * The mean of each bin over the rows in view, or null without rows: at most `MEAN_ROWS` rows at an
 * even stride, so a pan over a long history costs the same as over a short one. Cached until the
 * rows in view or the data change.
 */
function meanInView(engine: ChartCore, si: number, rowScale: Scale): Float64Array | null {
  const store = engine.storeForSeries(si);
  const bins = engine.config.series[si].heatmap!.binLo.length;
  const { from, to } = rowWindow(
    store,
    Math.min(rowScale.min, rowScale.max),
    Math.max(rowScale.min, rowScale.max),
  );
  if (to < from) return null;
  const key = `${si}|${bins}|${from}|${to}|${engine.dataVersion}`;
  const cached = means.get(engine);
  if (cached?.key === key) return cached.values;
  const stride = Math.max(1, Math.ceil((to - from + 1) / MEAN_ROWS));
  const values = new Float64Array(bins);
  const counts = new Uint32Array(bins);
  const row = new Float64Array(bins);
  for (let r = from; r <= to; r += stride) {
    readRow(engine, si, r, row);
    for (let b = 0; b < bins; b++) {
      if (row[b] !== row[b]) continue;
      values[b] += row[b];
      counts[b]++;
    }
  }
  for (let b = 0; b < bins; b++) values[b] = counts[b] ? values[b] / counts[b] : Number.NaN;
  means.set(engine, { key, values });
  return values;
}

/** Where a panel's profiles stand: their baseline, how far a full bar reaches, and which way. */
interface Frame {
  /** Bins run down the panel (beside the plot) or along it (above the plot). */
  beside: boolean;
  base: number;
  reach: number;
}

/**
 * Trace `values` as a stepped outline standing on the frame's baseline: one step per bin across
 * `binScale`, its length the value's place on the colour domain. A run of bins starts and ends on
 * the baseline, so an empty cell or a gap between bins breaks the outline, and a fill closes
 * along the baseline.
 */
function trace(
  ctx: CanvasRenderingContext2D,
  values: Float64Array,
  spec: HeatmapSpec,
  binScale: Scale,
  frame: Frame,
  min: number,
  max: number,
): void {
  const point = (start: boolean, length: number, at: number) => {
    const x = frame.beside ? frame.base + length : at;
    const y = frame.beside ? at : frame.base - length;
    if (start) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  };
  let end = Number.NaN;
  ctx.beginPath();
  for (let b = 0; b < values.length; b++) {
    const value = values[b];
    if (value !== value) {
      if (end === end) point(false, 0, end);
      end = Number.NaN;
      continue;
    }
    const from = binScale.dataToPixel(spec.binLo[b]);
    const to = binScale.dataToPixel(spec.binHi[b]);
    if (from !== end) {
      if (end === end) point(false, 0, end);
      point(true, 0, from);
    }
    const length = onDomain(value, min, max) * frame.reach;
    point(false, length, from);
    point(false, length, to);
    end = to;
  }
  if (end === end) point(false, 0, end);
}

/**
 * The overlay pass of the chart's slice: a mark across the plot at each pinned row, then, with a
 * panel, a line through the row under the cursor and the panel in the layout's `slice` area: the
 * mean of the rows in view, the row under the cursor (the newest row of a heatmap of rows while
 * the cursor is away) with the bin under the pointer filled, and each pinned row's outline in its
 * mark's colour.
 */
export function drawSlice(
  engine: ChartCore,
  ctx: CanvasRenderingContext2D,
  /** The crosshair this frame draws, or null when it draws none. */
  crosshair: CursorConfig | null,
): void {
  const si = sliceSeries(engine);
  if (si < 0) return;
  const spec = engine.config.series[si].heatmap!;
  const slice = spec.slice!;
  const store = engine.storeForSeries(si);
  const scales = scalesOf(engine, si);
  if (!scales || store.length === 0) return;
  const { rowScale, binScale } = scales;
  const { plot, dpr } = engine.layout;
  const beside = spec.rows === 'x';
  const palette = engine.categoricalPalette();
  const pins = slice.pins.map((pin, i) => ({
    row: store.nearestXIndex(pin),
    color: engine.resolveColor(palette[i % palette.length]),
  }));

  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.width, plot.height);
  ctx.clip();
  // Each mark over a wider line of the surface, so it reads on any cell colour.
  const surface = engine.theme.surfaceColor ?? '#ffffff';
  for (const pin of pins) {
    const at = Math.round(rowScale.dataToPixel(store.xAt(pin.row)));
    ctx.beginPath();
    if (beside) {
      ctx.moveTo(at, plot.top);
      ctx.lineTo(at, plot.top + plot.height);
    } else {
      ctx.moveTo(plot.left, at);
      ctx.lineTo(plot.left + plot.width, at);
    }
    ctx.strokeStyle = surface;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = pin.color;
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();

  const area: PixelRect | undefined = engine.layout.slice;
  if (!area || !slice.panel) return;
  const under = cursorRow(engine, si);

  // The row the panel shows, as a line through it (the cut), in the crosshair's style, unless
  // the crosshair's own line along the rows' axis already says it.
  const drawn = beside ? crosshair?.xLine !== false : crosshair?.yLine === true;
  if (crosshair && !drawn && under !== null && under >= 0) {
    const at = crisp(rowScale.dataToPixel(store.xAt(under)), dpr);
    ctx.save();
    ctx.strokeStyle = crosshair.color ?? engine.theme.crosshairColor;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1;
    ctx.setLineDash(crosshair.dash ?? [4, 4]);
    ctx.beginPath();
    if (beside) {
      ctx.moveTo(at, plot.top);
      ctx.lineTo(at, plot.top + plot.height);
    } else {
      ctx.moveTo(plot.left, at);
      ctx.lineTo(plot.left + plot.width, at);
    }
    ctx.stroke();
    ctx.restore();
  }

  const frame: Frame = beside
    ? { beside, base: area.left + GAP, reach: area.width - GAP - 1 }
    : { beside, base: area.top + area.height, reach: area.height - 2 };
  const { min, max } = colorMapping(engine, si);
  const values = new Float64Array(spec.binLo.length);
  const { theme } = engine;

  ctx.save();
  ctx.beginPath();
  ctx.rect(area.left, area.top - 1, area.width + 1, area.height + 2);
  ctx.clip();

  if (slice.panel.mean) {
    const mean = meanInView(engine, si, rowScale);
    if (mean) {
      trace(ctx, mean, spec, binScale, frame, min, max);
      ctx.fillStyle = theme.tickColor;
      ctx.globalAlpha = 0.22;
      ctx.fill();
    }
  }

  // A grid has no newest row to fall back to: its last column is only where its X ends.
  const row = under ?? (spec.rowLo ? -1 : store.length - 1);
  if (row >= 0) {
    readRow(engine, si, row, values);
    trace(ctx, values, spec, binScale, frame, min, max);
    ctx.fillStyle = theme.textColor;
    ctx.strokeStyle = theme.textColor;
    ctx.globalAlpha = 0.14;
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // The cell under the pointer, filled: where on the profile the pointer is.
    const across = beside ? engine.mouseY : engine.mouseX;
    const bin =
      under !== null && engine.cursorIsLocal && across !== null
        ? cellAt(spec.binLo, spec.binHi, values.length, binScale.pixelToData(across))
        : -1;
    if (bin >= 0 && values[bin] === values[bin]) {
      const from = binScale.dataToPixel(spec.binLo[bin]);
      const to = binScale.dataToPixel(spec.binHi[bin]);
      const length = onDomain(values[bin], min, max) * frame.reach;
      if (beside) ctx.fillRect(frame.base, Math.min(from, to), length, Math.abs(to - from));
      else ctx.fillRect(Math.min(from, to), frame.base - length, Math.abs(to - from), length);
    }
  }

  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.5;
  for (const pin of pins) {
    readRow(engine, si, pin.row, values);
    trace(ctx, values, spec, binScale, frame, min, max);
    ctx.strokeStyle = pin.color;
    ctx.stroke();
  }

  // The baseline the profiles stand on.
  ctx.strokeStyle = theme.tickColor;
  ctx.globalAlpha = theme.borderOpacity;
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (beside) {
    const x = crisp(frame.base, dpr);
    ctx.moveTo(x, area.top);
    ctx.lineTo(x, area.top + area.height);
  } else {
    const y = crisp(frame.base, dpr);
    ctx.moveTo(area.left, y);
    ctx.lineTo(area.left + area.width, y);
  }
  ctx.stroke();
  ctx.restore();
}
