import type { Scale, SeriesConfig, TooltipPoint } from '../types';
import type { DataStore } from '../data/DataStore';
import { MOUSE_HIT_RADIUS, TOUCH_HIT_RADIUS } from '../constants';
import {
  createScatterStyleResolver,
  seriesYDataIndex,
  scatterTooltipFields,
  scatterXDataIndex,
  type ScatterPalettes,
} from '../renderers/scatterEncoding';

/**
 * Hit-testing for finding nearest data points to cursor position.
 *
 * For sorted time-series data, binary search is O(log n), per spec §2:
 * "uPlot's exceptional cursor performance with 100K+ points relies entirely on this"
 *
 * Proximity is chosen per call based on pointer type: fingers get a larger
 * radius (WCAG 2.5.5 tap-target minimum) than a mouse does.
 */

export type PointerKind = 'mouse' | 'touch' | 'pen';

export class HitTester {
  /** Optional override, takes precedence over the pointer-type default. */
  private proximityOverride: number | null;
  private scatterGridCache: ScatterGridCache | null = null;

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

  findNearestIndex(store: DataStore, dataX: number): number {
    return store.nearestXIndex(dataX);
  }

  /**
   * Find tooltip points near the cursor. Returns empty array if nothing is
   * within the active proximity radius, tooltip should be hidden.
   */
  findPoints(
    store: DataStore,
    scales: Map<string, Scale>,
    seriesConfigs: SeriesConfig[],
    pixelX: number,
    pixelY: number,
    mode: 'nearest' | 'index' | 'x',
    palette: string[],
    pointerType?: PointerKind,
    scatterPalettes?: ScatterPalettes,
    dataVersion = 0,
  ): TooltipPoint[] {
    const xScale = scales.get('x');
    if (!xScale || store.length === 0) return [];

    const proximity = this.proximityFor(pointerType);

    if (mode === 'index' || mode === 'x') {
      return this.pointsAtIndex(store, scales, seriesConfigs, pixelX, pixelY, palette, proximity);
    }

    return this.nearestPoint(
      store,
      scales,
      seriesConfigs,
      pixelX,
      pixelY,
      palette,
      proximity,
      scatterPalettes ?? { categorical: palette },
      dataVersion,
    );
  }

  private pointsAtIndex(
    store: DataStore,
    scales: Map<string, Scale>,
    seriesConfigs: SeriesConfig[],
    pixelX: number,
    pixelY: number,
    palette: string[],
    proximity: number,
  ): TooltipPoint[] {
    const points: TooltipPoint[] = [];

    // Check proximity: cursor must be close to at least one series line (Y distance)
    let closestYDist = Infinity;

    for (let si = 0; si < seriesConfigs.length; si++) {
      const sc = seriesConfigs[si];
      if (sc.visible === false) continue;

      const colIdx = seriesYDataIndex(sc);
      if (colIdx < 1 || colIdx > store.seriesCount) continue;

      const xScale = scales.get(sc.xAxisKey ?? 'x');
      if (!xScale) continue;

      const idx = store.nearestXIndex(xScale.pixelToData(pixelX));
      const yVal = store.yAt(colIdx - 1, idx);
      if (yVal !== yVal) continue; // NaN

      const yAxisKey = sc.yAxisKey ?? 'y';
      const yScale = scales.get(yAxisKey);
      if (yScale) {
        const py = yScale.dataToPixel(yVal);
        closestYDist = Math.min(closestYDist, Math.abs(py - pixelY));
      }

      const xVal = store.xAt(idx);

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
    store: DataStore,
    scales: Map<string, Scale>,
    seriesConfigs: SeriesConfig[],
    pixelX: number,
    pixelY: number,
    palette: string[],
    proximity: number,
    scatterPalettes: ScatterPalettes,
    dataVersion: number,
  ): TooltipPoint[] {
    let bestDist = Infinity;
    let bestPoint: TooltipPoint | null = null;

    for (let si = 0; si < seriesConfigs.length; si++) {
      const sc = seriesConfigs[si];
      if (sc.visible === false) continue;

      if (sc.type === 'scatter') {
        const scatterPoint = this.nearestScatterPoint(
          store,
          scales,
          sc,
          si,
          pixelX,
          pixelY,
          palette[si % palette.length],
          proximity,
          scatterPalettes,
          dataVersion,
        );
        if (scatterPoint) {
          const dist = (scatterPoint.pixelX - pixelX) ** 2 + (scatterPoint.pixelY - pixelY) ** 2;
          if (dist < bestDist) {
            bestDist = dist;
            bestPoint = scatterPoint.point;
          }
        }
        continue;
      }

      const colIdx = seriesYDataIndex(sc);
      if (colIdx < 1 || colIdx > store.seriesCount) continue;

      const xScale = scales.get(sc.xAxisKey ?? 'x');
      if (!xScale) continue;

      const yAxisKey = sc.yAxisKey ?? 'y';
      const yScale = scales.get(yAxisKey);
      if (!yScale) continue;

      // Search all points within `proximity` pixels on this series' X axis
      // so multi-X-axis charts use the correct data-space window.
      const xDataLeft = xScale.pixelToData(pixelX - proximity);
      const xDataRight = xScale.pixelToData(pixelX + proximity);
      const startIdx = Math.max(0, store.lowerBoundX(xDataLeft));
      const endIdx = Math.min(store.length - 1, store.upperBoundX(xDataRight));

      for (let i = startIdx; i <= endIdx; i++) {
        const yVal = store.yAt(colIdx - 1, i);
        if (yVal !== yVal) continue;

        const xVal = store.xAt(i);
        const px = xScale.dataToPixel(xVal);
        const py = yScale.dataToPixel(yVal);

        const dist = (px - pixelX) ** 2 + (py - pixelY) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          bestPoint = {
            seriesIndex: si,
            dataIndex: i,
            label: sc.label,
            x: xVal,
            y: yVal,
            color: sc.stroke ?? palette[si % palette.length],
            formattedX: xScale.tickFormat(xVal),
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

  private nearestScatterPoint(
    store: DataStore,
    scales: Map<string, Scale>,
    sc: SeriesConfig,
    seriesIndex: number,
    pixelX: number,
    pixelY: number,
    fallbackColor: string,
    proximity: number,
    palettes: ScatterPalettes,
    dataVersion: number,
  ): { point: TooltipPoint; pixelX: number; pixelY: number } | null {
    const xScale = scales.get(sc.xAxisKey ?? 'x');
    const yScale = scales.get(sc.yAxisKey ?? 'y');
    if (!xScale || !yScale) return null;

    const yCol = seriesYDataIndex(sc);
    const xCol = scatterXDataIndex(sc);
    if (xCol < 0 || xCol > store.seriesCount || yCol < 1 || yCol > store.seriesCount) return null;

    const grid = this.getScatterGrid(
      store,
      sc,
      seriesIndex,
      xScale,
      yScale,
      proximity,
      dataVersion,
    );
    const cx = Math.floor(pixelX / proximity);
    const cy = Math.floor(pixelY / proximity);
    let bestIdx: number | null = null;
    let bestDist = Infinity;

    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const indices = grid.cells.get(`${gx}:${gy}`);
        if (!indices) continue;
        for (const idx of indices) {
          const px = grid.pixelX[idx];
          const py = grid.pixelY[idx];
          const dist = (px - pixelX) ** 2 + (py - pixelY) ** 2;
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = idx;
          }
        }
      }
    }

    if (bestIdx === null || Math.sqrt(bestDist) > proximity) return null;

    const xVal = store.valueAt(xCol, bestIdx);
    const yVal = store.valueAt(yCol, bestIdx);
    const style = createScatterStyleResolver({
      series: sc,
      fallbackColor,
      fallbackRadius: sc.pointRadius ?? (store.length > 10_000 ? 1.5 : 3),
      palettes,
      columnCount: store.seriesCount + 1,
      ranges: [{ startIdx: 0, endIdx: store.length - 1 }],
      valueAt: (columnIdx, index) => store.valueAt(columnIdx, index),
    });

    return {
      pixelX: grid.pixelX[bestIdx],
      pixelY: grid.pixelY[bestIdx],
      point: {
        seriesIndex,
        dataIndex: bestIdx,
        label: sc.label,
        x: xVal,
        y: yVal,
        color: style.colorAt(bestIdx),
        radius: style.radiusAt(bestIdx),
        formattedX: xScale.tickFormat(xVal),
        formattedY: yScale.tickFormat(yVal),
        fields: scatterTooltipFields(
          sc,
          bestIdx,
          store.seriesCount + 1,
          (columnIdx, index) => store.valueAt(columnIdx, index),
        ),
      },
    };
  }

  private getScatterGrid(
    store: DataStore,
    sc: SeriesConfig,
    seriesIndex: number,
    xScale: Scale,
    yScale: Scale,
    cellSize: number,
    dataVersion: number,
  ): ScatterGridCache {
    const xCol = scatterXDataIndex(sc);
    const yCol = seriesYDataIndex(sc);
    const key = [
      dataVersion,
      seriesIndex,
      xCol,
      yCol,
      store.length,
      xScale.min,
      xScale.max,
      xScale.dataToPixel(xScale.min),
      xScale.dataToPixel(xScale.max),
      yScale.min,
      yScale.max,
      yScale.dataToPixel(yScale.min),
      yScale.dataToPixel(yScale.max),
      cellSize,
    ].join('|');

    if (this.scatterGridCache?.store === store && this.scatterGridCache.key === key) {
      return this.scatterGridCache;
    }

    const cells = new Map<string, number[]>();
    const pixelX = new Float64Array(store.length);
    const pixelY = new Float64Array(store.length);

    for (let i = 0; i < store.length; i++) {
      const x = store.valueAt(xCol, i);
      const y = store.valueAt(yCol, i);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        pixelX[i] = Number.NaN;
        pixelY[i] = Number.NaN;
        continue;
      }
      const px = xScale.dataToPixel(x);
      const py = yScale.dataToPixel(y);
      pixelX[i] = px;
      pixelY[i] = py;
      const cellKey = `${Math.floor(px / cellSize)}:${Math.floor(py / cellSize)}`;
      let bucket = cells.get(cellKey);
      if (!bucket) {
        bucket = [];
        cells.set(cellKey, bucket);
      }
      bucket.push(i);
    }

    this.scatterGridCache = { store, key, cells, pixelX, pixelY };
    return this.scatterGridCache;
  }
}

interface ScatterGridCache {
  store: DataStore;
  key: string;
  cells: Map<string, number[]>;
  pixelX: Float64Array;
  pixelY: Float64Array;
}
