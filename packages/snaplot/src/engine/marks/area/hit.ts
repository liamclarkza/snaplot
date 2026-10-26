/**
 * The area mark's hit half (plan §3.1; M12a): like a line, its rows come from the shared hit test
 * along its top edge, and its hover indicator is the line's dot.
 */
import type { MarkHit } from '../../hit';
import { drawIndicatorDot, INDICATOR_RADIUS } from '../line/hit';

export const areaHit: MarkHit = {
  tooltipRank: 0,
  indicator: (pass) => drawIndicatorDot(pass, INDICATOR_RADIUS),
};
