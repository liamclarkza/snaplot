import type { Layout, ChartConfig, Scale, AxisPosition } from '../types';
import { DEFAULT_PADDING, DEFAULT_TICK_COUNT } from '../constants';

/**
 * Computes layout regions using the outside-in algorithm:
 * 1. Start with total container dimensions
 * 2. Reserve space for axes (measured from widest tick label)
 * 3. Plot area gets whatever remains
 *
 * Computed once on init + on ResizeObserver, never per frame.
 */

/**
 * Measure the width of text using a hidden span.
 * Caches the measurement element to avoid repeated DOM creation.
 */
let measureSpan: HTMLSpanElement | null = null;

function measureText(
  text: string,
  fontFamily: string,
  fontSize: number,
): { width: number; height: number } {
  if (typeof document === 'undefined') return { width: text.length * 7, height: fontSize * 1.2 };

  if (!measureSpan) {
    measureSpan = document.createElement('span');
    measureSpan.style.cssText =
      'position:absolute;visibility:hidden;white-space:nowrap;pointer-events:none;';
    document.body.appendChild(measureSpan);
  }

  measureSpan.style.fontFamily = fontFamily;
  measureSpan.style.fontSize = fontSize + 'px';
  measureSpan.textContent = text;

  return {
    width: measureSpan.offsetWidth,
    height: measureSpan.offsetHeight,
  };
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
  const bottomAxisHeight = padding.bottom;
  const topAxisHeight = padding.top;

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
      let maxWidth = 0;
      for (const t of ticks) {
        const label = scale.tickFormat(t);
        const { width } = measureText(label, fontFamily, fontSize);
        if (width > maxWidth) maxWidth = width;
      }
      // Tick mark (4px) + gap (8px) + label width + margin (4px)
      const needed = maxWidth + 16;
      if (pos === 'left') {
        leftAxisWidth = Math.max(leftAxisWidth, needed);
      } else {
        rightAxisWidth = Math.max(rightAxisWidth, needed);
      }
    }
    // top/bottom axes don't need extra width measurement (height is from padding)
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
