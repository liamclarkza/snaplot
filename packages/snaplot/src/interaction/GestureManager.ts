import type { InteractionMode, Layout, PanConfig, TouchConfig, ZoomConfig } from '../types';
import type { EventBus } from '../core/EventBus';
import {
  MIN_DRAG_DISTANCE,
  DEFAULT_WHEEL_STEP,
  DEFAULT_LONG_PRESS_MS,
  TAP_TIMEOUT,
  DOUBLE_TAP_TIMEOUT,
} from '../constants';

/**
 * GestureManager, unified gesture detection and action dispatch.
 *
 * Replaces PointerHandler + ZoomPanHandler. Handles:
 * - Mouse: drag, click, double-click, wheel, modifiers (shift, ctrl/cmd)
 * - Trackpad: two-finger scroll (passthrough), pinch (ctrlKey on wheel)
 * - Touch: one-finger drag, two-finger pinch, tap, double-tap, long-press
 *
 * Gesture→action mapping is determined by the interaction mode:
 * - mouse: drag=box-zoom, shift+drag=pan
 * - touch: drag=cursor by default, or pan when `touch.drag` is `'pan'`
 * - touch selection: double-tap+drag by default, long-press only by opt-in
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

type GestureState =
  | { kind: 'idle' }
  | ActivePressState
  | ActiveCursorState
  | ActivePanState
  | ActiveBoxState
  | ActivePinchState;

interface ActivePressState {
  kind: 'press' | 'selection-pending' | 'long-press-ready';
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startTime: number;
  lastMoveTime: number;
  area: AreaResult;
}

interface ActiveCursorState {
  kind: 'cursor';
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
}

interface ActivePanState {
  kind: 'pan';
  pointerId: number;
  pointerType: string;
  lastX: number;
  lastY: number;
  axis?: string;
  lastMoveTime: number;
  velocityX: number;
  velocityY: number;
}

interface ActiveBoxState {
  kind: 'box';
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  mode: 'zoom' | 'selection';
}

interface ActivePinchState {
  kind: 'pinch';
  lastDist: number;
}

export class GestureManager {
  private pointers = new Map<number, PointerState>();
  private state: GestureState = { kind: 'idle' };

  // Long-press
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  // Scroll origin tracking: only zoom on axis if scroll STARTED on that axis.
  // Scrolls that start elsewhere (plot, page) always pass through.
  private scrollStartArea: AreaResult | null = null;
  private scrollResetTimer: ReturnType<typeof setTimeout> | null = null;

  // Tap detection
  private lastTapTime = 0;
  private lastTapX = 0;
  private lastTapY = 0;

  // Touch pan momentum, started only from a completed pan gesture.
  private momentumFrame: number | null = null;

  // Bound handlers
  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerUp: (e: PointerEvent) => void;
  private boundPointerLeave: (e: PointerEvent) => void;
  private boundWheel: (e: WheelEvent) => void;
  private boundDblClick: (e: MouseEvent) => void;
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundTouchPreventDefault: (e: TouchEvent) => void;
  /** Element that receives keyboard focus (chart container with tabindex=0). */
  private keyboardTarget: HTMLElement | null = null;

  constructor(
    private target: HTMLElement,
    private eventBus: EventBus,
    private getMode: () => InteractionMode,
    private getLayout: () => Layout,
    private getZoomConfig: () => ZoomConfig,
    private getPanConfig: () => PanConfig,
    private getTouchConfig: () => TouchConfig,
    private coordinateTarget: HTMLElement = target,
  ) {
    this.boundPointerDown = this.onPointerDown.bind(this);
    this.boundPointerMove = this.onPointerMove.bind(this);
    this.boundPointerUp = this.onPointerUp.bind(this);
    this.boundPointerLeave = this.onPointerLeave.bind(this);
    this.boundWheel = this.onWheel.bind(this);
    this.boundDblClick = this.onDblClick.bind(this);
    this.boundKeyDown = this.onKeyDown.bind(this);
    this.boundTouchPreventDefault = this.onTouchPreventDefault.bind(this);
  }

  attach(): void {
    this.updateTouchAction();
    this.target.addEventListener('pointerdown', this.boundPointerDown);
    this.target.addEventListener('pointermove', this.boundPointerMove);
    this.target.addEventListener('pointerup', this.boundPointerUp);
    this.target.addEventListener('pointerleave', this.boundPointerLeave);
    this.target.addEventListener('wheel', this.boundWheel, { passive: false });
    this.target.addEventListener('dblclick', this.boundDblClick);
    this.target.addEventListener('touchstart', this.boundTouchPreventDefault, { passive: false });
    this.target.addEventListener('touchmove', this.boundTouchPreventDefault, { passive: false });
    this.target.addEventListener('touchend', this.boundTouchPreventDefault, { passive: false });
    this.target.addEventListener('touchcancel', this.boundTouchPreventDefault, { passive: false });

    // Keyboard events bubble up from the focused element, so attach to the
    // focusable container (the CanvasManager's tabindex=0 parent of dataCanvas).
    // Walking the parent chain keeps GestureManager's constructor signature
    // stable, callers don't need to pass both targets separately.
    this.keyboardTarget = this.target.parentElement;
    this.keyboardTarget?.addEventListener('keydown', this.boundKeyDown);
  }

  detach(): void {
    this.target.removeEventListener('pointerdown', this.boundPointerDown);
    this.target.removeEventListener('pointermove', this.boundPointerMove);
    this.target.removeEventListener('pointerup', this.boundPointerUp);
    this.target.removeEventListener('pointerleave', this.boundPointerLeave);
    this.target.removeEventListener('wheel', this.boundWheel);
    this.target.removeEventListener('dblclick', this.boundDblClick);
    this.target.removeEventListener('touchstart', this.boundTouchPreventDefault);
    this.target.removeEventListener('touchmove', this.boundTouchPreventDefault);
    this.target.removeEventListener('touchend', this.boundTouchPreventDefault);
    this.target.removeEventListener('touchcancel', this.boundTouchPreventDefault);
    this.keyboardTarget?.removeEventListener('keydown', this.boundKeyDown);
    this.keyboardTarget = null;
    this.clearLongPress();
    this.cancelMomentum();
    if (this.scrollResetTimer) clearTimeout(this.scrollResetTimer);
  }

  /** Update touch-action CSS based on current mode */
  updateTouchAction(): void {
    const mode = this.getMode();
    this.target.style.touchAction = mode === 'readonly' ? 'auto' : 'none';
  }

  private onTouchPreventDefault(e: TouchEvent): void {
    if (this.getMode() === 'readonly') return;
    e.preventDefault();
  }

  // ─── Helpers ──────────────────────────────────────────────

  private localCoords(e: PointerEvent | WheelEvent | MouseEvent): { x: number; y: number } {
    const rect = this.coordinateTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private inPlotArea(x: number, y: number): boolean {
    const { plot } = this.getLayout();
    return x > plot.left && x < plot.left + plot.width && y > plot.top && y < plot.top + plot.height;
  }

  /**
   * Determine which area a point falls in by checking against layout.axes entries.
   * Returns { type: 'plot'|'axis'|'outside', axisKey?: string }.
   */
  private getAxisArea(x: number, y: number): AreaResult {
    const layout = this.getLayout();

    if (this.inPlotArea(x, y)) {
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

  private touchDragMode(): 'cursor' | 'pan' {
    return this.getTouchConfig().drag ?? 'cursor';
  }

  private touchSelectionGesture(): 'double-tap-drag' | 'long-press' | 'none' {
    const touch = this.getTouchConfig();
    if (touch.selectionGesture) return touch.selectionGesture;
    return touch.drag === 'pan' ? 'none' : 'double-tap-drag';
  }

  private isTouchLike(e: PointerEvent): boolean {
    return e.pointerType === 'touch' || e.pointerType === 'pen';
  }

  private distance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }

  private isDoubleTapCandidate(x: number, y: number, now: number): boolean {
    if (this.lastTapTime === 0) return false;
    return now - this.lastTapTime < DOUBLE_TAP_TIMEOUT
      && this.distance(x, y, this.lastTapX, this.lastTapY) < 30;
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
  private dragIsPan(area: AreaResult, pointerType: string, shiftKey: boolean): boolean {
    const mode = this.getMode();
    if (mode === 'readonly') return false;

    if (area.type === 'axis') return this.getPanConfig().axis === true;

    if (pointerType === 'touch') return this.touchDragMode() === 'pan';

    return shiftKey;
  }

  private panAxisForArea(area: AreaResult): string | undefined {
    return area.type === 'axis' ? area.axisKey : undefined;
  }

  private makePressState(
    kind: ActivePressState['kind'],
    pointer: PointerState,
    area: AreaResult,
  ): ActivePressState {
    return {
      kind,
      pointerId: pointer.id,
      pointerType: pointer.pointerType,
      startX: pointer.startX,
      startY: pointer.startY,
      lastX: pointer.x,
      lastY: pointer.y,
      startTime: pointer.startTime,
      lastMoveTime: performance.now(),
      area,
    };
  }

  private armLongPress(pointerId: number): void {
    const longPressMs = this.getTouchConfig().longPressMs ?? DEFAULT_LONG_PRESS_MS;
    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = null;
      const state = this.state;
      if (state.kind !== 'press' || state.pointerId !== pointerId || state.pointerType !== 'touch') return;
      this.state = { ...state, kind: 'long-press-ready' };
    }, longPressMs);
  }

  private resetTapMemory(): void {
    this.lastTapTime = 0;
    this.lastTapX = 0;
    this.lastTapY = 0;
  }

  // ─── Pointer events ───────────────────────────────────────

  private onPointerDown(e: PointerEvent): void {
    const mode = this.getMode();
    if (e.button !== 0) return; // primary button only

    const { x, y } = this.localCoords(e);
    const area = this.getAxisArea(x, y);
    if (area.type === 'outside') return;

    if (this.isTouchLike(e) && area.type === 'plot') {
      if (mode !== 'readonly') e.preventDefault();
      this.eventBus.emit('action:cursor', { x, y, pointerType: e.pointerType });
    }

    if (mode === 'readonly') return;

    if (area.type !== 'plot' && !(area.type === 'axis' && this.getPanConfig().axis === true)) {
      return;
    }

    this.cancelMomentum();

    // Capture is helpful for uninterrupted drags, but browsers can reject it
    // during fast synthetic or multi-touch transitions.
    try { this.target.setPointerCapture(e.pointerId); } catch {}

    const pointer: PointerState = {
      id: e.pointerId,
      x, y,
      startX: x, startY: y,
      startTime: Date.now(),
      pointerType: e.pointerType,
    };
    this.pointers.set(e.pointerId, pointer);

    if (this.pointers.size === 2) {
      this.clearLongPress();
      this.resetTapMemory();
      this.state = { kind: 'pinch', lastDist: this.pinchDistance() };
      return;
    }

    if (this.pointers.size !== 1) return;

    if (e.pointerType === 'touch') {
      const now = Date.now();
      if (
        this.touchSelectionGesture() === 'double-tap-drag' &&
        this.isDoubleTapCandidate(x, y, now)
      ) {
        this.state = this.makePressState('selection-pending', pointer, area);
        return;
      }

      this.clearLongPress();
      this.state = this.makePressState('press', pointer, area);
      if (this.touchSelectionGesture() === 'long-press') this.armLongPress(e.pointerId);
      return;
    }

    this.clearLongPress();
    this.state = this.makePressState('press', pointer, area);
  }

  private onPointerMove(e: PointerEvent): void {
    const { x, y } = this.localCoords(e);
    const mode = this.getMode();
    const area = this.getAxisArea(x, y);

    // Update pointer position
    const ptr = this.pointers.get(e.pointerId);
    if (ptr) {
      ptr.x = x;
      ptr.y = y;
    }

    if (ptr && this.isTouchLike(e)) {
      e.preventDefault();
    }

    // Emit hover cursor only when no drag pointer is active. During the first
    // few pixels of a box selection, state is still idle until we cross the
    // drag threshold; publishing those interim moves makes synced peers drift
    // away from the selection anchor.
    if (this.pointers.size === 0 || mode === 'readonly') {
      if (area.type !== 'plot') {
        this.eventBus.emit('action:cursor-leave', undefined);
        return;
      }
      this.eventBus.emit('action:cursor', { x, y, pointerType: e.pointerType });
    }

    if (mode === 'readonly') return;

    // ── Pinch (two-finger touch) ──
    if (this.state.kind === 'pinch' && this.pointers.size >= 2) {
      const newDist = this.pinchDistance();
      const center = this.pinchCenter();

      if (this.state.lastDist > 0 && newDist > 0) {
        const factor = newDist / this.state.lastDist;

        // Default touch pinch mirrors desktop wheel/pinch: if both axes are
        // enabled, zoom both together. `pinchMode: 'axis-lock'` opts back into
        // direction-based locking for apps that need it.
        const pts = Array.from(this.pointers.values());
        const dx = Math.abs(pts[1].x - pts[0].x);
        const dy = Math.abs(pts[1].y - pts[0].y);
        const zoom = this.getZoomConfig();
        let axis: string = 'xy';
        if (zoom.x && !zoom.y) axis = 'x';
        else if (!zoom.x && zoom.y) axis = 'y';
        else if (zoom.pinchMode === 'axis-lock') {
          if (dx > 2 * dy) axis = 'x';
          else if (dy > 2 * dx) axis = 'y';
        }

        this.eventBus.emit('action:zoom', {
          factor: 1 / factor, // invert: spread fingers = zoom in = smaller range
          anchorX: center.x,
          anchorY: center.y,
          axis,
        });
      }

      this.state = { kind: 'pinch', lastDist: newDist };
      return;
    }

    // ── Single pointer gestures ──
    if (!ptr || this.pointers.size !== 1) return;

    const state = this.state;
    const dist = this.distance(x, y, ptr.startX, ptr.startY);

    if (state.kind === 'selection-pending' && state.pointerId === e.pointerId) {
      if (dist >= MIN_DRAG_DISTANCE) {
        this.clearLongPress();
        this.state = {
          kind: 'box',
          pointerId: e.pointerId,
          pointerType: state.pointerType,
          startX: state.startX,
          startY: state.startY,
          lastX: x,
          lastY: y,
          mode: 'selection',
        };
        this.eventBus.emit('action:box-start', { x: state.startX, y: state.startY });
        this.eventBus.emit('action:box-update', { x, y });
      } else {
        this.eventBus.emit('action:cursor', { x, y, pointerType: e.pointerType });
      }
      return;
    }

    if (state.kind === 'box' && state.pointerId === e.pointerId) {
      this.state = { ...state, lastX: x, lastY: y };
      this.eventBus.emit('action:box-update', { x, y });
      return;
    }

    if (state.kind === 'cursor' && state.pointerId === e.pointerId) {
      this.state = { ...state, lastX: x, lastY: y };
      this.eventBus.emit('action:cursor', { x, y, pointerType: e.pointerType });
      return;
    }

    if (state.kind === 'pan' && state.pointerId === e.pointerId) {
      const dxPan = x - state.lastX;
      const dyPan = y - state.lastY;
      let velocityX = state.velocityX;
      let velocityY = state.velocityY;
      let lastMoveTime = state.lastMoveTime;

      this.eventBus.emit('action:pan', { dx: dxPan, dy: dyPan, axis: state.axis });

      if (state.pointerType === 'touch') {
        const now = performance.now();
        const dt = Math.max(1, now - state.lastMoveTime);
        const a = 0.5;
        velocityX = a * (dxPan / dt) + (1 - a) * state.velocityX;
        velocityY = a * (dyPan / dt) + (1 - a) * state.velocityY;
        lastMoveTime = now;
      }

      this.state = {
        ...state,
        lastX: x,
        lastY: y,
        lastMoveTime,
        velocityX,
        velocityY,
      };
      this.eventBus.emit('action:cursor', { x, y, pointerType: e.pointerType });
      return;
    }

    if (state.kind === 'long-press-ready' && state.pointerId === e.pointerId) {
      if (dist < MIN_DRAG_DISTANCE) {
        this.eventBus.emit('action:cursor', { x, y, pointerType: e.pointerType });
        return;
      }
      this.state = {
        kind: 'box',
        pointerId: e.pointerId,
        pointerType: state.pointerType,
        startX: state.startX,
        startY: state.startY,
        lastX: x,
        lastY: y,
        mode: 'selection',
      };
      this.eventBus.emit('action:box-start', { x: state.startX, y: state.startY });
      this.eventBus.emit('action:box-update', { x, y });
      return;
    }

    if (state.kind !== 'press' || state.pointerId !== e.pointerId) return;

    if (e.pointerType === 'touch' && this.touchDragMode() === 'cursor') {
      if (dist >= MIN_DRAG_DISTANCE) this.clearLongPress();
      this.state = {
        kind: 'cursor',
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        startX: state.startX,
        startY: state.startY,
        lastX: x,
        lastY: y,
      };
      this.eventBus.emit('action:cursor', { x, y, pointerType: e.pointerType });
      return;
    }

    if (dist < MIN_DRAG_DISTANCE) return;

    this.clearLongPress();
    if (this.dragIsPan(state.area, e.pointerType, e.shiftKey)) {
      const panAxis = this.panAxisForArea(state.area);
      const now = performance.now();
      const dxPan = x - state.startX;
      const dyPan = y - state.startY;
      this.eventBus.emit('action:pan', { dx: dxPan, dy: dyPan, axis: panAxis });
      this.state = {
        kind: 'pan',
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        lastX: x,
        lastY: y,
        axis: panAxis,
        lastMoveTime: now,
        velocityX: e.pointerType === 'touch' ? dxPan / Math.max(1, now - state.lastMoveTime) : 0,
        velocityY: e.pointerType === 'touch' ? dyPan / Math.max(1, now - state.lastMoveTime) : 0,
      };
      this.eventBus.emit('action:cursor', { x, y, pointerType: e.pointerType });
      return;
    }

    this.state = {
      kind: 'box',
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      startX: state.startX,
      startY: state.startY,
      lastX: x,
      lastY: y,
      mode: 'zoom',
    };
    this.eventBus.emit('action:box-start', { x: state.startX, y: state.startY });
    this.eventBus.emit('action:box-update', { x, y });
  }

  private onPointerUp(e: PointerEvent): void {
    const ptr = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    try { this.target.releasePointerCapture(e.pointerId); } catch {}
    if (ptr && (ptr.pointerType === 'touch' || ptr.pointerType === 'pen')) {
      e.preventDefault();
    }

    this.clearLongPress();

    const mode = this.getMode();
    if (mode === 'readonly') return;

    if (!ptr) {
      this.resetState();
      return;
    }

    const { x, y } = this.localCoords(e);
    const dist = this.distance(x, y, ptr.startX, ptr.startY);
    const elapsed = Date.now() - ptr.startTime;
    const state = this.state;

    // ── Finalize box selection / box zoom ──
    if (state.kind === 'box' && state.pointerId === e.pointerId) {
      if (dist >= MIN_DRAG_DISTANCE) {
        this.eventBus.emit('action:box-end', {
          x1: state.startX, y1: state.startY,
          x2: x, y2: y,
        });
      } else {
        this.eventBus.emit('action:box-end', { x1: 0, y1: 0, x2: 0, y2: 0 });
      }
      this.resetState();
      return;
    }

    if (state.kind === 'selection-pending' && state.pointerId === e.pointerId) {
      if (dist < MIN_DRAG_DISTANCE) {
        this.eventBus.emit('action:reset-zoom', undefined);
        this.resetTapMemory();
      }
      this.resetState();
      return;
    }

    if (state.kind === 'pan' && state.pointerId === e.pointerId) {
      if (ptr.pointerType === 'touch' && this.pointers.size === 0) {
        this.startMomentum(state.velocityX, state.velocityY, state.axis);
      }
      this.resetState();
      return;
    }

    if (state.kind === 'cursor' && state.pointerId === e.pointerId) {
      this.resetState();
      return;
    }

    // ── Pinch ended (one finger lifted) ──
    if (state.kind === 'pinch') {
      if (this.pointers.size === 1) {
        const survivor = this.pointers.values().next().value;
        if (survivor) {
          survivor.startX = survivor.x;
          survivor.startY = survivor.y;
          survivor.startTime = Date.now();
          this.state = this.makePressState('press', survivor, this.getAxisArea(survivor.x, survivor.y));
        }
      } else {
        this.resetState();
      }
      return;
    }

    // ── Tap detection (< 10px movement AND < 300ms) ──
    if (
      (state.kind === 'press' || state.kind === 'long-press-ready') &&
      state.pointerId === e.pointerId &&
      dist < MIN_DRAG_DISTANCE &&
      elapsed < TAP_TIMEOUT
    ) {
      const now = Date.now();
      if (this.isDoubleTapCandidate(x, y, now)) {
        this.eventBus.emit('action:reset-zoom', undefined);
        this.resetTapMemory();
      } else {
        this.eventBus.emit('action:tap', { x, y, pointerType: ptr.pointerType });
        this.lastTapTime = now;
        this.lastTapX = x;
        this.lastTapY = y;
      }
    }

    this.resetState();
  }

  private onPointerLeave(_e: PointerEvent): void {
    // Suppress cursor-leave while a gesture is in flight, pointer capture
    // keeps the drag alive even when the pointer briefly leaves the canvas
    // bounds. Without this guard the crosshair/tooltip flickers mid-pan.
    if (this.state.kind !== 'idle') return;
    this.eventBus.emit('action:cursor-leave', undefined);
  }

  private resetState(): void {
    if (this.pointers.size === 0) {
      this.state = { kind: 'idle' };
    }
  }

  // ─── Pan momentum (touch only) ────────────────────────────

  private startMomentum(velocityX: number, velocityY: number, axis: string | undefined): void {
    if (typeof requestAnimationFrame === 'undefined') return;

    // Threshold of 0.1 px/ms ≈ 100 px/s, below this it's just a static release.
    const vMag = Math.hypot(velocityX, velocityY);
    if (vMag < 0.1) return;

    // Cap peak velocity so a jittery last sample can't launch the chart.
    const MAX_V = 2.5; // px/ms ≈ 2500 px/s
    let vx = velocityX;
    let vy = velocityY;
    if (vMag > MAX_V) {
      const s = MAX_V / vMag;
      vx *= s;
      vy *= s;
    }

    let lastT = performance.now();
    const step = (now: number) => {
      const dt = Math.min(32, now - lastT); // clamp frame to avoid teleporting after tab blur
      lastT = now;

      const dx = vx * dt;
      const dy = vy * dt;
      this.eventBus.emit('action:pan', { dx, dy, axis });

      // Exponential decay, halves roughly every ~130ms.
      const decay = Math.exp(-dt / 180);
      vx *= decay;
      vy *= decay;

      if (Math.hypot(vx, vy) < 0.02) {
        this.momentumFrame = null;
        return;
      }
      this.momentumFrame = requestAnimationFrame(step);
    };
    this.momentumFrame = requestAnimationFrame(step);
  }

  private cancelMomentum(): void {
    if (this.momentumFrame !== null) {
      if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.momentumFrame);
      this.momentumFrame = null;
    }
  }

  // ─── Wheel (mouse scroll / trackpad pinch) ────────────────

  private onWheel(e: WheelEvent): void {
    const mode = this.getMode();
    if (mode === 'readonly') return;

    const { x, y } = this.localCoords(e);
    const area = this.getAxisArea(x, y);

    // Only intercept pinch (ctrlKey), regular scroll passes through to page
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
        const zoom = this.getZoomConfig();
        if (!zoom.enabled || zoom.axis !== true) return;
        e.preventDefault();

        // Magnitude only, direction comes from the sign of deltaY.
        // Negative values are clamped to 0 (disabled); there's no
        // legitimate use for an inverted wheel.
        const strength = Math.max(0, zoom.wheelStep ?? DEFAULT_WHEEL_STEP);
        const delta = Math.min(Math.abs(e.deltaY), 20) * 0.005;
        const factor = e.deltaY > 0 ? 1 + delta * strength * 10 : 1 / (1 + delta * strength * 10);
        const axis = this.scrollStartArea.axisKey!;

        this.eventBus.emit('action:zoom', { factor, anchorX: x, anchorY: y, axis });
        return;
      }

      // Scroll started elsewhere, let it pass through to page
      return;
    }

    // Pinch-to-zoom (ctrlKey on wheel). Axis gutters are inert by default;
    // `zoom.axis: true` opts back into axis-origin wheel/pinch controls.
    const zoom = this.getZoomConfig();
    if (!this.inPlotArea(x, y)) {
      if (area.type !== 'axis' || zoom.axis !== true) return;
    }

    e.preventDefault();

    if (!zoom.enabled) return;

    const strength = Math.max(0, zoom.wheelStep ?? DEFAULT_WHEEL_STEP);
    const delta = Math.min(Math.abs(e.deltaY), 20) * 0.005;
    const factor = e.deltaY > 0 ? 1 + delta * strength * 10 : 1 / (1 + delta * strength * 10);

    let axis: string = 'xy';
    if (zoom.x && !zoom.y) axis = 'x';
    else if (!zoom.x && zoom.y) axis = 'y';

    this.eventBus.emit('action:zoom', { factor, anchorX: x, anchorY: y, axis });
  }

  // ─── Double-click (mouse only, touch uses double-tap) ────

  private onDblClick(e: MouseEvent): void {
    const mode = this.getMode();
    if (mode === 'readonly') return;

    const zoom = this.getZoomConfig();
    if (!zoom.enabled) return;

    const { x, y } = this.localCoords(e);
    if (!this.inPlotArea(x, y)) return;

    this.eventBus.emit('action:reset-zoom', undefined);
  }

  // ─── Keyboard (arrow keys, +/-, 0) ─────────────────────────

  /**
   * Keyboard shortcuts for keyboard-only users. Active while the chart
   * container has focus.
   *
   *   ArrowLeft / ArrowRight  , pan X by PAN_STEP
   *   ArrowUp / ArrowDown     , pan Y by PAN_STEP (if pan.y enabled)
   *   Shift + Arrow           , larger step (PAN_STEP_FAST)
   *   `+` / `=`               , zoom in at the chart centre
   *   `-` / `_`               , zoom out at the chart centre
   *   `0` / `Home`            , reset zoom
   *
   * All shortcuts respect interaction mode: readonly suppresses them.
   */
  private onKeyDown(e: KeyboardEvent): void {
    const mode = this.getMode();
    if (mode === 'readonly') return;

    // Ignore if the user is typing into an input/textarea that happens
    // to be nested inside a custom chart container (tooltip templates etc.).
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
      return;
    }

    const PAN_STEP = 40;
    const PAN_STEP_FAST = 120;
    const ZOOM_FACTOR = 1.2; // 20% per key press, matches wheel feel
    const layout = this.getLayout();
    const centreX = layout.plot.left + layout.plot.width / 2;
    const centreY = layout.plot.top + layout.plot.height / 2;

    let handled = true;
    switch (e.key) {
      case 'ArrowLeft':
        this.eventBus.emit('action:pan', { dx: e.shiftKey ? PAN_STEP_FAST : PAN_STEP, dy: 0 });
        break;
      case 'ArrowRight':
        this.eventBus.emit('action:pan', { dx: -(e.shiftKey ? PAN_STEP_FAST : PAN_STEP), dy: 0 });
        break;
      case 'ArrowUp':
        this.eventBus.emit('action:pan', { dx: 0, dy: e.shiftKey ? PAN_STEP_FAST : PAN_STEP });
        break;
      case 'ArrowDown':
        this.eventBus.emit('action:pan', { dx: 0, dy: -(e.shiftKey ? PAN_STEP_FAST : PAN_STEP) });
        break;
      case '+':
      case '=': {
        const zoom = this.getZoomConfig();
        const axis = zoom.x && !zoom.y ? 'x' : !zoom.x && zoom.y ? 'y' : 'xy';
        this.eventBus.emit('action:zoom', { factor: 1 / ZOOM_FACTOR, anchorX: centreX, anchorY: centreY, axis });
        break;
      }
      case '-':
      case '_': {
        const zoom = this.getZoomConfig();
        const axis = zoom.x && !zoom.y ? 'x' : !zoom.x && zoom.y ? 'y' : 'xy';
        this.eventBus.emit('action:zoom', { factor: ZOOM_FACTOR, anchorX: centreX, anchorY: centreY, axis });
        break;
      }
      case '0':
      case 'Home':
        this.eventBus.emit('action:reset-zoom', undefined);
        break;
      default:
        handled = false;
    }

    if (handled) e.preventDefault();
  }
}
