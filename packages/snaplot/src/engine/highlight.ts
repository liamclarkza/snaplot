/**
 * Series highlight: the highlighted series (the others dim per `highlight.dimOpacity`), and the
 * `highlight.proximity` hover that focuses the series nearest the pointer.
 */
import type { ChartCore } from './Engine';
import { DirtyFlag } from './spec';

/**
 * Set the highlighted series (`null` clears). Non-highlighted series dim
 * per `highlight.dimOpacity`. No-op when the value is unchanged.
 */
export function setHighlight(engine: ChartCore, seriesIndex: number | null): void {
  const normalized = normalizeHighlightIndex(engine, seriesIndex);

  // Equality guard: prevents redundant redraws and breaks group sync loops.
  if (engine.highlightedSeries === normalized) return;

  engine.highlightedSeries = normalized;
  engine.scheduler.markDirty(DirtyFlag.DATA);
  engine.emitEvent('highlight:change', normalized);
}

export function normalizeHighlightIndex(
  engine: ChartCore,
  seriesIndex: number | null,
): number | null {
  if (seriesIndex === null) return null;
  if (!Number.isInteger(seriesIndex)) return null;
  if (seriesIndex < 0 || seriesIndex >= engine.config.series.length) return null;
  if (engine.config.series[seriesIndex]?.visible === false) return null;
  return seriesIndex;
}

/**
 * highlight.proximity: auto-focus the series whose hit-tested point is
 * vertically closest to the pointer, clear when none is within range.
 * setHighlight() no-ops on unchanged values, so steady hover costs
 * nothing, and sync propagation rides the normal highlight path.
 */
export function applyProximityHighlight(engine: ChartCore): void {
  const proximity = engine.config.highlight?.proximity;
  if (proximity === undefined || engine.config.highlight?.enabled === false) return;
  if (engine.mouseY === null) return;

  let best: number | null = null;
  let bestDist = Infinity;
  for (const point of engine.tooltipPoints) {
    const sc = engine.config.series[point.seriesIndex];
    if (!sc) continue;
    const yScale = engine.scales.get(sc.yAxis ?? 'y');
    if (!yScale) continue;
    const py = yScale.dataToPixel(point.y);
    if (!Number.isFinite(py)) continue;
    const dist = Math.abs(py - engine.mouseY);
    if (dist < bestDist) {
      bestDist = dist;
      best = point.seriesIndex;
    }
  }

  engine.setHighlight(bestDist <= proximity ? best : null);
}

export function clearProximityHighlight(engine: ChartCore): void {
  if (engine.config.highlight?.proximity === undefined) return;
  if (engine.config.highlight?.enabled === false) return;
  engine.setHighlight(null);
}
