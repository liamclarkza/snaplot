/**
 * The hover model: the cursor from local pointer input (touch and pen coalesced per frame) and
 * from a group or the app (`setCursorDataX`), and the cursor snapshot that legend tables read,
 * through its two paths: one shared source (`fillSnapshot`) and independent sources
 * (`fillIndependentSnapshot`).
 */
import type { ChartCore } from './Engine';
import {
  type CursorEventOrigin,
  DirtyFlag,
  type CursorSnapshotOptions,
  type CursorSnapshot,
} from './spec';
import { seriesYColumn, scatterXColumn } from './marks/scatterEncoding';
import { applyProximityHighlight, clearProximityHighlight } from './highlight';

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

  if (engine.hasOnlyVisibleHistograms()) {
    const hit = engine.resolveHistogramCursor(dataX);
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
    engine.updateTooltipPoints();
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
  if (xScale && engine.isInPlotArea(x, y)) {
    const pointerDataX = xScale.pixelToData(x);
    const hasOnlyHistograms = engine.hasOnlyVisibleHistograms();
    if (hasOnlyHistograms) {
      const hit = engine.resolveHistogramCursor(pointerDataX);
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

    engine.updateTooltipPoints();
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

/** Re-run tooltip hit-test at current cursor position (called on data change) */
export function refreshCursor(engine: ChartCore): void {
  if (engine.mouseX === null || engine.mouseY === null || !engine.cursorIsLocal) return;
  engine.updateTooltipPoints();
  engine.scheduler.markDirty(DirtyFlag.OVERLAY);
}

export function canUseGlobalXCursor(engine: ChartCore): boolean {
  if (engine.sourceStores.length > 1) return false;
  return !engine.config.series.some(
    (series) =>
      series.visible !== false && series.type === 'scatter' && scatterXColumn(series) !== 0,
  );
}

export function applyNearestScatterCursor(engine: ChartCore): void {
  if ((engine.config.tooltip?.mode ?? 'index') !== 'nearest') return;
  const point = engine.tooltipPoints[0];
  if (!point) return;
  if (engine.config.series[point.seriesIndex]?.type !== 'scatter') return;

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
 * Mutate `target` to match the current snapshot. Shared implementation
 * for both allocating and zero-alloc public variants.
 */
export function fillSnapshot(
  engine: ChartCore,
  target: CursorSnapshot,
  opts?: CursorSnapshotOptions,
): CursorSnapshot {
  if (engine.sourceStores.length > 1 || !canUseGlobalXCursor(engine))
    return fillIndependentSnapshot(engine, target, opts);
  const store = engine.sourceStores[0];
  const fallback = opts?.fallback ?? 'hide';
  const length = store.length;

  // Resolve the index to read from.
  let idx: number | null = engine.cursorDataIdx;
  let source: CursorSnapshot['source'] = idx !== null ? 'cursor' : 'none';

  if (idx === null && length > 0) {
    if (fallback === 'latest') {
      idx = engine.hasOnlyVisibleHistograms() && length > 1 ? length - 2 : length - 1;
      source = 'latest';
    } else if (fallback === 'first') {
      idx = 0;
      source = 'first';
    }
  }

  if (idx === null || idx < 0 || idx >= length) {
    target.dataIndex = null;
    target.dataX = null;
    target.formattedX = '';
    target.points.length = 0;
    target.source = 'none';
    target.activeSeriesIndex = null;
    return target;
  }

  const histogramRange = engine.hasOnlyVisibleHistograms()
    ? engine.histogramBinRange(idx, store)
    : null;
  const xVal = histogramRange ? (histogramRange.min + histogramRange.max) / 2 : store.xAt(idx);
  const xScale = engine.scales.get('x');

  target.dataIndex = idx;
  target.dataX = xVal;
  target.formattedX = histogramRange
    ? engine.formatHistogramBinRange(histogramRange.min, histogramRange.max)
    : xScale
      ? xScale.tickFormat(xVal)
      : String(xVal);
  target.source = source;

  const palette = engine.categoricalPalette();
  const seriesList = engine.config.series;
  const points = target.points;

  // Track the series whose Y is nearest the cursor (pixel-space).
  // Only meaningful when the snapshot is cursor-driven; otherwise null.
  const cursorY = source === 'cursor' ? engine.cursorY : null;
  let nearestSi: number | null = null;
  let nearestDist = Infinity;

  // Walk visible series, mutate row objects in place; reuse rows
  // across calls to keep the cursor hot path allocation-free.
  let writeIdx = 0;
  for (let si = 0; si < seriesList.length; si++) {
    const s = seriesList[si];
    if (s.visible === false) continue;

    const colIdx = seriesYColumn(s);
    if (colIdx < 1 || colIdx > store.seriesCount) continue;

    const value = store.yAt(colIdx - 1, idx);
    const yScale = engine.scales.get(s.yAxis ?? 'y');
    const formattedValue = Number.isFinite(value)
      ? engine.formatReadout(s.yAxis ?? 'y', value)
      : '';
    const color = s.color ?? palette[(s.paletteIndex ?? si) % palette.length];

    let row = points[writeIdx];
    if (!row) {
      row = {
        seriesIndex: si,
        dataIndex: idx,
        dataX: xVal,
        label: s.label,
        color,
        value,
        formattedValue,
        meta: s.meta,
      };
      points[writeIdx] = row;
    } else {
      row.seriesIndex = si;
      row.dataIndex = idx;
      row.dataX = xVal;
      row.label = s.label;
      row.color = color;
      row.value = value;
      row.formattedValue = formattedValue;
      row.meta = s.meta;
    }
    writeIdx++;

    // Nearest-series in pixel space: compare the series' Y pixel to
    // the cursor's Y pixel. Skipped for NaN values or when no cursor.
    if (cursorY !== null && yScale && value === value) {
      const px = yScale.dataToPixel(value);
      const d = Math.abs(px - cursorY);
      if (d < nearestDist) {
        nearestDist = d;
        nearestSi = si;
      }
    }
  }
  points.length = writeIdx;
  target.activeSeriesIndex = nearestSi;

  return target;
}

export function fillIndependentSnapshot(
  engine: ChartCore,
  target: CursorSnapshot,
  opts?: CursorSnapshotOptions,
): CursorSnapshot {
  const fallback = opts?.fallback ?? 'hide';
  const active = engine.cursorDataX !== null && engine.cursorX !== null;
  const source: CursorSnapshot['source'] = active
    ? 'cursor'
    : engine.hasData() && fallback !== 'hide'
      ? fallback
      : 'none';
  target.source = source;
  target.dataIndex = null;
  target.dataX = active ? engine.cursorDataX : null;
  target.formattedX = '';
  target.activeSeriesIndex = null;
  if (source === 'none') {
    target.points.length = 0;
    return target;
  }
  const palette = engine.categoricalPalette();
  let count = 0;
  let nearestDist = Infinity;
  for (let si = 0; si < engine.config.series.length; si++) {
    const series = engine.config.series[si];
    const store = engine.storeForSeries(si);
    const column = seriesYColumn(series);
    if (series.visible === false || !store.length || !engine.isValidColumn(column, store)) continue;
    const seriesX = engine.scales.get(series.xAxis ?? 'x');
    const targetX =
      active && seriesX && engine.cursorX !== null
        ? seriesX.pixelToData(engine.cursorX)
        : engine.cursorDataX!;
    let dataIndex =
      source === 'latest'
        ? Math.max(0, store.length - (series.type === 'histogram' ? 2 : 1))
        : source === 'first'
          ? 0
          : series.type === 'histogram'
            ? engine.histogramBinIndexForDataX(targetX, store)
            : store.nearestXIndex(targetX);
    const xColumn = series.type === 'scatter' ? scatterXColumn(series) : 0;
    if (active && xColumn !== 0) {
      let distance = Infinity;
      dataIndex = null;
      for (let i = 0; i < store.length; i++) {
        const delta = Math.abs(store.valueAt(xColumn, i) - targetX);
        if (delta < distance) {
          distance = delta;
          dataIndex = i;
        }
      }
    }
    if (dataIndex === null) continue;
    const range = series.type === 'histogram' ? engine.histogramBinRange(dataIndex, store) : null;
    const dataX = range ? (range.min + range.max) / 2 : store.valueAt(xColumn, dataIndex);
    const value = store.valueAt(column, dataIndex);
    const yScale = engine.scales.get(series.yAxis ?? 'y');
    const formattedValue = Number.isFinite(value)
      ? engine.formatAxisReadout(series.yAxis ?? 'y', value)
      : '';
    const point =
      target.points[count] ??
      (target.points[count] = {
        seriesIndex: si,
        dataIndex,
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
    if (count === 0) {
      target.dataIndex = dataIndex;
      target.dataX ??= dataX;
      target.formattedX = engine.formatAxisValue(series.xAxis ?? 'x', target.dataX);
    }
    count++;
    if (active && engine.cursorY !== null && yScale && Number.isFinite(value)) {
      const distance = Math.abs(yScale.dataToPixel(value) - engine.cursorY);
      if (distance < nearestDist) {
        nearestDist = distance;
        target.activeSeriesIndex = si;
      }
    }
  }
  target.points.length = count;
  if (count === 0) {
    target.source = 'none';
    target.dataX = null;
    target.dataIndex = null;
  }
  return target;
}
