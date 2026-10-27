/** Where a pointer is on the chart, and how far a wheel notch zooms: pure helpers of gestures.ts. */
import type { Layout } from '../spec';
import type { AreaResult } from './gesture-state';
import { DEFAULT_WHEEL_STEP } from '../../constants';

/**
 * The pointer in the chart's own CSS pixels: corrected for a CSS transform or `zoom` on an
 * ancestor, which scale the on-screen box but not the layout (interact-12).
 */
export function localPoint(
  target: HTMLElement,
  e: PointerEvent | WheelEvent | MouseEvent,
): { x: number; y: number } {
  const rect = target.getBoundingClientRect();
  // offsetWidth is a whole number and the box fractional: within a pixel there is no transform.
  const scale = (box: number, layout: number) =>
    layout > 0 && Math.abs(box - layout) > 1 ? box / layout : 1;
  const sx = scale(rect.width, target.offsetWidth);
  const sy = scale(rect.height, target.offsetHeight);
  return { x: (e.clientX - rect.left) / sx, y: (e.clientY - rect.top) / sy };
}

/**
 * Inclusive, like layout's isInPlotArea: a point on the plot's edge (a data extreme now that
 * domains are not padded) is in the plot.
 */
export function inPlot({ plot }: Layout, x: number, y: number): boolean {
  return (
    x >= plot.left && x <= plot.left + plot.width && y >= plot.top && y <= plot.top + plot.height
  );
}

/** The plot, the axis gutter (by its layout entry) or outside, under a point. */
export function areaAt(layout: Layout, x: number, y: number): AreaResult {
  if (inPlot(layout, x, y)) return { type: 'plot' };
  for (const [key, { area }] of Object.entries(layout.axes)) {
    if (
      x >= area.left &&
      x <= area.left + area.width &&
      y >= area.top &&
      y <= area.top + area.height
    )
      return { type: 'axis', axisKey: key };
  }
  return { type: 'outside' };
}

/**
 * The zoom factor of one wheel event: up to 20 px of delta, scaled by `wheelStep` (negative
 * steps clamp to 0: an inverted wheel has no use). Down zooms out, up zooms in.
 */
export function wheelFactor(deltaY: number, wheelStep: number | undefined): number {
  const strength = Math.max(0, wheelStep ?? DEFAULT_WHEEL_STEP);
  const delta = Math.min(Math.abs(deltaY), 20) * 0.005;
  return deltaY > 0 ? 1 + delta * strength * 10 : 1 / (1 + delta * strength * 10);
}
