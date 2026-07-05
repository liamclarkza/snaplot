import type { Layout, ChartConfig, Scale, AxisPosition } from '../types';
import { DEFAULT_PADDING, DEFAULT_TICK_COUNT } from '../constants';

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

  // Axis titles get their own strip along the outer edge of the gutter.
  const titleStrip = fontSize + 8;

  // Build a map of axis key → position for later use
  const axisPositions = new Map<string, AxisPosition>();
  const axisConfigs = config.axes ?? {};

  for (const [key, ac] of Object.entries(axisConfigs)) {
    const pos = inferPosition(key, ac.position);
    axisPositions.set(key, pos);

    const scale = scales.get(key);
    if (!scale) continue;

    if (pos === 'left' || pos === 'right') {
      const ticks = scale.ticks(DEFAULT_TICK_COUNT);
      const format = ac.tickFormat ?? ((v: number) => scale.tickFormat(v));
      let maxWidth = 0;
      for (const t of ticks) {
        const width = measureTextWidth(format(t), fontFamily, fontSize);
        if (width > maxWidth) maxWidth = width;
      }
      // Tick mark (4px) + gap (8px) + label width + margin (4px), rounded
      // up to an 8px step. Quantizing keeps the gutter stable while tick
      // labels shift by a character during pan/zoom, so the plot rect does
      // not jitter and the layout stays reusable across gesture frames.
      const titleSpace = ac.label ? titleStrip : 0;
      const needed = Math.ceil((maxWidth + 16 + titleSpace) / 8) * 8;
      if (pos === 'left') {
        leftAxisWidth = Math.max(leftAxisWidth, needed);
      } else {
        rightAxisWidth = Math.max(rightAxisWidth, needed);
      }
    } else if (ac.label) {
      // top/bottom tick labels fit inside the padding; only a title needs
      // extra height.
      if (pos === 'bottom') bottomAxisHeight = Math.max(bottomAxisHeight, padding.bottom + titleStrip);
      else topAxisHeight = Math.max(topAxisHeight, padding.top + titleStrip);
    }
  }

  // Symmetric: when both left and right axes have labels, use the wider for both
  if (leftAxisWidth > padding.left && rightAxisWidth > padding.right) {
    const symmetric = Math.max(leftAxisWidth, rightAxisWidth);
    leftAxisWidth = symmetric;
    rightAxisWidth = symmetric;
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
