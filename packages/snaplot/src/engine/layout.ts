import type { Layout, ChartSpec, Scale, AxisPosition } from './spec';
import {
  AXIS_LABEL_GAP,
  AXIS_TICK_LENGTH,
  AXIS_TITLE_GAP,
  DEFAULT_PADDING,
  DEFAULT_TICK_COUNT,
  EDGE_MARGIN,
} from '../constants';
import type { ChartCore } from './Engine';
import { type FormatContext, formatTick } from './format';
import { refreshCursor } from './cursor';
import { settleRange } from './ranging';
import { DirtyFlag } from './spec';

/**
 * Computes layout regions using the outside-in algorithm:
 * 1. Start with total container dimensions
 * 2. Reserve space for axes (measured from widest tick label)
 * 3. Plot area gets whatever remains
 *
 * Viewport changes re-run this (tick labels depend on the domain), so it
 * must stay cheap: text is measured on a detached canvas, never through
 * DOM offsetWidth reads that force a synchronous reflow.
 */

// Measurement context and memo, shared across charts: width is a pure
// function of (font, text), and pan/zoom re-measures the same handful of
// tick strings every frame. Created lazily so module load stays DOM-free.
let measureCtx: CanvasRenderingContext2D | null = null;
/** Widths by font, then by label as given (before its digits become `0`). */
const measureCache = new Map<string, Map<string, number>>();
const MEASURE_CACHE_MAX = 4096;
// The last font asked for, so a frame of labels in one font builds no key.
let lastFamily = '';
let lastSize = Number.NaN;
let lastWidths: Map<string, number> | null = null;

/**
 * The width of a label as the DOM shows it, in CSS pixels. Labels use tabular figures, which the
 * canvas cannot set: every digit is measured as a `0`, the width tabular digits share.
 */
export function measureLabel(text: string, fontFamily: string, fontSize: number): number {
  if (typeof document === 'undefined') return text.length * 7;
  if (!lastWidths || fontFamily !== lastFamily || fontSize !== lastSize) {
    const font = fontSize + 'px ' + fontFamily;
    lastWidths = measureCache.get(font) ?? null;
    if (!lastWidths) {
      lastWidths = new Map();
      measureCache.set(font, lastWidths);
    }
    lastFamily = fontFamily;
    lastSize = fontSize;
  }
  const cached = lastWidths.get(text);
  if (cached !== undefined) return cached;

  if (!measureCtx) {
    measureCtx = document.createElement('canvas').getContext('2d');
    if (!measureCtx) return text.length * 7;
  }
  measureCtx.font = fontSize + 'px ' + fontFamily;
  const width = measureCtx.measureText(text.replace(/\d/g, '0')).width;

  if (lastWidths.size >= MEASURE_CACHE_MAX) lastWidths.clear();
  lastWidths.set(text, width);
  return width;
}

/**
 * Infer axis position from key name if not explicitly set.
 * Keys starting with 'x' → 'bottom', everything else → 'left'.
 */
export function inferPosition(key: string, explicit?: AxisPosition): AxisPosition {
  if (explicit) return explicit;
  if (key === 'x' || key.startsWith('x')) return 'bottom';
  // The primary value axis is on the left; any other value axis defaults to the right.
  return key === 'y' ? 'left' : 'right';
}

function horizontalFraction(scale: Scale, value: number): number {
  let min = Math.min(scale.min, scale.max);
  let max = Math.max(scale.min, scale.max);
  let current = value;
  if (scale.type === 'log' && min > 0 && max > 0 && current > 0) {
    min = Math.log(min);
    max = Math.log(max);
    current = Math.log(current);
  }
  if (min === max) return 0.5;
  return Math.max(0, Math.min(1, (current - min) / (max - min)));
}

/**
 * The minimum side gutters a chart group's `alignPlots` asks for (plan D17): the widest gutter of
 * any member, so every member's plot starts and ends at the same x. Omitted sides keep the
 * defaults (left 56, right 24); a measured gutter still grows past them.
 */
export interface PlotInsets {
  left?: number;
  right?: number;
}

/** The CSS pixels chrome reserves at the top and bottom of the root (`reserveChrome`). */
export interface ReservedChrome {
  top: number;
  bottom: number;
}

const NO_CHROME: ReservedChrome = Object.freeze({ top: 0, bottom: 0 });

export function computeLayout(
  containerWidth: number,
  containerHeight: number,
  config: ChartSpec,
  scales: Map<string, Scale>,
  dpr: number,
  fontFamily: string,
  fontSize: number,
  insets: PlotInsets = {},
  /** Space reserved for chrome (the built-in legend): the axes and the plot sit between it. */
  chrome: ReservedChrome = NO_CHROME,
  /**
   * Horizontal axes whose window slides at a constant width (`slidingAxes`), each with the widest
   * end-label overhang reserved since its slide began (raised here when a wider label arrives).
   */
  sliding: ReadonlyMap<string, { half: number }> = NO_AXES,
): Layout {
  // Under chrome (a legend above the plot) the top gutter only has to hold half the top tick
  // label, so the legend sits with its plot rather than a blank band above it.
  const padding: { top: number; right: number; bottom: number; left: number } = {
    top: chrome.top > 0 ? Math.max(12, Math.ceil(fontSize * 0.6) + 4) : DEFAULT_PADDING.top,
    right: insets.right ?? DEFAULT_PADDING.right,
    bottom: DEFAULT_PADDING.bottom,
    left: insets.left ?? DEFAULT_PADDING.left,
  };

  // Accumulate space needed per side from all configured axes
  let leftAxisWidth = padding.left;
  let rightAxisWidth = padding.right;
  let bottomAxisHeight = padding.bottom;
  let topAxisHeight = padding.top;

  const lineHeight = fontSize * 1.4;
  // Axis titles live in a distinct outer strip. Padding is the minimum total
  // gutter on every side; title space is not added on top of caller padding.
  const titleStrip = EDGE_MARGIN + lineHeight + AXIS_TITLE_GAP;

  const formats: FormatContext = { config, scales };

  // Build a map of axis key → position for later use
  const axisPositions = new Map<string, AxisPosition>();
  const axisConfigs = config.axes ?? {};
  let hasLeftAxis = false;
  let hasRightAxis = false;
  const horizontalEdges: Array<{
    firstHalf: number;
    lastHalf: number;
    firstFraction: number;
    lastFraction: number;
  }> = [];

  for (const [key, ac] of Object.entries(axisConfigs)) {
    const pos = inferPosition(key, ac.position);
    axisPositions.set(key, pos);

    const scale = scales.get(key);
    if (!scale) continue;

    if (pos === 'left' || pos === 'right') {
      if (pos === 'left') hasLeftAxis = true;
      else hasRightAxis = true;
      // Mirror the renderer's tick selection (explicit ticks clamped to the
      // domain, else generated at the configured density) so the gutter is
      // measured for the labels actually drawn. Inlined rather than imported
      // from axes/ to keep the layout free of renderer dependencies.
      const lo = Math.min(scale.min, scale.max);
      const hi = Math.max(scale.min, scale.max);
      const ticks =
        ac.ticks && ac.ticks.length > 0
          ? ac.ticks.filter((t) => Number.isFinite(t) && t >= lo && t <= hi)
          : scale.ticks(ac.tickCount ?? DEFAULT_TICK_COUNT);
      const format = (v: number) => formatTick(formats, key, v);
      let maxWidth = 0;
      for (const t of ticks) {
        const width = measureLabel(format(t), fontFamily, fontSize);
        if (width > maxWidth) maxWidth = width;
      }
      // Tick mark + label gap + label width + optional title strip, rounded
      // up to an 8px step. Quantizing keeps the gutter stable while tick
      // labels shift by a character during pan/zoom, so the plot rect does
      // not jitter and the layout stays reusable across gesture frames.
      const titleSpace = ac.title ? titleStrip : EDGE_MARGIN;
      const needed = Math.ceil((maxWidth + AXIS_TICK_LENGTH + AXIS_LABEL_GAP + titleSpace) / 8) * 8;
      if (pos === 'left') {
        leftAxisWidth = Math.max(leftAxisWidth, needed);
      } else {
        rightAxisWidth = Math.max(rightAxisWidth, needed);
      }
    } else {
      const lo = Math.min(scale.min, scale.max);
      const hi = Math.max(scale.min, scale.max);
      const ticks =
        ac.ticks && ac.ticks.length > 0
          ? ac.ticks.filter((t) => Number.isFinite(t) && t >= lo && t <= hi).sort((a, b) => a - b)
          : scale.ticks(ac.tickCount ?? DEFAULT_TICK_COUNT).sort((a, b) => a - b);
      const format = (value: number) => formatTick(formats, key, value);
      // A category axis' labels are thinned to fit and its edge labels clamped into the
      // container, so its ends reserve nothing: the last category's label is rarely drawn.
      if (ticks.length > 0 && !ac.thinTicks) {
        const firstHalf = measureLabel(format(ticks[0]), fontFamily, fontSize) / 2;
        const lastHalf = measureLabel(format(ticks[ticks.length - 1]), fontFamily, fontSize) / 2;
        // A sliding window's ticks cross both edges as it moves: reserve each end's whole
        // overhang, as if a tick sat on it, so the plot keeps its width instead of narrowing
        // while a label nears an edge and widening once it has gone.
        const slide = sliding.get(key);
        const slides = slide !== undefined;
        // The reservation only grows while the window slides (a label gaining a digit as the
        // values cross 100,000,000), so the plot moves once, not back and forth.
        const half = Math.max(firstHalf, lastHalf, slide?.half ?? 0);
        if (slide) slide.half = half;
        horizontalEdges.push({
          firstHalf: slides ? half : firstHalf,
          lastHalf: slides ? half : lastHalf,
          firstFraction: slides ? 0 : horizontalFraction(scale, ticks[0]),
          lastFraction: slides ? 1 : horizontalFraction(scale, ticks[ticks.length - 1]),
        });
      }
      const needed = Math.ceil(
        AXIS_TICK_LENGTH +
          AXIS_LABEL_GAP +
          lineHeight +
          (ac.title ? AXIS_TITLE_GAP + lineHeight : 0) +
          EDGE_MARGIN,
      );
      if (pos === 'bottom') bottomAxisHeight = Math.max(bottomAxisHeight, needed);
      else topAxisHeight = Math.max(topAxisHeight, needed);
    }
  }

  // Symmetric: when both left and right axes have labels, use the wider for both
  if (hasLeftAxis && hasRightAxis) {
    const symmetric = Math.max(leftAxisWidth, rightAxisWidth);
    leftAxisWidth = symmetric;
    rightAxisWidth = symmetric;
  }

  // Horizontal tick labels are centred on their ticks. Only reserve the part
  // that would actually escape the plot: bar categories and histogram bin
  // ticks are inset by their geometry, while an exact domain endpoint still
  // needs half its label outside the plot. Two cheap passes account for the
  // small plot-width change introduced by the first reservation.
  for (let pass = 0; pass < 2; pass++) {
    const provisionalWidth = Math.max(0, containerWidth - leftAxisWidth - rightAxisWidth);
    let requiredLeft = leftAxisWidth;
    let requiredRight = rightAxisWidth;
    for (const edge of horizontalEdges) {
      const leftOverflow = edge.firstHalf - edge.firstFraction * provisionalWidth;
      const rightOverflow = edge.lastHalf - (1 - edge.lastFraction) * provisionalWidth;
      if (leftOverflow > 0) {
        requiredLeft = Math.max(requiredLeft, Math.ceil(leftOverflow + EDGE_MARGIN));
      }
      if (rightOverflow > 0) {
        requiredRight = Math.max(requiredRight, Math.ceil(rightOverflow + EDGE_MARGIN));
      }
    }
    if (requiredLeft === leftAxisWidth && requiredRight === rightAxisWidth) break;
    leftAxisWidth = requiredLeft;
    rightAxisWidth = requiredRight;
  }

  const plotLeft = leftAxisWidth;
  const plotTop = chrome.top + topAxisHeight;
  const plotWidth = Math.max(0, containerWidth - leftAxisWidth - rightAxisWidth);
  const plotHeight = Math.max(
    0,
    containerHeight - chrome.top - chrome.bottom - topAxisHeight - bottomAxisHeight,
  );

  // Build axis regions keyed by axis config key
  const axes: Layout['axes'] = {};
  for (const [key, pos] of axisPositions) {
    switch (pos) {
      case 'top':
        axes[key] = {
          position: 'top',
          area: { left: plotLeft, top: chrome.top, width: plotWidth, height: topAxisHeight },
        };
        break;
      case 'bottom':
        axes[key] = {
          position: 'bottom',
          area: {
            left: plotLeft,
            top: plotTop + plotHeight,
            width: plotWidth,
            height: bottomAxisHeight,
          },
        };
        break;
      case 'left':
        axes[key] = {
          position: 'left',
          area: { left: 0, top: plotTop, width: leftAxisWidth, height: plotHeight },
        };
        break;
      case 'right':
        axes[key] = {
          position: 'right',
          area: {
            left: plotLeft + plotWidth,
            top: plotTop,
            width: rightAxisWidth,
            height: plotHeight,
          },
        };
        break;
    }
  }

  return {
    width: containerWidth,
    height: containerHeight,
    plot: {
      top: plotTop,
      left: plotLeft,
      width: plotWidth,
      height: plotHeight,
    },
    axes,
    dpr,
  };
}

// ─── The chart's layout ───────────────────────────────────────
// The engine's cached layout over computeLayout (keyed by the box, the fonts, a group's plot
// insets and each axis' domain, ticks and format), the gutters a group aligns, the scales' pixel
// ranges and the input layer's rectangle.

// Stable identity for user tickFormat functions in the layout cache key.
// Stringifying the function body per frame allocated the whole source text
// on every render; a WeakMap id is O(1) and never retains the function.
const tickFormatIds = new WeakMap<(value: number) => string, number>();
let nextTickFormatId = 1;

function tickFormatId(fn: ((value: number) => string) | undefined): number {
  if (!fn) return 0;
  let id = tickFormatIds.get(fn);
  if (id === undefined) {
    id = nextTickFormatId++;
    tickFormatIds.set(fn, id);
  }
  return id;
}

/**
 * The side gutters a chart group's `alignPlots` asks for (plan D17): the widest of its
 * members'. Applied only when they change, as a relayout: no options pass, no ingest.
 */
export function setPlotInsets(engine: ChartCore, insets: PlotInsets): void {
  if (engine.destroyed) return;
  if (insets.left === engine.plotInsets.left && insets.right === engine.plotInsets.right) return;
  const before = engine.layout?.plot;
  engine.plotInsets = { ...insets };
  updateLayout(engine);
  const after = engine.layout.plot;
  // Insets no wider than the chart's own gutters move nothing: no repaint.
  if (before && before.left === after.left && before.width === after.width) return;
  updateScalePixelRanges(engine);
  refreshCursor(engine);
  engine.scheduler.markDirty(DirtyFlag.ALL);
}

/**
 * The side gutters this chart needs on its own, without any group's insets: what its
 * measured axes take. Cached with the layout inputs.
 */
export function naturalGutters(engine: ChartCore): { left: number; right: number } {
  const width = engine.canvasManager.boxWidth || 600;
  const height = engine.canvasManager.boxHeight || 400;
  const key = `${createLayoutCacheKey(engine, width, height)}|natural`;
  if (engine.natural?.key !== key) {
    const layout = computeLayout(
      width,
      height,
      engine.config,
      engine.scales,
      engine.canvasManager.dpr,
      engine.theme.fontFamily,
      engine.theme.fontSize,
      {},
      NO_CHROME,
      slidingNow(engine),
    );
    engine.natural = {
      key,
      left: layout.plot.left,
      right: layout.width - layout.plot.left - layout.plot.width,
    };
  }
  return { left: engine.natural.left, right: engine.natural.right };
}

/** Whether the layout was computed for another box, options or scales than the current ones. */
export function layoutIsStale(engine: ChartCore): boolean {
  const w = engine.canvasManager.boxWidth || 600;
  const h = engine.canvasManager.boxHeight || 400;
  return !engine.layout || createLayoutCacheKey(engine, w, h) !== engine.layoutCacheKey;
}

/**
 * The horizontal axes whose window slides at a constant width: a stream following its newest
 * data (from its first frame), or a pan. A change of span (a zoom, or new data widening a static
 * chart) ends the slide. Runs once per layout; `slidingNow` reads its last answer.
 */
interface Window {
  span: number;
  min: number;
  sliding: boolean;
  /** The end-label overhang reserved since the slide began (computeLayout raises it). */
  half: number;
}
const windows = new WeakMap<ChartCore, Map<string, Window>>();
const lastSliding = new WeakMap<ChartCore, ReadonlyMap<string, Window>>();
const NO_AXES: ReadonlyMap<string, Window> = new Map();

function slidingAxes(engine: ChartCore): ReadonlyMap<string, Window> {
  let seen = windows.get(engine);
  if (!seen) {
    seen = new Map();
    windows.set(engine, seen);
  }
  const streaming = engine.following && engine.config.streaming?.followWindow !== undefined;
  let out: Map<string, Window> | null = null;
  for (const [key, scale] of engine.scales) {
    const pos = inferPosition(key, engine.config.axes?.[key]?.position);
    if (pos !== 'bottom' && pos !== 'top') continue;
    const span = scale.max - scale.min;
    const was = seen.get(key);
    const sameSpan = was !== undefined && Math.abs(span - was.span) <= Math.abs(span) * 1e-9;
    const sliding = streaming || (sameSpan && (was.sliding || scale.min !== was.min));
    const record = was ?? { span, min: scale.min, sliding, half: 0 };
    if (!sliding) record.half = 0;
    record.span = span;
    record.min = scale.min;
    record.sliding = sliding;
    if (!was) seen.set(key, record);
    if (sliding) (out ??= new Map()).set(key, record);
  }
  const result = out ?? NO_AXES;
  lastSliding.set(engine, result);
  return result;
}

/** The sliding axes the current layout was made with. */
const slidingNow = (engine: ChartCore) => lastSliding.get(engine) ?? NO_AXES;

export function updateLayout(engine: ChartCore): void {
  settleRange(engine);
  slidingAxes(engine);
  const w = engine.canvasManager.boxWidth || 600;
  const h = engine.canvasManager.boxHeight || 400;
  const cacheKey = createLayoutCacheKey(engine, w, h);
  if (engine.layout && cacheKey === engine.layoutCacheKey) {
    updateInteractionLayer(engine);
    return;
  }

  engine.layout = computeLayout(
    w,
    h,
    engine.config,
    engine.scales,
    engine.canvasManager.dpr,
    engine.theme.fontFamily,
    engine.theme.fontSize,
    engine.plotInsets,
    reservedChrome(engine),
    slidingNow(engine),
  );
  engine.layoutCacheKey = cacheKey;
  updateInteractionLayer(engine);
}

/** The space chrome reserves at the top and bottom of the root (render/surface.ts). */
export function reservedChrome(engine: ChartCore): ReservedChrome {
  return {
    top: engine.canvasManager.reservedChrome('top'),
    bottom: engine.canvasManager.reservedChrome('bottom'),
  };
}

/**
 * Reserve `px` CSS pixels at the top or bottom of the root for chrome (the W5 contract M12b's
 * legend calls): applied only when it changes, as a relayout and a repaint.
 */
export function reserveChrome(engine: ChartCore, side: 'top' | 'bottom', px: number): void {
  if (engine.destroyed || !engine.canvasManager.reserveChrome(side, px)) return;
  updateLayout(engine);
  updateScalePixelRanges(engine);
  refreshCursor(engine);
  engine.scheduler.markDirty(DirtyFlag.ALL);
}

export function updateInteractionLayer(engine: ChartCore): void {
  const axisControls = engine.config.pan?.axis === true || engine.config.zoom?.axis === true;
  const { plot, width, height } = engine.layout;
  // The plot's right and bottom edges are inclusive: a pointer on the edge pixel (a value at the
  // domain's minimum) is inside.
  engine.canvasManager.setInteractionRect(
    axisControls
      ? { left: 0, top: 0, width, height }
      : {
          left: plot.left,
          top: plot.top,
          width: Math.min(plot.width + 1, width - plot.left),
          height: Math.min(plot.height + 1, height - plot.top),
        },
  );
}

export function createLayoutCacheKey(engine: ChartCore, width: number, height: number): string {
  const axes = Array.from(engine.scales, ([key, scale]) => {
    const ac = engine.config.axes?.[key];
    return [
      key,
      inferPosition(key, ac?.position),
      scale.type,
      scale.min,
      scale.max,
      tickFormatId(ac?.format),
      ac?.title ?? '',
      // Tick config changes what layout measures for the gutter.
      ac?.tickCount ?? '',
      ac?.ticks ? ac.ticks.join(',') : '',
    ].join(':');
  }).join('|');
  return [
    width,
    height,
    engine.canvasManager.dpr,
    engine.theme.fontFamily,
    engine.theme.fontSize,
    engine.plotInsets.left,
    engine.plotInsets.right,
    engine.canvasManager.reservedChrome('top'),
    engine.canvasManager.reservedChrome('bottom'),
    slidingNow(engine).size ? [...slidingNow(engine).keys()].join(',') : '',
    axes,
  ].join('|');
}

/**
 * What the data layer's pixels depend on besides the series options: the canvas, the plot and
 * every scale (`replaceOptions` keeps the layer when an update leaves it unchanged).
 */
export function marksKey(engine: ChartCore): string {
  const { boxWidth, boxHeight } = engine.canvasManager;
  return createLayoutCacheKey(engine, boxWidth || 600, boxHeight || 400);
}

export function updateScalePixelRanges(engine: ChartCore): void {
  const { plot } = engine.layout;
  const axisConfigs = engine.config.axes ?? {};

  for (const [key, scale] of engine.scales) {
    const ac = axisConfigs[key];
    const pos = inferPosition(key, ac?.position);
    if (pos === 'bottom' || pos === 'top') {
      scale.setPixelRange(plot.left, plot.left + plot.width);
    } else {
      // left/right: pixel range is inverted (top = max, bottom = min)
      scale.setPixelRange(plot.top + plot.height, plot.top);
    }
  }
}

export function isInPlotArea(engine: ChartCore, x: number, y: number): boolean {
  const { plot } = engine.layout;
  return (
    x >= plot.left && x <= plot.left + plot.width && y >= plot.top && y <= plot.top + plot.height
  );
}
