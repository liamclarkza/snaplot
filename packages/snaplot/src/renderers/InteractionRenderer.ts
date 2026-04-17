import type { Layout, CursorConfig } from '../types';

/**
 * Renders crosshair and selection box on the overlay canvas.
 * This layer redraws at 60fps on mouse move — keep it cheap.
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
  // Ease-out cubic — rapid initial growth, soft settle.
  const eased = 1 - (1 - progress) ** 3;
  const minRadius = 8;
  const maxRadius = 26;
  const radius = minRadius + (maxRadius - minRadius) * eased;
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

  const w = x2 - x1;
  const h = y2 - y1;

  ctx.save();
  ctx.fillStyle = 'rgba(100, 150, 255, 0.15)';
  ctx.fillRect(x1, y1, w, h);
  ctx.strokeStyle = 'rgba(100, 150, 255, 0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x1, y1, w, h);
  ctx.restore();
}
