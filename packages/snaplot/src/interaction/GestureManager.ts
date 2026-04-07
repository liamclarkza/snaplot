import type { InteractionMode, Layout, ZoomConfig, PanConfig } from '../types';
import type { EventBus } from '../core/EventBus';
import {
  MIN_DRAG_DISTANCE,
  DEFAULT_WHEEL_FACTOR,
  DEFAULT_LONG_PRESS_MS,
  TAP_TIMEOUT,
  DOUBLE_TAP_TIMEOUT,
} from '../constants';

/**
 * GestureManager — unified gesture detection and action dispatch.
 *
 * Replaces PointerHandler + ZoomPanHandler. Handles:
 * - Mouse: drag, click, double-click, wheel, modifiers (shift, ctrl/cmd)
 * - Trackpad: two-finger scroll (passthrough), pinch (ctrlKey on wheel)
 * - Touch: one-finger drag, two-finger pinch, tap, double-tap, long-press
 *
 * Gesture→action mapping is determined by the interaction mode:
 * - timeseries: drag=pan, shift+drag=box-zoom
 * - analytical: drag=box-zoom, shift+drag=pan
 * - readonly: tooltip only
 */

interface PointerState {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  startTime: number;
  pointerType: string;
}

interface AreaResult {
  type: 'plot' | 'axis' | 'outside';
  axisKey?: string;
}

export class GestureManager {
  private pointers = new Map<number, PointerState>();
  private state: 'idle' | 'dragging' | 'pinching' | 'long-pressing' | 'selecting' = 'idle';

  // Long-press
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressMs: number;

  // Scroll origin tracking: only zoom on axis if scroll STARTED on that axis.
  // Scrolls that start elsewhere (plot, page) always pass through.
  private scrollStartArea: AreaResult | null = null;
  private scrollResetTimer: ReturnType<typeof setTimeout> | null = null;

  // Track which area the drag started in (for axis-specific pan)
  private dragStartArea: AreaResult = { type: 'plot' };

  // Tap detection
  private lastTapTime = 0;
  private lastTapX = 0;
  private lastTapY = 0;

  // Pinch state
  private lastPinchDist = 0;
  private lastPinchCenterX = 0;
  private lastPinchCenterY = 0;

  // Pan drag start
  private dragStartX = 0;
  private dragStartY = 0;

  // Box selection
  private boxStartX = 0;
  private boxStartY = 0;

  // Bound handlers
  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerUp: (e: PointerEvent) => void;
  private boundPointerLeave: (e: PointerEvent) => void;
  private boundWheel: (e: WheelEvent) => void;
  private boundDblClick: (e: MouseEvent) => void;

  constructor(
    private target: HTMLElement,
    private eventBus: EventBus,
    private getMode: () => InteractionMode,
    private getLayout: () => Layout,
    private getZoomConfig: () => ZoomConfig,
    private getPanConfig: () => PanConfig,
    longPressMs?: number,
  ) {
    this.longPressMs = longPressMs ?? DEFAULT_LONG_PRESS_MS;

    this.boundPointerDown = this.onPointerDown.bind(this);
    this.boundPointerMove = this.onPointerMove.bind(this);
    this.boundPointerUp = this.onPointerUp.bind(this);
    this.boundPointerLeave = this.onPointerLeave.bind(this);
    this.boundWheel = this.onWheel.bind(this);
    this.boundDblClick = this.onDblClick.bind(this);
  }

  attach(): void {
    this.updateTouchAction();
    this.target.addEventListener('pointerdown', this.boundPointerDown);
    this.target.addEventListener('pointermove', this.boundPointerMove);
    this.target.addEventListener('pointerup', this.boundPointerUp);
    this.target.addEventListener('pointerleave', this.boundPointerLeave);
    this.target.addEventListener('wheel', this.boundWheel, { passive: false });
    this.target.addEventListener('dblclick', this.boundDblClick);
  }

  detach(): void {
    this.target.removeEventListener('pointerdown', this.boundPointerDown);
    this.target.removeEventListener('pointermove', this.boundPointerMove);
    this.target.removeEventListener('pointerup', this.boundPointerUp);
    this.target.removeEventListener('pointerleave', this.boundPointerLeave);
    this.target.removeEventListener('wheel', this.boundWheel);
    this.target.removeEventListener('dblclick', this.boundDblClick);
    this.clearLongPress();
    if (this.scrollResetTimer) clearTimeout(this.scrollResetTimer);
  }

  /** Update touch-action CSS based on current mode */
  updateTouchAction(): void {
    const mode = this.getMode();
    this.target.style.touchAction = mode === 'readonly' ? 'auto' : 'none';
  }

  // ─── Helpers ──────────────────────────────────────────────

  private localCoords(e: PointerEvent | WheelEvent | MouseEvent): { x: number; y: number } {
    const rect = this.target.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private inPlotArea(x: number, y: number): boolean {
    const { plot } = this.getLayout();
    return x >= plot.left && x <= plot.left + plot.width && y >= plot.top && y <= plot.top + plot.height;
  }

  /**
   * Determine which area a point falls in by checking against layout.axes entries.
   * Returns { type: 'plot'|'axis'|'outside', axisKey?: string }.
   */
  private getAxisArea(x: number, y: number): AreaResult {
    const layout = this.getLayout();
    const { plot } = layout;

    if (x >= plot.left && x <= plot.left + plot.width && y >= plot.top && y <= plot.top + plot.height) {
      return { type: 'plot' };
    }

    // Check each configured axis region
    for (const [key, entry] of Object.entries(layout.axes)) {
      const { area } = entry;
      if (x >= area.left && x <= area.left + area.width && y >= area.top && y <= area.top + area.height) {
        return { type: 'axis', axisKey: key };
      }
    }

    return { type: 'outside' };
  }

  private clearLongPress(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private pinchDistance(): number {
    if (this.pointers.size < 2) return 0;
    const pts = Array.from(this.pointers.values());
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private pinchCenter(): { x: number; y: number } {
    const pts = Array.from(this.pointers.values());
    if (pts.length < 2) return { x: pts[0]?.x ?? 0, y: pts[0]?.y ?? 0 };
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  }

  /** Whether the primary drag action is pan (vs box-zoom) based on mode + modifiers + area */
  private dragIsPan(e: PointerEvent): boolean {
    const mode = this.getMode();
    if (mode === 'readonly') return false;

    // Drag on axis area always pans that axis
    if (this.dragStartArea.type === 'axis') return true;

    // Touch one-finger drag always pans (box-zoom via long-press)
    if (e.pointerType === 'touch') return true;

    // Mouse/trackpad in plot area:
    // timeseries: drag=box-zoom (Grafana-style), shift+drag=pan
    // analytical: drag=box-zoom, shift+drag=pan
    return e.shiftKey;
  }

  // ─── Pointer events ───────────────────────────────────────

  private onPointerDown(e: PointerEvent): void {
    const mode = this.getMode();
    if (mode === 'readonly') return; // readonly: no interaction except cursor

    if (e.button !== 0) return; // primary button only

    const { x, y } = this.localCoords(e);
    const area = this.getAxisArea(x, y);
    if (area.type === 'outside') return;

    this.dragStartArea = area;
    this.target.setPointerCapture(e.pointerId);

    this.pointers.set(e.pointerId, {
      id: e.pointerId,
      x, y,
      startX: x, startY: y,
      startTime: Date.now(),
      pointerType: e.pointerType,
    });

    if (this.pointers.size === 2) {
      // Two pointers → pinch mode
      this.clearLongPress();
      this.state = 'pinching';
      this.lastPinchDist = this.pinchDistance();
      const center = this.pinchCenter();
      this.lastPinchCenterX = center.x;
      this.lastPinchCenterY = center.y;
      return;
    }

    if (this.pointers.size === 1 && e.pointerType === 'touch') {
      // Touch: start long-press timer
      this.clearLongPress();
      this.longPressTimer = setTimeout(() => {
        this.longPressTimer = null;
        this.state = 'long-pressing';
        // Long-press → ready for box-zoom on next move
        this.boxStartX = x;
        this.boxStartY = y;
      }, this.longPressMs);
    }

    // Store drag start
    this.dragStartX = x;
    this.dragStartY = y;
  }

  private onPointerMove(e: PointerEvent): void {
    const { x, y } = this.localCoords(e);
    const mode = this.getMode();

    // Update pointer position
    const ptr = this.pointers.get(e.pointerId);
    if (ptr) {
      ptr.x = x;
      ptr.y = y;
    }

    // Always emit cursor for crosshair/tooltip (even in readonly)
    if (this.state === 'idle' || mode === 'readonly') {
      this.eventBus.emit('action:cursor', { x, y, pointerType: e.pointerType });
    }

    if (mode === 'readonly') return;

    // ── Pinch (two-finger touch) ──
    if (this.state === 'pinching' && this.pointers.size >= 2) {
      const newDist = this.pinchDistance();
      const center = this.pinchCenter();

      if (this.lastPinchDist > 0 && newDist > 0) {
        const factor = newDist / this.lastPinchDist;

        // Axis locking: measure horizontal vs vertical spread change
        const pts = Array.from(this.pointers.values());
        const dx = Math.abs(pts[1].x - pts[0].x);
        const dy = Math.abs(pts[1].y - pts[0].y);
        const zoom = this.getZoomConfig();
        let axis: string = 'xy';
        if (zoom.x && !zoom.y) axis = 'x';
        else if (!zoom.x && zoom.y) axis = 'y';
        else if (dx > 2 * dy) axis = 'x';
        else if (dy > 2 * dx) axis = 'y';

        this.eventBus.emit('action:zoom', {
          factor: 1 / factor, // invert: spread fingers = zoom in = smaller range
          anchorX: center.x,
          anchorY: center.y,
          axis,
        });
      }

      this.lastPinchDist = newDist;
      const c = this.pinchCenter();
      this.lastPinchCenterX = c.x;
      this.lastPinchCenterY = c.y;
      return;
    }

    // ── Single pointer gestures ──
    if (!ptr || this.pointers.size !== 1) return;

    const dx = x - ptr.startX;
    const dy = y - ptr.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Not enough movement yet
    if (dist < MIN_DRAG_DISTANCE && this.state === 'idle') return;

    // Cancel long-press on movement
    if (this.state === 'idle') {
      this.clearLongPress();
      this.state = 'dragging';
    }

    // Long-press + drag → box selection
    if (this.state === 'long-pressing') {
      this.state = 'selecting';
      this.boxStartX = ptr.startX;
      this.boxStartY = ptr.startY;
      this.eventBus.emit('action:box-start', { x: this.boxStartX, y: this.boxStartY });
    }

    if (this.state === 'selecting') {
      this.eventBus.emit('action:box-update', { x, y });
      return;
    }

    // Dragging — pan or box-zoom based on mode
    if (this.state === 'dragging') {
      if (this.dragIsPan(e)) {
        // Pan: emit incremental delta with axis key from drag start area
        const prevX = this.dragStartX;
        const prevY = this.dragStartY;
        const panAxis = this.dragStartArea.type === 'axis' ? this.dragStartArea.axisKey : undefined;
        this.eventBus.emit('action:pan', { dx: x - prevX, dy: y - prevY, axis: panAxis });
        this.dragStartX = x;
        this.dragStartY = y;

        // Also update cursor during pan
        this.eventBus.emit('action:cursor', { x, y, pointerType: e.pointerType });
      } else {
        // Box zoom: first move starts the box
        if (!this.boxStartX && !this.boxStartY) {
          this.boxStartX = ptr.startX;
          this.boxStartY = ptr.startY;
          this.eventBus.emit('action:box-start', { x: this.boxStartX, y: this.boxStartY });
        }
        this.eventBus.emit('action:box-update', { x, y });
      }
    }
  }

  private onPointerUp(e: PointerEvent): void {
    const ptr = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    try { this.target.releasePointerCapture(e.pointerId); } catch {}

    this.clearLongPress();

    const mode = this.getMode();
    if (mode === 'readonly') return;

    if (!ptr) {
      this.resetState();
      return;
    }

    const { x, y } = this.localCoords(e);
    const dist = Math.sqrt((x - ptr.startX) ** 2 + (y - ptr.startY) ** 2);
    const elapsed = Date.now() - ptr.startTime;

    // ── Finalize box selection / box zoom ──
    if (this.state === 'selecting' || (this.state === 'dragging' && !this.dragIsPan(e))) {
      if (dist >= MIN_DRAG_DISTANCE) {
        this.eventBus.emit('action:box-end', {
          x1: this.boxStartX, y1: this.boxStartY,
          x2: x, y2: y,
        });
      } else {
        // Cancelled — clear the box
        this.eventBus.emit('action:box-end', { x1: 0, y1: 0, x2: 0, y2: 0 });
      }
      this.resetState();
      return;
    }

    // ── Tap detection (< 10px movement AND < 300ms) ──
    if (dist < MIN_DRAG_DISTANCE && elapsed < TAP_TIMEOUT) {
      const now = Date.now();
      const tapDist = Math.sqrt((x - this.lastTapX) ** 2 + (y - this.lastTapY) ** 2);

      if (now - this.lastTapTime < DOUBLE_TAP_TIMEOUT && tapDist < 30) {
        // Double-tap → reset zoom
        this.eventBus.emit('action:reset-zoom', undefined);
        this.lastTapTime = 0;
      } else {
        // Single tap
        this.eventBus.emit('action:tap', { x, y });
        this.lastTapTime = now;
        this.lastTapX = x;
        this.lastTapY = y;
      }
    }

    // ── Pinch ended (one finger lifted) ──
    if (this.state === 'pinching' && this.pointers.size < 2) {
      // Don't reset to idle yet if one finger is still down
      if (this.pointers.size === 1) {
        this.state = 'idle';
      }
    }

    this.resetState();
  }

  private onPointerLeave(e: PointerEvent): void {
    this.eventBus.emit('action:cursor-leave', undefined);
  }

  private resetState(): void {
    if (this.pointers.size === 0) {
      this.state = 'idle';
      this.boxStartX = 0;
      this.boxStartY = 0;
    }
  }

  // ─── Wheel (mouse scroll / trackpad pinch) ────────────────

  private onWheel(e: WheelEvent): void {
    const mode = this.getMode();
    if (mode === 'readonly') return;

    const { x, y } = this.localCoords(e);
    const area = this.getAxisArea(x, y);

    // Only intercept pinch (ctrlKey) — regular scroll passes through to page
    const isPinch = e.ctrlKey || e.metaKey;

    if (!isPinch) {
      // Track where the scroll gesture started. Only zoom if it started on an axis.
      // Reset after 200ms of no wheel events (scroll gesture ended).
      if (this.scrollStartArea === null) {
        this.scrollStartArea = area;
      }
      if (this.scrollResetTimer) clearTimeout(this.scrollResetTimer);
      this.scrollResetTimer = setTimeout(() => {
        this.scrollStartArea = null;
        this.scrollResetTimer = null;
      }, 200);

      // Only zoom if scroll STARTED on an axis area
      const startedOnAxis = this.scrollStartArea.type === 'axis';
      if (startedOnAxis && area.type === 'axis') {
        e.preventDefault();
        const zoom = this.getZoomConfig();
        if (!zoom.enabled) return;

        const sensitivity = zoom.wheelFactor ?? DEFAULT_WHEEL_FACTOR;
        const delta = Math.min(Math.abs(e.deltaY), 20) * 0.005;
        const factor = e.deltaY > 0 ? 1 + delta * (sensitivity - 1) * 10 : 1 / (1 + delta * (sensitivity - 1) * 10);
        const axis = this.scrollStartArea.axisKey!;

        this.eventBus.emit('action:zoom', { factor, anchorX: x, anchorY: y, axis });
        return;
      }

      // Scroll started elsewhere — let it pass through to page
      return;
    }

    // Pinch-to-zoom (ctrlKey on wheel)
    if (!this.inPlotArea(x, y) && area.type !== 'axis') return;

    e.preventDefault();

    const zoom = this.getZoomConfig();
    if (!zoom.enabled) return;

    const sensitivity = zoom.wheelFactor ?? DEFAULT_WHEEL_FACTOR;
    const delta = Math.min(Math.abs(e.deltaY), 20) * 0.005;
    const factor = e.deltaY > 0 ? 1 + delta * (sensitivity - 1) * 10 : 1 / (1 + delta * (sensitivity - 1) * 10);

    let axis: string = 'xy';
    if (zoom.x && !zoom.y) axis = 'x';
    else if (!zoom.x && zoom.y) axis = 'y';

    this.eventBus.emit('action:zoom', { factor, anchorX: x, anchorY: y, axis });
  }

  // ─── Double-click (mouse only — touch uses double-tap) ────

  private onDblClick(e: MouseEvent): void {
    const mode = this.getMode();
    if (mode === 'readonly') return;

    const zoom = this.getZoomConfig();
    if (!zoom.enabled) return;

    const { x, y } = this.localCoords(e);
    if (!this.inPlotArea(x, y)) return;

    this.eventBus.emit('action:reset-zoom', undefined);
  }
}
