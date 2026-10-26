/**
 * The bar mark's hit half (plan §3.1; M12a): a slot mark (tooltip rank 1). At the cursor's X it
 * gives the row of the nearest slot, a click lands on the bar's rectangle, and the hover indicator
 * lightens that rectangle.
 */
import type { ChartCore } from '../../Engine';
import { tooltipFormatters } from '../../format';
import type { MarkHit, SlotPlace } from '../../hit';
import type { Scale, TooltipPoint } from '../../spec';
import { seriesYColumn } from '../columns';
import { barRectForCategory, categoryWidthFromData } from './geometry';

/**
 * The tooltip row of bar series `si` at the cursor's X: the nearest category, when the cursor is
 * within 0.6 of its slot width.
 */
function barPoint(engine: ChartCore, si: number): TooltipPoint | null {
  if (engine.cursorX === null) return null;
  const palette = engine.categoricalPalette();
  const series = engine.config.series[si];
  const store = engine.storeForSeries(si);
  if (store.length === 0) return null;
  if (series.visible === false) return null;

  const xScale = engine.scales.get(series.xAxis ?? 'x');
  if (!xScale) return null;

  const dataX = xScale.pixelToData(engine.cursorX);
  const idx = store.nearestXIndex(dataX);
  const xVal = store.xAt(idx);
  const categoryWidth = categoryWidthFromData(
    (dataIndex) => store.xAt(dataIndex),
    idx,
    store.length,
  );
  if (Math.abs(dataX - xVal) > categoryWidth * 0.6) return null;

  const colIdx = seriesYColumn(series);
  if (colIdx < 1 || colIdx > store.seriesCount) return null;

  const yVal = store.yAt(colIdx - 1, idx);
  if (!Number.isFinite(yVal)) return null;

  const color = series.color ?? palette[(series.paletteIndex ?? si) % palette.length];
  const fmt = tooltipFormatters(engine);

  return {
    seriesIndex: si,
    dataIndex: idx,
    label: series.label,
    x: xVal,
    y: yVal,
    color,
    formattedX: fmt?.x ? fmt.x(xVal) : engine.formatAxisValue(series.xAxis ?? 'x', xVal),
    formattedY: fmt?.y ? fmt.y(yVal, si) : engine.formatReadout(series.yAxis ?? 'y', yVal),
  };
}

/** The pixel span along X of a bar point's rectangle: its slot share of the category width. */
export function barSpan(
  engine: ChartCore,
  point: TooltipPoint,
  xScale: Scale,
  slot: SlotPlace,
): readonly [number, number] {
  const series = engine.config.series[point.seriesIndex];
  const store = engine.storeForSeries(point.seriesIndex);
  const rect = barRectForCategory({
    centerX: xScale.dataToPixel(point.x),
    categoryWidth: categoryWidthFromData(
      (index) => xScale.dataToPixel(store.xAt(index)),
      point.dataIndex,
      store.length,
      engine.layout.plot.width * 0.5,
    ),
    series,
    barSeriesIndex: slot.index,
    totalBarSeries: slot.count,
  });
  return [rect.left, rect.left + rect.width];
}

export const barHit: MarkHit = {
  tooltipRank: 1,
  slotPoint: barPoint,
  slotSpan: barSpan,
  indicator({ engine, ctx, point, series, store, xScale, yScale, ringAlpha, slot }) {
    const idx = point.dataIndex;
    const barIdx = slot.index;
    const totalBars = slot.count;
    if (barIdx >= 0 && idx < store.length) {
      const centerX = xScale.dataToPixel(store.xAt(idx));
      const categoryWidth = categoryWidthFromData(
        (dataIndex) => xScale.dataToPixel(store.xAt(dataIndex)),
        idx,
        store.length,
        engine.layout.plot.width * 0.5,
      );
      const rect = barRectForCategory({
        centerX,
        categoryWidth,
        series,
        barSeriesIndex: barIdx,
        totalBarSeries: totalBars,
      });
      const barTop = yScale.dataToPixel(point.y);
      const baselineY = yScale.dataToPixel(0);
      if (!Number.isFinite(centerX) || !Number.isFinite(barTop) || !Number.isFinite(baselineY))
        return;
      const rectY = Math.min(barTop, baselineY);
      const rectH = Math.abs(barTop - baselineY);
      ctx.fillStyle = `rgba(255, 255, 255, ${ringAlpha})`;
      ctx.fillRect(rect.left, rectY, rect.width, rectH);
      ctx.strokeStyle = `rgba(255, 255, 255, ${ringAlpha * 2})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(rect.left, rectY, rect.width, rectH);
    }
  },
};
