import type { Scale, SeriesConfig, TooltipPoint } from '../types';
import type { ColumnarStore } from '../data/ColumnarStore';
import { nearestIndex, lowerBound, upperBound } from '../data/binarySearch';
import { MOUSE_HIT_RADIUS, TOUCH_HIT_RADIUS } from '../constants';

/**
 * Hit-testing for finding nearest data points to cursor position.
 *
 * For sorted time-series data, binary search is O(log n) — per spec §2:
 * "uPlot's exceptional cursor performance with 100K+ points relies entirely on this"
 *
 * Proximity is chosen per call based on pointer type: fingers get a larger
 * radius (WCAG 2.5.5 tap-target minimum) than a mouse does.
 */

export type PointerKind = 'mouse' | 'touch' | 'pen';

export class HitTester {
  /** Optional override — takes precedence over the pointer-type default. */
  private proximityOverride: number | null;

  constructor(proximityThreshold?: number) {
    this.proximityOverride = proximityThreshold ?? null;
  }

  /** Pin a fixed proximity threshold, overriding the pointer-type default. */
  setProximity(px: number | null): void {
    this.proximityOverride = px;
  }

  private proximityFor(pointerType: PointerKind | undefined): number {
    if (this.proximityOverride !== null) return this.proximityOverride;
    return pointerType === 'touch' ? TOUCH_HIT_RADIUS : MOUSE_HIT_RADIUS;
  }

  findNearestIndex(store: ColumnarStore, dataX: number): number {
    return nearestIndex(store.x, dataX);
  }

  /**
   * Find tooltip points near the cursor. Returns empty array if nothing is
   * within the active proximity radius — tooltip should be hidden.
   */
  findPoints(
    store: ColumnarStore,
    scales: Map<string, Scale>,
    seriesConfigs: SeriesConfig[],
    pixelX: number,
    pixelY: number,
    mode: 'nearest' | 'index' | 'x',
    palette: string[],
    pointerType?: PointerKind,
  ): TooltipPoint[] {
    const xScale = scales.get('x');
    if (!xScale || store.length === 0) return [];

    const proximity = this.proximityFor(pointerType);
    const dataX = xScale.pixelToData(pixelX);
    const idx = nearestIndex(store.x, dataX);

    if (mode === 'index' || mode === 'x') {
      return this.pointsAtIndex(store, scales, seriesConfigs, idx, pixelX, pixelY, palette, proximity);
    }

    return this.nearestPoint(store, scales, seriesConfigs, idx, pixelX, pixelY, palette, proximity);
  }

  private pointsAtIndex(
    store: ColumnarStore,
    scales: Map<string, Scale>,
    seriesConfigs: SeriesConfig[],
    idx: number,
    pixelX: number,
    pixelY: number,
    palette: string[],
    proximity: number,
  ): TooltipPoint[] {
    const xScale = scales.get('x')!;
    const points: TooltipPoint[] = [];

    // Check proximity: cursor must be close to at least one series line (Y distance)
    let closestYDist = Infinity;

    for (let si = 0; si < seriesConfigs.length; si++) {
      const sc = seriesConfigs[si];
      if (sc.visible === false) continue;

      const colIdx = sc.dataIndex;
      if (colIdx < 1 || colIdx > store.seriesCount) continue;

      const yVal = store.y(colIdx - 1)[idx];
      if (yVal !== yVal) continue; // NaN

      const yAxisKey = sc.yAxisKey ?? 'y';
      const yScale = scales.get(yAxisKey);
      if (yScale) {
        const py = yScale.dataToPixel(yVal);
        closestYDist = Math.min(closestYDist, Math.abs(py - pixelY));
      }

      const xVal = store.x[idx];

      points.push({
        seriesIndex: si,
        dataIndex: idx,
        label: sc.label,
        x: xVal,
        y: yVal,
        color: sc.stroke ?? palette[si % palette.length],
        formattedX: xScale.tickFormat(xVal),
        formattedY: yScale ? yScale.tickFormat(yVal) : String(yVal),
      });
    }

    // Only show tooltip if cursor is near a series line
    if (closestYDist > proximity) return [];

    return points;
  }

  private nearestPoint(
    store: ColumnarStore,
    scales: Map<string, Scale>,
    seriesConfigs: SeriesConfig[],
    idx: number,
    pixelX: number,
    pixelY: number,
    palette: string[],
    proximity: number,
  ): TooltipPoint[] {
    const xScale = scales.get('x')!;
    let bestDist = Infinity;
    let bestPoint: TooltipPoint | null = null;

    // Search all points within `proximity` pixels on the X axis so we find
    // the true euclidean-nearest point, not just the nearest in X-sorted
    // index space (which would miss vertically-close points).
    const xDataLeft = xScale.pixelToData(pixelX - proximity);
    const xDataRight = xScale.pixelToData(pixelX + proximity);
    const startIdx = Math.max(0, lowerBound(store.x, xDataLeft));
    const endIdx = Math.min(store.length - 1, upperBound(store.x, xDataRight));

    for (let si = 0; si < seriesConfigs.length; si++) {
      const sc = seriesConfigs[si];
      if (sc.visible === false) continue;

      const colIdx = sc.dataIndex;
      if (colIdx < 1 || colIdx > store.seriesCount) continue;

      const yAxisKey = sc.yAxisKey ?? 'y';
      const yScale = scales.get(yAxisKey);
      if (!yScale) continue;

      for (let i = startIdx; i <= endIdx; i++) {
        const yVal = store.y(colIdx - 1)[i];
        if (yVal !== yVal) continue;

        const px = xScale.dataToPixel(store.x[i]);
        const py = yScale.dataToPixel(yVal);

        const dist = (px - pixelX) ** 2 + (py - pixelY) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          bestPoint = {
            seriesIndex: si,
            dataIndex: i,
            label: sc.label,
            x: store.x[i],
            y: yVal,
            color: sc.stroke ?? palette[si % palette.length],
            formattedX: xScale.tickFormat(store.x[i]),
            formattedY: yScale.tickFormat(yVal),
          };
        }
      }
    }

    // Only return if within proximity threshold
    if (bestPoint && Math.sqrt(bestDist) <= proximity) {
      return [bestPoint];
    }
    return [];
  }
}
