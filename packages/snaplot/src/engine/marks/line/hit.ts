/**
 * The line mark's hit half (plan §3.1; M12a): its rows come from the shared hit test (the
 * HitTester, by X in `index` mode and by distance in `nearest` mode), and its hover indicator is a
 * dot, which the area, band and scatter marks share.
 */
import type { IndicatorPass, MarkHit } from '../../hit';

/**
 * The hover dot of a tooltip point: a white halo (with a soft drop shadow on light surfaces) and a
 * dot of `radius` CSS pixels in the point's colour.
 */
export function drawIndicatorDot(pass: IndicatorPass, radius: number): void {
  const { ctx, point } = pass;
  const px = pass.xScale.dataToPixel(point.x);
  const py = pass.yScale.dataToPixel(point.y);

  // On light backgrounds, a subtle drop-shadow gives the dot depth
  // without needing a dark ring stroke.
  if (!pass.isDark) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1;
  }

  // White ring slightly larger than the fill, acts as a clean halo.
  ctx.beginPath();
  ctx.arc(px, py, radius + 1.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Clear shadow for the inner fill so it's crisp.
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Filled center with the series color
  ctx.beginPath();
  ctx.arc(px, py, radius, 0, Math.PI * 2);
  ctx.fillStyle = point.color;
  ctx.fill();
}

/** The dot radius of a line-like mark's hover indicator (CSS pixels). */
export const INDICATOR_RADIUS = 4;

export const lineHit: MarkHit = {
  tooltipRank: 0,
  indicator: (pass) => drawIndicatorDot(pass, INDICATOR_RADIUS),
};
