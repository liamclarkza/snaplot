/**
 * What each gesture action does to the chart: the bus handlers for cursor moves and leaves, pan,
 * zoom, the box and brush drags, reset and tap.
 */
import type { ChartCore } from '../Engine';
import { queueTouchCursor, cancelPendingTouchCursor, updateLocalCursorFromPoint } from '../cursor';
import { clearProximityHighlight } from '../highlight';
import { DirtyFlag } from '../spec';
import { inferPosition, isInPlotArea } from '../layout';
import {
  pannedScaleRange,
  applyViewportChange,
  canZoomFromAnchor,
  applyUniformZoom,
  zoomedScaleRange,
  scaleDomainSpan,
} from '../viewport';
import {
  isBrushMode,
  brushStart,
  brushUpdate,
  brushEnd,
  scatterPointsInSelection,
} from '../selection';
import { MIN_DRAG_DISTANCE } from '../../constants';
import { emitPointClick } from '../hit';

export function wireEvents(engine: ChartCore): void {
  // ── Cursor tracking ──
  engine.eventBus.on('action:cursor', ({ x, y, pointerType }) => {
    if (pointerType === 'touch' || pointerType === 'pen') {
      queueTouchCursor(engine, x, y, pointerType);
      return;
    }
    cancelPendingTouchCursor(engine);
    updateLocalCursorFromPoint(engine, x, y, pointerType);
  });

  // ── Cursor leave ──
  engine.eventBus.on('action:cursor-leave', () => {
    cancelPendingTouchCursor(engine);
    engine.cursorX = null;
    engine.cursorY = null;
    engine.mouseX = null;
    engine.mouseY = null;
    engine.cursorDataX = null;
    engine.cursorDataIdx = null;
    engine.tooltipPoints = [];
    engine.tooltipManager.hide();
    clearProximityHighlight(engine);
    engine.scheduler.markDirty(DirtyFlag.OVERLAY);

    // Notify listeners that the cursor is gone, without this, a fast
    // mouse-leave skips the "cursor outside plot area" path in
    // action:cursor and the legend table never blanks its values.
    engine.emitEvent('cursor:move', null, null, 'local');
  });

  // ── Pan (incremental pixel delta) ──
  engine.eventBus.on('action:pan', ({ dx, dy, axis }) => {
    const pan = engine.config.pan ?? { enabled: true, x: true };
    if (!pan.enabled) return;

    const axisConfigs = engine.config.axes ?? {};

    if (axis) {
      if (pan.axis !== true) return;
      // Drag started on a specific axis, only pan that axis
      const scale = engine.scales.get(axis);
      if (scale) {
        const pos = inferPosition(axis, axisConfigs[axis]?.position);
        const isHoriz = pos === 'bottom' || pos === 'top';
        const delta = isHoriz ? dx : dy;
        const [min, max] = pannedScaleRange(scale, delta);
        applyViewportChange(engine, axis, min, max);
      }
    } else {
      // Drag in plot area, pan all enabled axes. Axes the user has actively
      // zoomed are also pannable even if pan.x/pan.y is off, mirroring how
      // scroll-on-axis can zoom an axis with zoom.x/zoom.y off: once the
      // user has engaged an axis, drag gestures on it should respond.
      for (const [key, scale] of engine.scales) {
        const pos = inferPosition(key, axisConfigs[key]?.position);
        const isHoriz = pos === 'bottom' || pos === 'top';
        const userZoomed = engine.userZoomedAxes.has(key);
        if (isHoriz && (pan.x !== false || userZoomed)) {
          const [min, max] = pannedScaleRange(scale, dx);
          applyViewportChange(engine, key, min, max);
        } else if (!isHoriz && (pan.y || userZoomed)) {
          const [min, max] = pannedScaleRange(scale, dy);
          applyViewportChange(engine, key, min, max);
        }
      }
    }
  });

  // ── Zoom (factor at anchor point) ──
  engine.eventBus.on('action:zoom', ({ factor, anchorX, anchorY, axis }) => {
    const zoom = engine.config.zoom ?? { enabled: true, x: true };
    if (!zoom.enabled) return;

    const axisConfigs = engine.config.axes ?? {};
    if (!canZoomFromAnchor(engine, axis, anchorX, anchorY, zoom.axis === true, axisConfigs)) return;

    if (axis === 'xy') {
      applyUniformZoom(engine, factor, anchorX, anchorY);
    } else {
      // Zoom a specific axis by key
      const scale = engine.scales.get(axis);
      if (scale) {
        const pos = inferPosition(axis, axisConfigs[axis]?.position);
        const isHoriz = pos === 'bottom' || pos === 'top';
        const anchorPx = isHoriz ? anchorX : anchorY;
        const [newMin, newMax] = zoomedScaleRange(scale, anchorPx, factor);
        // minRange/maxRange are enforced in the scale's own span metric
        // (`scaleDomainSpan`): a data-unit span for linear/time axes, a
        // log10-decade span for log axes. Measuring in that metric keeps the
        // limit consistent with how `zoomedScaleRange` applies the factor,
        // and applies to vertical axes too, not just horizontal.
        const span = scaleDomainSpan(scale, newMin, newMax);
        if (zoom.minRange && span < zoom.minRange) return;
        if (zoom.maxRange && span > zoom.maxRange) return;
        if (isHoriz) {
          if (zoom.x !== false) applyViewportChange(engine, axis, newMin, newMax);
        } else {
          applyViewportChange(engine, axis, newMin, newMax);
        }
      }
    }
  });

  // ── Box selection (start/update/end) ──
  engine.eventBus.on('action:box-start', ({ x, y }) => {
    if (isBrushMode(engine)) {
      brushStart(engine, x);
      engine.scheduler.markDirty(DirtyFlag.OVERLAY);
      return;
    }
    engine.selectionBox = { x1: x, y1: y, x2: x, y2: y };
    updateLocalCursorFromPoint(engine, x, y, engine.lastPointerType);
    engine.scheduler.markDirty(DirtyFlag.OVERLAY);
  });

  engine.eventBus.on('action:box-update', ({ x, y }) => {
    if (isBrushMode(engine)) {
      brushUpdate(engine, x);
      engine.scheduler.markDirty(DirtyFlag.OVERLAY);
      return;
    }
    if (!engine.selectionBox) {
      engine.selectionBox = { x1: x, y1: y, x2: x, y2: y };
    }
    const zoom = engine.config.zoom ?? { enabled: true, x: true };
    const { plot } = engine.layout;

    // Constrain box to enabled axes
    engine.selectionBox.x2 = x;
    engine.selectionBox.y2 = y;
    if (!zoom.y) {
      engine.selectionBox.y1 = plot.top;
      engine.selectionBox.y2 = plot.top + plot.height;
    }
    if (zoom.y && !zoom.x) {
      engine.selectionBox.x1 = plot.left;
      engine.selectionBox.x2 = plot.left + plot.width;
    }

    engine.scheduler.markDirty(DirtyFlag.OVERLAY);
  });

  engine.eventBus.on('action:box-end', ({ x1, y1, x2, y2 }) => {
    if (isBrushMode(engine)) {
      brushEnd(engine);
      engine.scheduler.markDirty(DirtyFlag.OVERLAY);
      return;
    }
    engine.selectionBox = null;
    engine.scheduler.markDirty(DirtyFlag.OVERLAY);

    // Zero-area box = cancelled
    if (x1 === 0 && y1 === 0 && x2 === 0 && y2 === 0) return;

    // Clamp the drag coordinates to the plot area. Without this, a drag
    // that continues past the chart edge reads the cursor's absolute
    // pixel position and zooms the axes to a range outside the data extent.
    const { plot } = engine.layout;
    const clampX = (px: number) => Math.max(plot.left, Math.min(plot.left + plot.width, px));
    const clampY = (py: number) => Math.max(plot.top, Math.min(plot.top + plot.height, py));
    x1 = clampX(x1);
    x2 = clampX(x2);
    y1 = clampY(y1);
    y2 = clampY(y2);

    const zoom = engine.config.zoom ?? { enabled: true, x: true };
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);

    // Check overall drag distance (not per-axis) to distinguish from a click
    const totalDist = Math.sqrt(dx * dx + dy * dy);
    if (totalDist < MIN_DRAG_DISTANCE) return;

    const xScale = engine.scales.get('x');
    const yScale = engine.scales.get('y');
    const selectionX = xScale
      ? {
          min: xScale.pixelToData(Math.min(x1, x2)),
          max: xScale.pixelToData(Math.max(x1, x2)),
        }
      : null;
    const selectionY =
      yScale && zoom.y
        ? {
            min: yScale.pixelToData(Math.max(y1, y2)),
            max: yScale.pixelToData(Math.min(y1, y2)),
          }
        : undefined;

    if (selectionX) {
      const selection = {
        x: selectionX,
        ...(selectionY ? { y: selectionY } : {}),
        points: selectionY ? scatterPointsInSelection(engine, selectionX, selectionY) : undefined,
      };
      engine.emitEvent('select', selection);
      engine.config.selection?.onSelect?.(selection);
    }

    if (zoom.enabled !== false) {
      if (zoom.x !== false && selectionX) {
        applyViewportChange(engine, 'x', selectionX.min, selectionX.max);
      }
      if (zoom.y && selectionY) {
        applyViewportChange(engine, 'y', selectionY.min, selectionY.max);
      }
    }
  });

  // ── Reset zoom ──
  engine.eventBus.on('action:reset-zoom', () => {
    engine.resetZoom();
  });

  // ── Tap (touch: show/persist tooltip) ──
  engine.eventBus.on('action:tap', ({ x, y, pointerType }) => {
    cancelPendingTouchCursor(engine);
    const inPlot = isInPlotArea(engine, x, y);
    updateLocalCursorFromPoint(engine, x, y, pointerType);
    if (inPlot) emitPointClick(engine, x, y);
    if (inPlot && pointerType !== 'mouse') {
      // Leave a short-lived ring so the user can see the tap landed.
      engine.tapFeedback = { x, y, startTime: performance.now() };
    }
  });
}
