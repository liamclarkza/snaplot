/**
 * The histogram mark's hit half (plan §3.1; M12a): a slot mark that leads the tooltip (rank 2). At
 * the cursor's X it gives the row of the bin under it (its range and count), a click lands on the
 * bin, and the hover indicator lightens it. Also the bin lookups the cursor uses.
 */
import type { ChartCore } from '../../Engine';
import type { DataStore } from '../../data/DataStore';
import { tooltipFormatters } from '../../format';
import type { MarkHit } from '../../hit';
import type { TooltipPoint } from '../../spec';
import { barSpan } from '../bar/hit';
import { seriesYColumn } from '../columns';

/**
 * The bin under `dataX`: the largest b with edges[b] <= dataX (edges are sorted, so O(log n)).
 * Bins are left-edge inclusive, and the exact final edge maps to the final bin so a click on the
 * right border still selects that bar.
 */
export function histogramBinIndexForDataX(dataX: number, store: DataStore): number | null {
  if (store.length < 2) return null;

  const firstEdge = store.xAt(0);
  const lastEdge = store.xAt(store.length - 1);
  if (dataX < firstEdge || dataX > lastEdge) return null;

  let binIdx = store.upperBoundX(dataX);
  if (binIdx === store.length - 1 && dataX === lastEdge) {
    binIdx = store.length - 2;
  }

  if (binIdx < 0 || binIdx >= store.length - 1) return null;
  return binIdx;
}

export function histogramBinRange(
  dataIndex: number,
  store: DataStore,
): { min: number; max: number } | null {
  if (dataIndex < 0 || dataIndex >= store.length - 1) return null;
  return {
    min: store.xAt(dataIndex),
    max: store.xAt(dataIndex + 1),
  };
}

/** The tooltip row of histogram series `si` at the cursor's X: the bin range and its count. */
function binPoint(engine: ChartCore, si: number): TooltipPoint | null {
  if (engine.cursorX === null) return null;
  const palette = engine.categoricalPalette();
  const series = engine.config.series[si];
  const store = engine.storeForSeries(si);
  if (store.length === 0) return null;
  if (series.visible === false) return null;

  const xScale = engine.scales.get(series.xAxis ?? 'x');
  if (!xScale) return null;
  const dataX = xScale.pixelToData(engine.cursorX);

  const colIdx = seriesYColumn(series);
  if (colIdx < 1 || colIdx > store.seriesCount) return null;

  const color = series.color ?? palette[(series.paletteIndex ?? si) % palette.length];

  const b = histogramBinIndexForDataX(dataX, store);
  if (b === null) return null;

  const binMin = store.xAt(b);
  const binMax = store.xAt(b + 1);
  const count = store.yAt(colIdx - 1, b);

  const fmt = tooltipFormatters(engine);
  return {
    seriesIndex: si,
    dataIndex: b,
    label: series.label,
    x: (binMin + binMax) / 2,
    xRange: { min: binMin, max: binMax },
    y: count,
    color,
    formattedX: engine.formatHistogramBinRange(binMin, binMax, si),
    formattedY: fmt?.y ? fmt.y(count, si) : engine.formatAxisReadout(series.yAxis ?? 'y', count),
  };
}

export const histogramHit: MarkHit = {
  tooltipRank: 2,
  slotPoint: binPoint,
  slotSpan: (engine, point, xScale, slot) =>
    point.xRange
      ? [xScale.dataToPixel(point.xRange.min), xScale.dataToPixel(point.xRange.max)]
      : barSpan(engine, point, xScale, slot),
  indicator({ ctx, point, series, store, xScale, yScale, ringAlpha }) {
    // Highlight hovered bin, edges from X data, counts from Y data
    const colIdx = seriesYColumn(series);
    const binIdx = point.dataIndex;
    if (colIdx >= 1 && colIdx <= store.seriesCount && binIdx < store.length - 1) {
      const x1 = xScale.dataToPixel(store.xAt(binIdx));
      const x2 = xScale.dataToPixel(store.xAt(binIdx + 1));
      const yTop = yScale.dataToPixel(store.yAt(colIdx - 1, binIdx));
      const yBase = yScale.dataToPixel(0);
      ctx.fillStyle = `rgba(255, 255, 255, ${ringAlpha})`;
      ctx.fillRect(x1, Math.min(yTop, yBase), x2 - x1, Math.abs(yTop - yBase));
      ctx.strokeStyle = `rgba(255, 255, 255, ${ringAlpha * 2})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(x1, Math.min(yTop, yBase), x2 - x1, Math.abs(yTop - yBase));
    }
  },
};
