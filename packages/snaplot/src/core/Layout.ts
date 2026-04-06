import type { Layout, ChartConfig, Scale } from '../types';
import { DEFAULT_PADDING, DEFAULT_TICK_COUNT } from '../constants';

/**
 * Computes layout regions using the outside-in algorithm:
 * 1. Start with total container dimensions
 * 2. Reserve space for axes (measured from widest tick label)
 * 3. Plot area gets whatever remains
 *
 * Computed once on init + on ResizeObserver — never per frame.
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

  // Measure Y-axis label widths from the left Y scale
  let leftAxisWidth = padding.left;
  let rightAxisWidth = padding.right;
  const bottomAxisHeight = padding.bottom;
  const topAxisHeight = padding.top;

  // Try to measure actual tick label widths for better layout
  const yScale = scales.get('y');
  if (yScale) {
    const ticks = yScale.ticks(DEFAULT_TICK_COUNT);
    let maxWidth = 0;
    for (const t of ticks) {
      const label = yScale.tickFormat(t);
      const { width } = measureText(label, fontFamily, fontSize);
      if (width > maxWidth) maxWidth = width;
    }
    // Tick mark (4px) + gap (8px) + label width + margin (4px)
    leftAxisWidth = Math.max(leftAxisWidth, maxWidth + 16);
  }

  const y2Scale = scales.get('y2');
  if (y2Scale) {
    const ticks = y2Scale.ticks(DEFAULT_TICK_COUNT);
    let maxWidth = 0;
    for (const t of ticks) {
      const label = y2Scale.tickFormat(t);
      const { width } = measureText(label, fontFamily, fontSize);
      if (width > maxWidth) maxWidth = width;
    }
    rightAxisWidth = Math.max(rightAxisWidth, maxWidth + 16);

    // Symmetric: when both axes have labels, use the wider of the two for both
    const symmetric = Math.max(leftAxisWidth, rightAxisWidth);
    leftAxisWidth = symmetric;
    rightAxisWidth = symmetric;
  }

  const plotLeft = leftAxisWidth;
  const plotTop = topAxisHeight;
  const plotWidth = Math.max(0, containerWidth - leftAxisWidth - rightAxisWidth);
  const plotHeight = Math.max(0, containerHeight - topAxisHeight - bottomAxisHeight);

  return {
    width: containerWidth,
    height: containerHeight,
    plot: {
      top: plotTop,
      left: plotLeft,
      width: plotWidth,
      height: plotHeight,
    },
    axes: {
      top: {
        left: plotLeft,
        top: 0,
        width: plotWidth,
        height: topAxisHeight,
      },
      bottom: {
        left: plotLeft,
        top: plotTop + plotHeight,
        width: plotWidth,
        height: bottomAxisHeight,
      },
      left: {
        left: 0,
        top: plotTop,
        width: leftAxisWidth,
        height: plotHeight,
      },
      right: {
        left: plotLeft + plotWidth,
        top: plotTop,
        width: rightAxisWidth,
        height: plotHeight,
      },
    },
    dpr,
  };
}
