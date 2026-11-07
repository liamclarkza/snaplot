/**
 * Selection: the brush (`selection.mode: 'brush'`) drawn, moved and resized by a drag, kept in
 * data space and reconciled with new data, and the scatter points inside a box selection.
 */
import type { ChartCore } from './Engine';
import { type SelectionRange, DirtyFlag, type ScaleRange } from './spec';
import { BRUSH_EDGE_GRAB_PX } from '../constants';
import { seriesYColumn } from './marks/columns';
import { markOf, xColumnOf } from './marks/index';
import { scatterResolvers } from './marks/scatter/encoding';

export function getSelection(engine: ChartCore): SelectionRange | null {
  // Return a copy so callers cannot mutate internal state.
  if (!engine.selection) return null;
  return {
    x: { min: engine.selection.x.min, max: engine.selection.x.max },
    ...(engine.selection.y
      ? { y: { min: engine.selection.y.min, max: engine.selection.y.max } }
      : {}),
  };
}

export function setSelection(engine: ChartCore, selection: SelectionRange | null): void {
  if (engine.destroyed) return;
  if (selection === null) {
    if (engine.selection === null) return;
    engine.selection = null;
  } else {
    const min = Math.min(selection.x.min, selection.x.max);
    const max = Math.max(selection.x.min, selection.x.max);
    engine.selection = { x: { min, max } };
  }
  engine.scheduler.markDirty(DirtyFlag.OVERLAY);
  emitSelectionChange(engine);
}

export function reconcileSelectionForDataChange(engine: ChartCore): void {
  if (!engine.selection) return;
  const policy = engine.config.selection?.dataChange ?? 'clear-if-outside';
  if (policy === 'preserve') return;
  if (policy === 'clear' || !engine.hasData()) {
    engine.setSelection(null);
    return;
  }

  const [first, last] = engine.sourceExtent()!;
  const dataMin = Math.min(first, last);
  const dataMax = Math.max(first, last);
  const { min, max } = engine.selection.x;
  if (max < dataMin || min > dataMax) {
    engine.setSelection(null);
  } else if (policy === 'clamp') {
    engine.setSelection({ x: { min: Math.max(min, dataMin), max: Math.min(max, dataMax) } });
  }
}

export function isBrushMode(engine: ChartCore): boolean {
  return engine.config.selection?.mode === 'brush';
}

/** Fire selection:change / onBrush only when the selection actually changed. */
export function emitSelectionChange(engine: ChartCore): void {
  const cur = engine.selection;
  const prev = engine.lastEmittedSelection;
  const same =
    (cur === null && prev === null) ||
    (cur !== null && prev !== null && cur.x.min === prev.x.min && cur.x.max === prev.x.max);
  if (same) return;
  engine.lastEmittedSelection = engine.getSelection();
  const payload = engine.getSelection();
  engine.emitEvent('selection:change', payload);
  engine.config.selection?.onBrush?.(payload);
}

/** Pixel x of a data-space X value on the default axis, or null. */
export function brushPixelRange(engine: ChartCore): { min: number; max: number } | null {
  if (!engine.selection) return null;
  const xScale = engine.scales.get('x');
  if (!xScale) return null;
  return {
    min: xScale.dataToPixel(engine.selection.x.min),
    max: xScale.dataToPixel(engine.selection.x.max),
  };
}

export function brushStart(engine: ChartCore, px: number): void {
  const xScale = engine.scales.get('x');
  if (!xScale) return;
  const dataX = xScale.pixelToData(px);
  const rect = brushPixelRange(engine);
  // Decide the interaction from where the drag begins relative to the
  // existing band: near an edge resizes it, inside moves it, elsewhere
  // starts a fresh selection.
  if (engine.selection && rect) {
    const lo = Math.min(rect.min, rect.max);
    const hi = Math.max(rect.min, rect.max);
    if (Math.abs(px - lo) <= BRUSH_EDGE_GRAB_PX) {
      engine.brushDrag = {
        mode: 'resize-min',
        anchorDataX: dataX,
        orig: { ...engine.selection.x },
      };
      return;
    }
    if (Math.abs(px - hi) <= BRUSH_EDGE_GRAB_PX) {
      engine.brushDrag = {
        mode: 'resize-max',
        anchorDataX: dataX,
        orig: { ...engine.selection.x },
      };
      return;
    }
    if (px > lo && px < hi) {
      engine.brushDrag = { mode: 'move', anchorDataX: dataX, orig: { ...engine.selection.x } };
      return;
    }
  }
  engine.brushDrag = { mode: 'create', anchorDataX: dataX, orig: { min: dataX, max: dataX } };
  const proposed = { x: { min: dataX, max: dataX } };
  engine.selection = proposed;
}

export function brushUpdate(engine: ChartCore, px: number): void {
  const xScale = engine.scales.get('x');
  if (!xScale || !engine.brushDrag) return;
  // A drag past the plot edge stops at the edge of the domain.
  const { plot } = engine.layout;
  const dataX = xScale.pixelToData(Math.max(plot.left, Math.min(plot.left + plot.width, px)));
  const { mode, anchorDataX, orig } = engine.brushDrag;

  let proposed: SelectionRange;
  if (mode === 'create') {
    proposed = { x: { min: Math.min(anchorDataX, dataX), max: Math.max(anchorDataX, dataX) } };
  } else if (mode === 'move') {
    const delta = dataX - anchorDataX;
    proposed = { x: { min: orig.min + delta, max: orig.max + delta } };
  } else if (mode === 'resize-min') {
    proposed = { x: { min: Math.min(dataX, orig.max), max: Math.max(dataX, orig.max) } };
  } else {
    proposed = { x: { min: Math.min(orig.min, dataX), max: Math.max(orig.min, dataX) } };
  }
  engine.selection = proposed;
}

export function brushEnd(engine: ChartCore): void {
  if (!engine.brushDrag) return;
  const wasCreate = engine.brushDrag.mode === 'create';
  engine.brushDrag = null;
  // A create gesture that never moved (a click) clears the selection
  // rather than leaving a zero-width band.
  if (wasCreate && engine.selection && engine.selection.x.min === engine.selection.x.max) {
    engine.selection = null;
  }
  emitSelectionChange(engine);
}

/**
 * The points inside a selection: every visible series' points with X in `xRange` (and Y in
 * `yRange` when given). Sorted series are searched by X; point clouds are scanned.
 */
export function pointsInSelection(engine: ChartCore, xRange: ScaleRange, yRange?: ScaleRange) {
  const points = [];
  const palette = engine.categoricalPalette();

  for (let si = 0; si < engine.config.series.length; si++) {
    const series = engine.config.series[si];
    const store = engine.storeForSeries(si);
    // A heatmap's cells are not points.
    if (store.length === 0 || series.visible === false || markOf(series).draw.cells) continue;
    const cloud = markOf(series).draw.cloud;
    const xColumnIdx = xColumnOf(series);
    const yColumnIdx = seriesYColumn(series);
    if (!engine.isValidColumn(xColumnIdx, store) || !engine.isValidColumn(yColumnIdx, store))
      continue;

    const fallbackColor = series.color ?? palette[(series.paletteIndex ?? si) % palette.length];
    const style = cloud
      ? scatterResolvers(engine, si, series, fallbackColor).logicalResolver
      : null;
    const sorted = xColumnIdx === 0;
    const from = sorted ? Math.max(0, store.lowerBoundX(xRange.min)) : 0;
    const to = sorted
      ? Math.min(store.length - 1, store.upperBoundX(xRange.max))
      : store.length - 1;

    for (let i = from; i <= to; i++) {
      const x = store.valueAt(xColumnIdx, i);
      const y = store.valueAt(yColumnIdx, i);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < xRange.min || x > xRange.max) continue;
      if (yRange && (y < yRange.min || y > yRange.max)) continue;
      points.push({
        seriesIndex: si,
        dataIndex: i,
        label: series.label,
        x,
        y,
        color: style ? style.colorAt(i) : fallbackColor,
        meta: series.meta,
      });
    }
  }

  return points;
}
