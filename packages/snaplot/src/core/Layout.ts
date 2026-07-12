import type { Layout, ChartConfig, Scale, AxisPosition } from '../types';
import {
  AXIS_LABEL_GAP,
  AXIS_TICK_LENGTH,
  AXIS_TITLE_GAP,
  DEFAULT_PADDING,
  DEFAULT_TICK_COUNT,
  EDGE_MARGIN,
} from '../constants';

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
const measureCache = new Map<string, number>();
const MEASURE_CACHE_MAX = 4096;

function measureTextWidth(text: string, fontFamily: string, fontSize: number): number {
  if (typeof document === 'undefined') return text.length * 7;

  const font = fontSize + 'px ' + fontFamily;
  const key = font + '|' + text;
  const cached = measureCache.get(key);
  if (cached !== undefined) return cached;

  if (!measureCtx) {
    measureCtx = document.createElement('canvas').getContext('2d');
    if (!measureCtx) return text.length * 7;
  }
  measureCtx.font = font;
  const width = measureCtx.measureText(text).width;

  if (measureCache.size >= MEASURE_CACHE_MAX) measureCache.clear();
  measureCache.set(key, width);
  return width;
}

/**
 * Infer axis position from key name if not explicitly set.
 * Keys starting with 'x' → 'bottom', everything else → 'left'.
 */
export function inferPosition(key: string, explicit?: AxisPosition): AxisPosition {
  if (explicit) return explicit;
  return key === 'x' || key.startsWith('x') ? 'bottom' : 'left';
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

export function computeLayout(
  containerWidth: number,
  containerHeight: number,
  config: ChartConfig,
  scales: Map<string, Scale>,
  dpr: number,
  fontFamily: string,
  fontSize: number,
): Layout {
  const padding = {
    top: config.padding?.top ?? DEFAULT_PADDING.top,
    right: config.padding?.right ?? DEFAULT_PADDING.right,
    bottom: config.padding?.bottom ?? DEFAULT_PADDING.bottom,
    left: config.padding?.left ?? DEFAULT_PADDING.left,
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
      // from AxesRenderer to keep Layout free of renderer dependencies.
      const lo = Math.min(scale.min, scale.max);
      const hi = Math.max(scale.min, scale.max);
      const ticks =
        ac.ticks && ac.ticks.length > 0
          ? ac.ticks.filter((t) => Number.isFinite(t) && t >= lo && t <= hi)
          : scale.ticks(ac.tickCount ?? DEFAULT_TICK_COUNT);
      const format = ac.tickFormat ?? ((v: number) => scale.tickFormat(v));
      let maxWidth = 0;
      for (const t of ticks) {
        const width = measureTextWidth(format(t), fontFamily, fontSize);
        if (width > maxWidth) maxWidth = width;
      }
      // Tick mark + label gap + label width + optional title strip, rounded
      // up to an 8px step. Quantizing keeps the gutter stable while tick
      // labels shift by a character during pan/zoom, so the plot rect does
      // not jitter and the layout stays reusable across gesture frames.
      const titleSpace = ac.label ? titleStrip : EDGE_MARGIN;
      const needed = Math.ceil(
        (maxWidth + AXIS_TICK_LENGTH + AXIS_LABEL_GAP + titleSpace) / 8,
      ) * 8;
      if (pos === 'left') {
        leftAxisWidth = Math.max(leftAxisWidth, needed);
      } else {
        rightAxisWidth = Math.max(rightAxisWidth, needed);
      }
    } else {
      const lo = Math.min(scale.min, scale.max);
      const hi = Math.max(scale.min, scale.max);
      const ticks = ac.ticks && ac.ticks.length > 0
        ? ac.ticks.filter(t => Number.isFinite(t) && t >= lo && t <= hi).sort((a, b) => a - b)
        : scale.ticks(ac.tickCount ?? DEFAULT_TICK_COUNT).sort((a, b) => a - b);
      const format = ac.tickFormat ?? ((value: number) => scale.tickFormat(value));
      if (ticks.length > 0) {
        horizontalEdges.push({
          firstHalf: measureTextWidth(format(ticks[0]), fontFamily, fontSize) / 2,
          lastHalf: measureTextWidth(format(ticks[ticks.length - 1]), fontFamily, fontSize) / 2,
          firstFraction: horizontalFraction(scale, ticks[0]),
          lastFraction: horizontalFraction(scale, ticks[ticks.length - 1]),
        });
      }
      const needed = Math.ceil(
        AXIS_TICK_LENGTH +
        AXIS_LABEL_GAP +
        lineHeight +
        (ac.label ? AXIS_TITLE_GAP + lineHeight : 0) +
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
  const plotTop = topAxisHeight;
  const plotWidth = Math.max(0, containerWidth - leftAxisWidth - rightAxisWidth);
  const plotHeight = Math.max(0, containerHeight - topAxisHeight - bottomAxisHeight);

  // Build axis regions keyed by axis config key
  const axes: Layout['axes'] = {};
  for (const [key, pos] of axisPositions) {
    switch (pos) {
      case 'top':
        axes[key] = { position: 'top', area: { left: plotLeft, top: 0, width: plotWidth, height: topAxisHeight } };
        break;
      case 'bottom':
        axes[key] = { position: 'bottom', area: { left: plotLeft, top: plotTop + plotHeight, width: plotWidth, height: bottomAxisHeight } };
        break;
      case 'left':
        axes[key] = { position: 'left', area: { left: 0, top: plotTop, width: leftAxisWidth, height: plotHeight } };
        break;
      case 'right':
        axes[key] = { position: 'right', area: { left: plotLeft + plotWidth, top: plotTop, width: rightAxisWidth, height: plotHeight } };
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
