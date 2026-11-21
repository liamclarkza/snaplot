import type { Layout, ChartSpec, Scale, AxisPosition } from './spec';
import {
  AXIS_LABEL_GAP,
  AXIS_TICK_LENGTH,
  AXIS_TITLE_GAP,
  DEFAULT_TICK_COUNT,
  EDGE_MARGIN,
} from '../constants';
import type { ChartCore } from './Engine';
import { type FormatContext, formatTick } from './format';
import { refreshCursor } from './cursor';
import { settleRange } from './ranging';
import { colorScaleWidth, slicePanel } from './marks/index';
import { DirtyFlag } from './spec';

/**
 * Computes layout regions outside in: each side's gutter is measured from what it holds, and the
 * plot gets whatever remains. One rule sizes every side:
 *
 *   gutter = max(minimum, ⌈EDGE_MARGIN + max(own axis, overhang)⌉)
 *
 * - own axis: the side's axis, if it has one: tick, label gap, its labels (the widest on the left
 *   and right, one line on the top and bottom) and a title strip. 0 without an axis.
 * - overhang: how far the other axis's end labels reach past the plot: half the first or last
 *   horizontal label into the left and right, half a vertical label's height into the top and
 *   bottom. Reserved whether or not a tick sits on the end, so the plot keeps its size while a
 *   pan, a zoom or a stream moves the ticks.
 * - ⌈ ⌉ rounds up to a whole pixel, so the labels start the edge margin from the edge whatever
 *   they say. Only the overhang into the left and right rounds up to 8 px: it follows whichever
 *   label sits at the end of the axis, which changes as a pan moves the ticks along.
 * - minimum: on a side holding an axis, `minGutters.x` or `minGutters.y` for its kind of axis
 *   (0 unless set). Two y axes then take the wider of their gutters, so a y minimum reaches both
 *   sides. A group's aligned gutters (`PlotInsets`) apply after that, side by side.
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

/**
 * The minimum side gutters a chart group's `alignPlots` asks for (plan D17): the widest gutter of
 * any member, so every member's plot starts and ends at the same x (a member's gutter already
 * includes its own `minGutters`). A measured gutter still grows past them.
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
  /** The width a heatmap's colour scale takes right of the plot and its right axes (0: none). */
  colorScale = 0,
  /**
   * The room a heatmap's slice panel asks for: right of the plot and its right axes (inside the
   * colour scale), or above the plot and its top axes. A chart too small to spare it has none.
   */
  slice: { side: 'right' | 'top'; size: number } | null = null,
): Layout {
  // Every side starts at the edge margin: a side with nothing to hold still keeps the plot's own
  // ink off the container's edge. The measures below only grow them, and a side holding an axis
  // grows to at least that kind of axis's minimum. A group's aligned gutters come last.
  const minX = config.minGutters?.x ?? 0;
  const minY = config.minGutters?.y ?? 0;
  let leftAxisWidth = EDGE_MARGIN;
  let rightAxisWidth = EDGE_MARGIN;
  let bottomAxisHeight = EDGE_MARGIN;
  let topAxisHeight = EDGE_MARGIN;

  const lineHeight = fontSize * 1.4;
  // How far a vertical axis's label reaches above or below its tick (the renderer's fitting
  // measure too): the overhang an end label puts into the top or bottom gutter.
  const labelHalfHeight = fontSize * 0.6;
  // Axis titles live in a distinct outer strip, beyond the tick labels.
  const titleStrip = EDGE_MARGIN + lineHeight + AXIS_TITLE_GAP;

  const formats: FormatContext = { config, scales };

  // Build a map of axis key → position for later use
  const axisPositions = new Map<string, AxisPosition>();
  const axisConfigs = config.axes ?? {};
  let hasLeftAxis = false;
  let hasRightAxis = false;
  // Half the first and last label of each horizontal axis.
  const horizontalEdges: Array<{ firstHalf: number; lastHalf: number }> = [];
  // Whether any vertical axis (or a colour scale) draws labels centred on its ticks.
  let verticalLabels = colorScale > 0;

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
      // Category labels sit inside their slots, so they reach no further than the plot.
      if (ticks.length > 0 && !ac.thinTicks) verticalLabels = true;
      // Tick mark + label gap + label width + the edge margin or title strip, rounded up to a
      // whole pixel only: the labels sit against the axis, so any more rounding would land
      // before them and charts side by side would start their labels in different places.
      // Labels use tabular figures, so their width changes only when they gain or lose a
      // character; `minGutters.y` holds a gutter steady through that.
      const titleSpace = ac.title ? titleStrip : EDGE_MARGIN;
      const needed = Math.max(
        minY,
        Math.ceil(maxWidth + AXIS_TICK_LENGTH + AXIS_LABEL_GAP + titleSpace),
      );
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
        // A sliding window's labels cross both edges as it moves: each end reserves the wider
        // label, and the reservation only grows while the window slides (a label gaining a digit
        // as the values cross 100,000,000), so the plot moves once, not back and forth.
        const slide = sliding.get(key);
        const half = Math.max(firstHalf, lastHalf, slide?.half ?? 0);
        if (slide) slide.half = half;
        horizontalEdges.push(slide ? { firstHalf: half, lastHalf: half } : { firstHalf, lastHalf });
      }
      const needed = Math.max(
        minX,
        Math.ceil(
          AXIS_TICK_LENGTH +
            AXIS_LABEL_GAP +
            lineHeight +
            (ac.title ? AXIS_TITLE_GAP + lineHeight : 0) +
            EDGE_MARGIN,
        ),
      );
      if (pos === 'bottom') bottomAxisHeight = Math.max(bottomAxisHeight, needed);
      else topAxisHeight = Math.max(topAxisHeight, needed);
    }
  }

  // A vertical label is centred on its tick, so the end labels reach half a label past the plot's
  // top and bottom. Reserved whether or not a tick sits on the end: a vertical domain follows the
  // data while streaming, and a gutter that tracked its end tick would make the plot's height
  // jitter. The top under a legend keeps the same edge margin from the legend.
  if (verticalLabels) {
    const overhang = Math.ceil(labelHalfHeight + EDGE_MARGIN);
    topAxisHeight = Math.max(topAxisHeight, overhang);
    bottomAxisHeight = Math.max(bottomAxisHeight, overhang);
  }

  // Symmetric: when both left and right axes have labels, use the wider for both
  if (hasLeftAxis && hasRightAxis) {
    const symmetric = Math.max(leftAxisWidth, rightAxisWidth);
    leftAxisWidth = symmetric;
    rightAxisWidth = symmetric;
  }
  // A slice panel and a colour scale sit outside any right axis, the panel nearer the plot whose
  // bin axis it shares. The colour scale's right padding is its own gap; a panel alone keeps the
  // edge margin. The panel yields when the plot would be left under one and a half times its size.
  const rightAxis = hasRightAxis ? rightAxisWidth : 0;
  let sliceRight = slice?.side === 'right' ? slice.size : 0;
  const besidePlot = sliceRight + (colorScale > 0 ? colorScale : sliceRight > 0 ? EDGE_MARGIN : 0);
  if (
    sliceRight > 0 &&
    containerWidth - leftAxisWidth - Math.max(rightAxisWidth, rightAxis + besidePlot) <
      1.5 * sliceRight
  )
    sliceRight = 0;
  const outside = sliceRight > 0 ? besidePlot : colorScale;
  if (outside > 0) rightAxisWidth = Math.max(rightAxisWidth, rightAxis + outside);
  // Above the plot it yields by the same measure.
  let sliceTop = slice?.side === 'top' ? slice.size : 0;
  if (
    sliceTop > 0 &&
    containerHeight - chrome.top - chrome.bottom - topAxisHeight - bottomAxisHeight - sliceTop <
      1.5 * sliceTop
  )
    sliceTop = 0;

  // Horizontal tick labels are centred on their ticks, so the end labels reach half a label past
  // the plot's left and right. Reserved whether or not a tick sits on the end, as the vertical
  // labels' are, and rounded up to 8 px: the end label changes each time a pan or a zoom moves a
  // tick past the end, and a time axis's labels differ in width by their letters, so the step
  // keeps the plot's width through most of those changes.
  for (const edge of horizontalEdges) {
    leftAxisWidth = Math.max(leftAxisWidth, Math.ceil((edge.firstHalf + EDGE_MARGIN) / 8) * 8);
    rightAxisWidth = Math.max(rightAxisWidth, Math.ceil((edge.lastHalf + EDGE_MARGIN) / 8) * 8);
  }

  // A group's aligned gutters, after everything the chart measures (they are the widest members'
  // measures): a chart with two y axes keeps its own right side when only the left must widen to
  // line up, so its plot still ends where the others' do.
  leftAxisWidth = Math.max(leftAxisWidth, insets.left ?? 0);
  rightAxisWidth = Math.max(rightAxisWidth, insets.right ?? 0);

  const plotLeft = leftAxisWidth;
  const plotTop = chrome.top + sliceTop + topAxisHeight;
  const plotWidth = Math.max(0, containerWidth - leftAxisWidth - rightAxisWidth);
  const plotHeight = Math.max(
    0,
    containerHeight - chrome.top - chrome.bottom - sliceTop - topAxisHeight - bottomAxisHeight,
  );

  // Build axis regions keyed by axis config key
  const axes: Layout['axes'] = {};
  for (const [key, pos] of axisPositions) {
    switch (pos) {
      case 'top':
        axes[key] = {
          position: 'top',
          area: {
            left: plotLeft,
            top: chrome.top + sliceTop,
            width: plotWidth,
            height: topAxisHeight,
          },
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
            width: rightAxisWidth - outside,
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
    ...(colorScale > 0
      ? {
          colorScale: {
            left: plotLeft + plotWidth + rightAxisWidth - colorScale,
            top: plotTop,
            width: colorScale,
            height: plotHeight,
          },
        }
      : {}),
    ...(sliceRight > 0
      ? {
          slice: {
            left: plotLeft + plotWidth + rightAxis,
            top: plotTop,
            width: sliceRight,
            height: plotHeight,
          },
        }
      : sliceTop > 0
        ? { slice: { left: plotLeft, top: chrome.top, width: plotWidth, height: sliceTop } }
        : {}),
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
      colorScaleReserve(engine),
      slicePanel(engine),
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
    colorScaleReserve(engine),
    slicePanel(engine),
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
  const slice = slicePanel(engine);
  return [
    width,
    height,
    engine.canvasManager.dpr,
    engine.theme.fontFamily,
    engine.theme.fontSize,
    engine.plotInsets.left,
    engine.plotInsets.right,
    gutterKey(engine.config.minGutters),
    engine.canvasManager.reservedChrome('top'),
    engine.canvasManager.reservedChrome('bottom'),
    slidingNow(engine).size ? [...slidingNow(engine).keys()].join(',') : '',
    colorScaleReserve(engine),
    slice ? `${slice.side}${slice.size}` : '',
    axes,
  ].join('|');
}

const gutterKey = (min: ChartSpec['minGutters']): string =>
  min ? `${min.x ?? ''},${min.y ?? ''}` : '';

/** The width a heatmap's colour scale takes, measured as the axes' labels are. */
function colorScaleReserve(engine: ChartCore): number {
  const { fontFamily, fontSize } = engine.theme;
  return colorScaleWidth(engine, (text) => measureLabel(text, fontFamily, fontSize));
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
