/**
 * The hover model: the cursor from local pointer input (touch and pen coalesced per frame) and
 * from a group or the app (`setCursorDataX`), and the cursor snapshot that legend tables read
 * (`fillSnapshot`, one path for a shared store and for a row per series).
 */
import type { ChartCore } from './Engine';
import {
  type CursorEventOrigin,
  DirtyFlag,
  type CursorSnapshotOptions,
  type CursorSnapshot,
  type SeriesSpec,
} from './spec';
import type { DataStore } from './data/DataStore';
import { formatBinRange, formatReadout, formatX, NO_FORMAT, NO_TOOLTIP_FORMAT } from './format';
import { seriesYColumn } from './marks/columns';
import { histogramBinIndexForDataX, histogramBinRange } from './marks/histogram/hit';
import { markOf, xColumnOf } from './marks/index';
import { applyProximityHighlight, clearProximityHighlight } from './highlight';
import { updateTooltipPoints, hasOnlyVisibleHistograms, resolveHistogramCursor } from './hit';
import { isInPlotArea } from './layout';

export function setCursorDataX(
  engine: ChartCore,
  dataX: number | null,
  origin: CursorEventOrigin = 'programmatic',
): void {
  engine.cursorIsLocal = false; // Group- or application-driven cursor

  if (dataX === null) {
    engine.cursorX = null;
    engine.cursorY = null;
    engine.cursorDataX = null;
    engine.cursorDataIdx = null;
    engine.tooltipPoints = [];
    engine.tooltipManager.hide();
    engine.scheduler.markDirty(DirtyFlag.OVERLAY);
    engine.emitEvent('cursor:move', null, null, origin);
    return;
  }

  const xScale = engine.scales.get('x');
  if (!xScale) return;

  if (hasOnlyVisibleHistograms(engine)) {
    const hit = resolveHistogramCursor(engine, dataX);
    engine.cursorDataX = hit?.dataX ?? dataX;
    engine.cursorDataIdx = hit?.dataIndex ?? null;
    engine.cursorX = xScale.dataToPixel(engine.cursorDataX);
  } else {
    engine.cursorDataX = dataX;
    // Mirror the local pointer path: column 0 is not the shared X axis when a
    // visible scatter series draws against a different X column, so snapping
    // this synced/programmatic cursor to nearestXIndex on column 0 would land
    // on the wrong point. Fall back to placing the crosshair at the raw dataX.
    if (canUseGlobalXCursor(engine)) {
      const store = engine.sourceStores[0];
      engine.cursorDataIdx = store.nearestXIndex(dataX);
      // Snap to nearest actual data point's X for accurate crosshair placement
      if (engine.cursorDataIdx < store.length) {
        const snappedX = store.xAt(engine.cursorDataIdx);
        engine.cursorX = xScale.dataToPixel(snappedX);
      } else {
        engine.cursorX = xScale.dataToPixel(dataX);
      }
    } else {
      engine.cursorDataIdx = null;
      engine.cursorX = xScale.dataToPixel(dataX);
    }
  }

  // Find Y position from first visible series at this index
  engine.cursorY = engine.layout.plot.top + engine.layout.plot.height / 2; // default to plot center
  for (let si = 0; si < engine.config.series.length; si++) {
    const sc = engine.config.series[si];
    const store = engine.storeForSeries(si);
    if (sc.visible === false || !store.length) continue;
    const colIdx = seriesYColumn(sc);
    const yScale = engine.scales.get(sc.yAxis ?? 'y');
    if (!yScale || colIdx < 1 || colIdx > store.seriesCount) continue;
    const yVal = store.yAt(colIdx - 1, store.nearestXIndex(dataX));
    if (Number.isFinite(yVal)) {
      engine.cursorY = yScale.dataToPixel(yVal);
      break;
    }
  }

  // For synced cursors: show crosshair only, hide tooltip
  // unless syncTooltip is explicitly enabled
  if (engine.config.cursor?.syncTooltip) {
    updateTooltipPoints(engine);
  } else {
    engine.tooltipPoints = [];
    engine.tooltipManager.hide();
  }

  engine.scheduler.markDirty(DirtyFlag.OVERLAY);
  engine.emitEvent('cursor:move', engine.cursorDataX, engine.cursorDataIdx, origin);
}

export function updateLocalCursorFromPoint(
  engine: ChartCore,
  x: number,
  y: number,
  pointerType: string,
): void {
  engine.cursorIsLocal = true;
  engine.cursorX = x;
  engine.cursorY = y;
  engine.mouseX = x;
  engine.mouseY = y;
  if (pointerType === 'touch' || pointerType === 'pen' || pointerType === 'mouse') {
    engine.lastPointerType = pointerType;
  }

  const xScale = engine.scales.get('x');
  if (xScale && isInPlotArea(engine, x, y)) {
    const pointerDataX = xScale.pixelToData(x);
    const hasOnlyHistograms = hasOnlyVisibleHistograms(engine);
    if (hasOnlyHistograms) {
      const hit = resolveHistogramCursor(engine, pointerDataX);
      engine.cursorDataX = hit?.dataX ?? pointerDataX;
      engine.cursorDataIdx = hit?.dataIndex ?? null;
      engine.cursorX = xScale.dataToPixel(engine.cursorDataX);
    } else {
      engine.cursorDataX = pointerDataX;
      engine.cursorDataIdx = canUseGlobalXCursor(engine)
        ? engine.sourceStores[0].nearestXIndex(engine.cursorDataX)
        : null;
    }

    if (
      !hasOnlyHistograms &&
      engine.config.cursor?.snap !== false &&
      engine.cursorDataIdx !== null &&
      canUseGlobalXCursor(engine)
    ) {
      const snappedX = engine.sourceStores[0].xAt(engine.cursorDataIdx);
      engine.cursorX = xScale.dataToPixel(snappedX);
      engine.cursorDataX = snappedX;
    }

    updateTooltipPoints(engine);
    applyNearestScatterCursor(engine);
    applyProximityHighlight(engine);
  } else {
    engine.cursorX = null;
    engine.cursorY = null;
    engine.cursorDataX = null;
    engine.cursorDataIdx = null;
    engine.tooltipPoints = [];
    engine.tooltipManager.hide();
    clearProximityHighlight(engine);
  }

  engine.scheduler.markDirty(DirtyFlag.OVERLAY);
  engine.emitEvent('cursor:move', engine.cursorDataX, engine.cursorDataIdx, 'local');
}

/**
 * The hover model under a still pointer (plan §5.5): after any data, viewport, layout, option or
 * visibility change, the cursor and tooltip are recomputed from where the pointer is.
 */
export function refreshCursor(engine: ChartCore): void {
  if (engine.mouseX === null || engine.mouseY === null || !engine.cursorIsLocal) return;
  updateLocalCursorFromPoint(engine, engine.mouseX, engine.mouseY, engine.lastPointerType);
}

/**
 * The keyboard cursor (plan D20): to the previous, next, first or last visible point of the first
 * visible series with data, through the same path as a pointer at that point, then read aloud.
 */
export function stepCursor(engine: ChartCore, to: 'prev' | 'next' | 'first' | 'last'): void {
  const { plot } = engine.layout;
  for (let si = 0; si < engine.config.series.length; si++) {
    const sc = engine.config.series[si];
    const store = engine.storeForSeries(si);
    if (sc.visible === false || !store.length || xColumnOf(sc) !== 0) continue;
    const xScale = engine.scales.get(sc.xAxis ?? 'x');
    const yScale = engine.scales.get(sc.yAxis ?? 'y');
    if (!xScale || !yScale) continue;
    const lo = Math.max(0, store.lowerBoundX(Math.min(xScale.min, xScale.max)));
    const hi = Math.min(store.length - 1, store.upperBoundX(Math.max(xScale.min, xScale.max)));
    if (hi < lo) continue;
    const current = engine.cursorDataX === null ? null : store.nearestXIndex(engine.cursorDataX);
    const index =
      to === 'first'
        ? lo
        : to === 'last'
          ? hi
          : current === null
            ? to === 'next'
              ? lo
              : hi
            : Math.max(lo, Math.min(hi, current + (to === 'next' ? 1 : -1)));
    const x = xScale.dataToPixel(store.xAt(index));
    const column = seriesYColumn(sc);
    const value = column >= 1 && column <= store.seriesCount ? store.yAt(column - 1, index) : NaN;
    const y = Number.isFinite(value)
      ? Math.max(plot.top, Math.min(plot.top + plot.height, yScale.dataToPixel(value)))
      : plot.top + plot.height / 2;
    updateLocalCursorFromPoint(engine, x, y, 'keyboard');
    const points = engine.tooltipPoints;
    if (points.length > 0) {
      engine.announce(
        `${points[0].formattedX}: ${points.map((p) => `${p.label} ${p.formattedY}`).join(', ')}`,
      );
    }
    return;
  }
}

export function canUseGlobalXCursor(engine: ChartCore): boolean {
  if (engine.sourceStores.length > 1) return false;
  return !engine.config.series.some(
    (series) => series.visible !== false && xColumnOf(series) !== 0,
  );
}

export function applyNearestScatterCursor(engine: ChartCore): void {
  if ((engine.config.tooltip?.mode ?? 'index') !== 'nearest') return;
  const point = engine.tooltipPoints[0];
  if (!point) return;
  const series = engine.config.series[point.seriesIndex];
  if (!series || !markOf(series).draw.cloud) return;

  engine.cursorDataX = point.x;
  engine.cursorDataIdx = point.dataIndex;
}

export function queueTouchCursor(
  engine: ChartCore,
  x: number,
  y: number,
  pointerType: 'touch' | 'pen',
): void {
  engine.pendingTouchCursor = { x, y, pointerType };
  if (engine.touchCursorFrame !== null) return;

  if (typeof requestAnimationFrame === 'undefined') {
    flushPendingTouchCursor(engine);
    return;
  }

  engine.touchCursorFrame = requestAnimationFrame(() => {
    engine.touchCursorFrame = null;
    flushPendingTouchCursor(engine);
  });
}

export function flushPendingTouchCursor(engine: ChartCore): void {
  const pending = engine.pendingTouchCursor;
  engine.pendingTouchCursor = null;
  if (!pending) return;
  updateLocalCursorFromPoint(engine, pending.x, pending.y, pending.pointerType);
}

export function cancelPendingTouchCursor(engine: ChartCore): void {
  engine.pendingTouchCursor = null;
  if (engine.touchCursorFrame !== null && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(engine.touchCursorFrame);
  }
  engine.touchCursorFrame = null;
}

/** Allocates and returns a fresh snapshot. */
export function getCursorSnapshot(engine: ChartCore, opts?: CursorSnapshotOptions): CursorSnapshot {
  const target: CursorSnapshot = {
    dataIndex: null,
    dataX: null,
    formattedX: '',
    points: [],
    source: 'none',
    activeSeriesIndex: null,
  };
  return fillSnapshot(engine, target, opts);
}

/**
 * Mutate `target` to match the current snapshot: one path for every chart. The rows reuse the
 * objects already in `target.points`, so a caller that keeps its target stays allocation-free on
 * the cursor hot path.
 *
 * When every visible series reads one store along its X column (`canUseGlobalXCursor`), the
 * cursor's index into it (or the fallback row) is every series' row. Otherwise each series finds
 * its own row: independent sources, or a scatter series drawn against another column. The two
 * cases keep today's differences, which M10 (formatting) and M12a (the hover model) remove:
 *
 * | | one shared row | a row per series |
 * |---|---|---|
 * | source | the cursor index, else the fallback row | the cursor, else the fallback if any data |
 * | value readout | `formatReadout`, `NO_FORMAT` | `formatReadout`, `NO_TOOLTIP_FORMAT` (axis format) |
 * | header X | the row's X (`NO_FORMAT`), or a histogram bin range | the first row's X (axis format) |
 * | histogram rows | only when every visible series is one | per histogram series |
 * | no rows | the source stands | the source becomes `'none'` |
 */
export function fillSnapshot(
  engine: ChartCore,
  target: CursorSnapshot,
  opts?: CursorSnapshotOptions,
): CursorSnapshot {
  const fallback = opts?.fallback ?? 'hide';
  const shared = canUseGlobalXCursor(engine) ? engine.sourceStores[0] : null;
  const onlyBins = shared !== null && hasOnlyVisibleHistograms(engine);

  // The snapshot's source and, with a shared store, the row every series reads.
  let source: CursorSnapshot['source'];
  let row: number | null = null;
  if (shared) {
    row = engine.cursorDataIdx;
    source = row !== null ? 'cursor' : 'none';
    if (row === null && shared.length > 0) {
      if (fallback === 'latest') {
        row = onlyBins && shared.length > 1 ? shared.length - 2 : shared.length - 1;
        source = 'latest';
      } else if (fallback === 'first') {
        row = 0;
        source = 'first';
      }
    }
    if (row === null || row < 0 || row >= shared.length) source = 'none';
  } else {
    const active = engine.cursorDataX !== null && engine.cursorX !== null;
    source = active ? 'cursor' : engine.hasData() && fallback !== 'hide' ? fallback : 'none';
  }

  target.source = source;
  target.dataIndex = null;
  target.dataX = null;
  target.formattedX = '';
  target.activeSeriesIndex = null;
  if (source === 'none') {
    target.points.length = 0;
    return target;
  }

  // The header: the shared row's X, or (per-series rows) the cursor's X until the first row.
  const sharedRange = shared && onlyBins ? histogramBinRange(row!, shared) : null;
  if (shared) {
    const x = sharedRange ? (sharedRange.min + sharedRange.max) / 2 : shared.xAt(row!);
    target.dataIndex = row;
    target.dataX = x;
    target.formattedX = sharedRange
      ? formatBinRange(engine, sharedRange.min, sharedRange.max)
      : formatX(engine, x, 'x', NO_FORMAT);
  } else if (source === 'cursor') {
    target.dataX = engine.cursorDataX;
  }

  const palette = engine.categoricalPalette();
  const cursorY = source === 'cursor' ? engine.cursorY : null;
  let nearestDistance = Infinity;
  let count = 0;
  for (let si = 0; si < engine.config.series.length; si++) {
    const series = engine.config.series[si];
    const store = shared ?? engine.storeForSeries(si);
    const column = seriesYColumn(series);
    if (series.visible === false || !store.length) continue;
    if (shared ? column < 1 || column > store.seriesCount : !engine.isValidColumn(column, store))
      continue;

    const histogram = shared ? onlyBins : markOf(series).draw.x === 'bin';
    const xColumn = shared ? 0 : xColumnOf(series);
    const dataIndex = shared ? row : seriesRow(engine, series, store, source, xColumn);
    if (dataIndex === null) continue;
    const range = shared ? sharedRange : histogram ? histogramBinRange(dataIndex, store) : null;
    const dataX = range ? (range.min + range.max) / 2 : store.valueAt(xColumn, dataIndex);
    const value = store.valueAt(column, dataIndex);
    const yAxis = series.yAxis ?? 'y';
    const formattedValue = Number.isFinite(value)
      ? formatReadout(engine, si, value, shared ? NO_FORMAT : NO_TOOLTIP_FORMAT)
      : '';

    const point =
      target.points[count] ??
      (target.points[count] = {
        seriesIndex: si,
        dataIndex,
        dataX,
        label: series.label,
        color: '',
        value,
        formattedValue,
      });
    point.seriesIndex = si;
    point.dataIndex = dataIndex;
    point.dataX = dataX;
    point.label = series.label;
    point.color = series.color ?? palette[(series.paletteIndex ?? si) % palette.length];
    point.value = value;
    point.formattedValue = formattedValue;
    point.meta = series.meta;
    if (!shared && count === 0) {
      target.dataIndex = dataIndex;
      target.dataX ??= dataX;
      target.formattedX = formatX(engine, target.dataX, series.xAxis ?? 'x', NO_TOOLTIP_FORMAT);
    }
    count++;

    // The series whose value is nearest the cursor's Y, in pixels.
    const yScale = engine.scales.get(yAxis);
    if (cursorY !== null && yScale && Number.isFinite(value)) {
      const distance = Math.abs(yScale.dataToPixel(value) - cursorY);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        target.activeSeriesIndex = si;
      }
    }
  }
  target.points.length = count;
  if (!shared && count === 0) {
    target.source = 'none';
    target.dataX = null;
    target.dataIndex = null;
  }
  return target;
}

/**
 * The row of one series in a snapshot without a shared store: the fallback row, else the row
 * nearest the cursor's X on the series' own X axis (the bin under it for a histogram; a scan of
 * the X column for a scatter series drawn against another column).
 */
function seriesRow(
  engine: ChartCore,
  series: SeriesSpec,
  store: DataStore,
  source: CursorSnapshot['source'],
  xColumn: number,
): number | null {
  const histogram = markOf(series).draw.x === 'bin';
  if (source === 'latest') return Math.max(0, store.length - (histogram ? 2 : 1));
  if (source === 'first') return 0;
  const seriesX = engine.scales.get(series.xAxis ?? 'x');
  const active = source === 'cursor';
  const targetX =
    active && seriesX && engine.cursorX !== null
      ? seriesX.pixelToData(engine.cursorX)
      : engine.cursorDataX!;
  if (active && xColumn !== 0) {
    let distance = Infinity;
    let nearest: number | null = null;
    for (let i = 0; i < store.length; i++) {
      const delta = Math.abs(store.valueAt(xColumn, i) - targetX);
      if (delta < distance) {
        distance = delta;
        nearest = i;
      }
    }
    return nearest;
  }
  return histogram ? histogramBinIndexForDataX(targetX, store) : store.nearestXIndex(targetX);
}
