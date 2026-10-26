/**
 * The band mark's hit half (plan §3.1; M12a): its rows read the centre line (`yColumn`) through
 * the shared hit test, and its hover indicator is the line's dot.
 */
import type { MarkHit } from '../../hit';
import { drawIndicatorDot, INDICATOR_RADIUS } from '../line/hit';

export const bandHit: MarkHit = {
  tooltipRank: 0,
  indicator: (pass) => drawIndicatorDot(pass, INDICATOR_RADIUS),
};
