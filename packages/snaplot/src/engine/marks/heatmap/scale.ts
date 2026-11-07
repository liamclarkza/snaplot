/**
 * A heatmap's colour scale: a bar of its colour map beside the plot, with ticks of its domain and
 * an optional title along it. The layout reserves its width (`colorScaleWidth`); the grid pass
 * draws the bar and tick marks and returns the labels, which the axes' DOM labels show.
 */
import { AXIS_LABEL_GAP, AXIS_TICK_LENGTH, AXIS_TITLE_GAP, EDGE_MARGIN } from '../../../constants';
import type { LabelBox } from '../../axes/labels';
import type { ChartCore } from '../../Engine';
import { crisp } from '../../render/crisp';
import { LinearScale } from '../../scales/LinearScale';
import type { HeatmapColorScale, PixelRect } from '../../spec';
import { colorMapping } from './colors';

/** The gap between the plot (or its right axis) and the bar, and the bar's width. */
const GAP = 12;
const BAR = 10;
/** The ticks a colour scale aims for: a short bar reads a few values. */
const TICKS = 5;
/** The `axis` its labels carry: no axis has this key. */
export const COLOR_SCALE_AXIS = '(colorScale)';

/** The series whose colour scale the chart shows: the first visible heatmap with one, or -1. */
export function colorScaleSeries(engine: ChartCore): number {
  return engine.config.series.findIndex(
    (series) => series.visible !== false && series.heatmap && series.heatmap.colorScale !== false,
  );
}

interface ScaleTicks {
  options: HeatmapColorScale;
  scale: LinearScale;
  values: number[];
  labels: string[];
}

function scaleTicks(engine: ChartCore, si: number): ScaleTicks | null {
  const spec = engine.config.series[si].heatmap!;
  const options = spec.colorScale;
  if (options === false) return null;
  const { min, max } = colorMapping(engine, si);
  const scale = new LinearScale('colorScale', min, max);
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const values = options.ticks
    ? options.ticks.filter((t) => Number.isFinite(t) && t >= lo && t <= hi)
    : scale.ticks(TICKS);
  const format = options.format ?? engine.config.series[si].format;
  const labels = values.map((value) => (format ? format(value) : scale.tickFormat(value)));
  return { options, scale, values, labels };
}

/**
 * The width the colour scale takes on the right of the plot, in CSS pixels (0 without one): the
 * gap, the bar, its ticks and widest label, and its title strip, rounded up to 8 px so the plot
 * keeps its width while a streaming domain changes a label by a digit.
 */
export function colorScaleWidth(engine: ChartCore, measure: (text: string) => number): number {
  const si = colorScaleSeries(engine);
  if (si < 0) return 0;
  const ticks = scaleTicks(engine, si);
  if (!ticks) return 0;
  let widest = 0;
  for (const label of ticks.labels) widest = Math.max(widest, measure(label));
  const lineHeight = engine.theme.fontSize * 1.4;
  const title = ticks.options.title ? EDGE_MARGIN + lineHeight + AXIS_TITLE_GAP : EDGE_MARGIN;
  return Math.ceil((GAP + BAR + AXIS_TICK_LENGTH + AXIS_LABEL_GAP + widest + title) / 8) * 8;
}

/**
 * Draw the colour scale in `area` (the layout's `colorScale`) on the grid layer: the bar of the
 * map, low at the bottom, and a tick mark per value. Returns its tick and title labels.
 */
export function drawColorScale(
  engine: ChartCore,
  ctx: CanvasRenderingContext2D,
  area: PixelRect | undefined,
): LabelBox[] {
  const si = colorScaleSeries(engine);
  if (si < 0 || !area || area.height <= 0) return [];
  const ticks = scaleTicks(engine, si);
  if (!ticks) return [];
  const mapping = colorMapping(engine, si);
  const { dpr } = engine.layout;
  const left = area.left + GAP;
  const top = area.top;
  const bottom = area.top + area.height;
  ticks.scale.setPixelRange(bottom, top);

  // The map, low to high from the bottom: its stops evenly spaced, a cyclic map closing on its first.
  const gradient = ctx.createLinearGradient(0, bottom, 0, top);
  const stops = mapping.cyclic ? [...mapping.stops, mapping.stops[0]] : mapping.stops;
  stops.forEach((stop, i) => {
    gradient.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), stop);
  });
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(left, top, BAR, area.height);
  ctx.strokeStyle = engine.theme.tickColor;
  ctx.globalAlpha = engine.theme.borderOpacity;
  ctx.lineWidth = 1;
  ctx.strokeRect(crisp(left, dpr), crisp(top, dpr), BAR, area.height);
  ctx.beginPath();
  for (const value of ticks.values) {
    const y = crisp(ticks.scale.dataToPixel(value), dpr);
    ctx.moveTo(left + BAR, y);
    ctx.lineTo(left + BAR + AXIS_TICK_LENGTH, y);
  }
  ctx.stroke();
  ctx.restore();

  const labels: LabelBox[] = ticks.values.map((value, i) => ({
    axis: COLOR_SCALE_AXIS,
    position: 'right',
    kind: 'tick',
    text: ticks.labels[i],
    x: left + BAR + AXIS_TICK_LENGTH + AXIS_LABEL_GAP,
    y: ticks.scale.dataToPixel(value),
    anchor: 'start',
  }));
  if (ticks.options.title) {
    labels.push({
      axis: COLOR_SCALE_AXIS,
      position: 'right',
      kind: 'title',
      text: ticks.options.title,
      x: area.left + area.width - EDGE_MARGIN - engine.theme.fontSize / 2,
      y: top + area.height / 2,
      anchor: 'middle',
    });
  }
  return labels;
}
