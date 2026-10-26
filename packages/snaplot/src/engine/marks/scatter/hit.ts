/**
 * The scatter mark's hit half (plan §3.1; M12a): the shared hit test finds its nearest point
 * through a screen-space grid (it is the cloud mark), and its hover indicator is a dot of the
 * point's own radius. A density-rendered series shows no dot: its pixels are bins, not points.
 */
import type { MarkHit } from '../../hit';
import { drawIndicatorDot } from '../line/hit';
import { isDensityScatterSeries } from './draw';

export const scatterHit: MarkHit = {
  tooltipRank: 0,
  indicator(pass) {
    // Density scatter represents aggregate bins, not a single datum. A
    // nearest-point dot is misleading, so only point-rendered scatter gets
    // the unified indicator style.
    if (isDensityScatterSeries(pass.series, pass.store.length)) return;
    drawIndicatorDot(pass, pass.point.radius ?? pass.series.pointRadius ?? 3);
  },
};
