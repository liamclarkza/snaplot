import type { Layout, CursorConfig } from '../types';
import { prefersReducedMotion } from '../utils/motion';

/**
 * Renders crosshair and selection box on the overlay canvas.
 * This layer redraws at 60fps on mouse move, keep it cheap.
 */

export function renderCrosshair(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  layout: Layout,
  config: CursorConfig,
  color: string,
): void {
  const { plot } = layout;

  // Only draw if cursor is within the plot area
  if (x < plot.left || x > plot.left + plot.width) return;
  if (y < plot.top || y > plot.top + plot.height) return;

  ctx.save();
  // Clip to rounded plot area so crosshair lines don't poke into corners.
  ctx.beginPath();
  ctx.roundRect(plot.left, plot.top, plot.width, plot.height, 4);
  ctx.clip();

  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash(config.dash ?? [4, 4]);
  ctx.globalAlpha = 0.7;

  ctx.beginPath();

  // Vertical crosshair line
  if (config.xLine !== false) {
    const px = Math.round(x) + (layout.dpr === 1 ? 0.5 : 0);
    ctx.moveTo(px, plot.top);
    ctx.lineTo(px, plot.top + plot.height);
  }

  // Horizontal crosshair line
  if (config.yLine) {
    const py = Math.round(y) + (layout.dpr === 1 ? 0.5 : 0);
    ctx.moveTo(plot.left, py);
    ctx.lineTo(plot.left + plot.width, py);
  }

  ctx.stroke();
  ctx.restore();
}

/**
 * Draw a short-lived ring at the tap point so touch users get feedback that
 * the chart registered their gesture. The caller supplies `progress` in [0, 1]
 * so this renderer stays stateless.
 */
export function renderTapRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  progress: number,
  color: string,
): void {
  const minRadius = 8;
  const maxRadius = 26;
  let radius: number;
  if (prefersReducedMotion()) {
    // Reduced motion: no expanding-ring animation. Hold a fixed radius and
    // let only the opacity fade out, an opacity crossfade is the accessible
    // stand-in the WCAG reduced-motion guidance recommends over movement.
    radius = maxRadius;
  } else {
    // Ease-out cubic, rapid initial growth, soft settle.
    const eased = 1 - (1 - progress) ** 3;
    radius = minRadius + (maxRadius - minRadius) * eased;
  }
  const alpha = 0.45 * (1 - progress);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function renderSelectionBox(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  layout: Layout,
): void {
  const { plot } = layout;

  // Clamp to plot area
  const x1 = Math.max(plot.left, Math.min(startX, endX));
  const x2 = Math.min(plot.left + plot.width, Math.max(startX, endX));
  const y1 = Math.max(plot.top, Math.min(startY, endY));
  const y2 = Math.min(plot.top + plot.height, Math.max(startY, endY));

  // Snap to the pixel grid so the 1px outline stays crisp during the drag.
  const offset = layout.dpr === 1 ? 0.5 : 0;
  const rx = Math.round(x1);
  const ry = Math.round(y1);
  const rw = Math.round(x2) - rx;
  const rh = Math.round(y2) - ry;

  ctx.save();
  // A mid-blue accent reads as a light tint on dark surfaces and a light
  // wash on light ones, so a single hue works across every theme; the higher
  // stroke alpha gives the edge definition the soft fill lacks.
  ctx.fillStyle = 'rgba(99, 148, 255, 0.16)';
  ctx.fillRect(rx, ry, rw, rh);
  ctx.strokeStyle = 'rgba(99, 148, 255, 0.9)';
  ctx.lineWidth = 1;
  ctx.strokeRect(rx + offset, ry + offset, rw, rh);
  ctx.restore();
}
