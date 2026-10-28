import type { InteractionMode, Layout, PanConfig, TouchConfig, ZoomConfig } from '../spec';
import type { EventBus } from './bus';
import type { ActivePressState, AreaResult, GestureState, PointerState } from './gesture-state';
import { handleChartKey } from './keyboard';
import { PanMomentum } from './momentum';
import { areaAt, inPlot, localPoint, wheelFactor } from './pointer';
import {
  MIN_DRAG_DISTANCE,
  DEFAULT_LONG_PRESS_MS,
  TAP_TIMEOUT,
  DOUBLE_TAP_TIMEOUT,
} from '../../constants';

/** Focus a press gives the chart: no scroll, and no keyboard-focus ring (`focusVisible`). */
const POINTER_FOCUS = { preventScroll: true, focusVisible: false } as FocusOptions;

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
 *
 * Keys go through the key table (keyboard.ts); the state machine's types are in gesture-state.ts,
 * and what each emitted action does is the action table (actions.ts).
 */

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
  private momentum: PanMomentum;

  // Bound handlers
  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerUp: (e: PointerEvent) => void;
  private boundPointerLeave: (e: PointerEvent) => void;
  private boundPointerCancel: (e: PointerEvent) => void;
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
    /** What Home, End and Escape need to know: is the cursor on the chart, is a selection shown. */
    private getKeyState: () => { cursorActive: boolean; selectionActive: boolean } = () => ({
      cursorActive: false,
      selectionActive: false,
    }),
  ) {
    this.momentum = new PanMomentum(eventBus);
    this.boundPointerDown = this.onPointerDown.bind(this);
    this.boundPointerMove = this.onPointerMove.bind(this);
    this.boundPointerUp = this.onPointerUp.bind(this);
    this.boundPointerLeave = this.onPointerLeave.bind(this);
    this.boundPointerCancel = this.onPointerCancel.bind(this);
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
    // An OS-cancelled pointer (palm rejection, notification shade, browser
    // gesture take-over) never fires pointerup, and losing pointer capture
    // mid-drag has the same effect: without cleanup the pointer stays in the
    // map and the next touch is misread as a second finger (spurious pinch).
    this.target.addEventListener('pointercancel', this.boundPointerCancel);
    this.target.addEventListener('lostpointercapture', this.boundPointerCancel);
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
    this.target.removeEventListener('pointercancel', this.boundPointerCancel);
    this.target.removeEventListener('lostpointercapture', this.boundPointerCancel);
    this.target.removeEventListener('wheel', this.boundWheel);
    this.target.removeEventListener('dblclick', this.boundDblClick);
    this.target.removeEventListener('touchstart', this.boundTouchPreventDefault);
    this.target.removeEventListener('touchmove', this.boundTouchPreventDefault);
    this.target.removeEventListener('touchend', this.boundTouchPreventDefault);
    this.target.removeEventListener('touchcancel', this.boundTouchPreventDefault);
    this.keyboardTarget?.removeEventListener('keydown', this.boundKeyDown);
    this.keyboardTarget = null;
    this.releaseTouchTooltip?.();
    this.clearLongPress();
    this.momentum.cancel();
    if (this.scrollResetTimer) clearTimeout(this.scrollResetTimer);
  }

  /** Update touch-action CSS based on current mode */
  /**
   * The touch rules (plan D19): a chart whose one-finger drag pans (`zoom: 'xy'`, `drag: 'pan'`)
   * takes every touch (`none`); any other leaves vertical swipes to the page (`pan-y`), so a
   * one-finger horizontal drag scrubs the cursor and two fingers pinch.
   */
  updateTouchAction(): void {
    const pans = this.getMode() !== 'readonly' && this.touchDragMode() === 'pan';
    this.target.style.touchAction = pans ? 'none' : 'pan-y';
  }

  private onTouchPreventDefault(e: TouchEvent): void {
    if (this.getMode() === 'readonly') return;
    // Under pan-y the page keeps its vertical scroll; a pinch is always the chart's.
    if (this.touchDragMode() === 'pan' || e.touches.length >= 2) e.preventDefault();
  }

  /**
   * A tap's tooltip stays after the finger lifts (plan D19), until a tap outside the chart or a
   * scroll of the page.
   */
  private persistTouchTooltip(): void {
    if (this.releaseTouchTooltip) return;
    const doc = this.target.ownerDocument;
    const view = doc.defaultView;
    const dismiss = (event: Event) => {
      if (event.type === 'pointerdown' && this.coordinateTarget.contains(event.target as Node)) {
        return;
      }
      this.releaseTouchTooltip?.();
      this.eventBus.emit('action:cursor-leave', undefined);
    };
    doc.addEventListener('pointerdown', dismiss, true);
    view?.addEventListener('scroll', dismiss, { passive: true });
    this.releaseTouchTooltip = () => {
      doc.removeEventListener('pointerdown', dismiss, true);
      view?.removeEventListener('scroll', dismiss);
      this.releaseTouchTooltip = null;
    };
  }
  private releaseTouchTooltip: (() => void) | null = null;

  // ─── Helpers ──────────────────────────────────────────────

  private localCoords(e: PointerEvent | WheelEvent | MouseEvent): { x: number; y: number } {
    return localPoint(this.coordinateTarget, e);
  }

  private inPlotArea(x: number, y: number): boolean {
    return inPlot(this.getLayout(), x, y);
  }

  private getAxisArea(x: number, y: number): AreaResult {
    return areaAt(this.getLayout(), x, y);
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
    return (
      now - this.lastTapTime < DOUBLE_TAP_TIMEOUT &&
      this.distance(x, y, this.lastTapX, this.lastTapY) < 30
    );
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
      if (state.kind !== 'press' || state.pointerId !== pointerId || state.pointerType !== 'touch')
        return;
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

    // Pointer interaction should not paint the browser's keyboard-focus ring, but a mouse or pen
    // press does focus the chart, so the keys work next (plan D20). Focus from script can match
    // :focus-visible (Chrome rings it), so it asks for no ring: Tab still shows one. A touch does
    // not focus the chart: no keys follow a finger, and iOS Safari draws the ring after a touch.
    if (!this.isTouchLike(e)) {
      e.preventDefault();
      if (mode !== 'readonly') this.coordinateTarget.focus(POINTER_FOCUS);
    }

    if (this.isTouchLike(e) && area.type === 'plot') {
      if (mode !== 'readonly') e.preventDefault();
      this.eventBus.emit('action:cursor', { x, y, pointerType: e.pointerType });
    }

    if (mode === 'readonly') return;

    if (area.type !== 'plot' && !(area.type === 'axis' && this.getPanConfig().axis === true)) {
      return;
    }

    this.momentum.cancel();

    // Capture is helpful for uninterrupted drags, but browsers can reject it
    // during fast synthetic or multi-touch transitions.
    try {
      this.target.setPointerCapture(e.pointerId);
    } catch {}

    const pointer: PointerState = {
      id: e.pointerId,
      x,
      y,
      startX: x,
      startY: y,
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
    try {
      this.target.releasePointerCapture(e.pointerId);
    } catch {}
    if (ptr && (ptr.pointerType === 'touch' || ptr.pointerType === 'pen')) {
      e.preventDefault();
    }

    this.clearLongPress();

    const mode = this.getMode();
    if (mode === 'readonly') {
      // A gesture begun before a mid-gesture flip to readonly would otherwise
      // leave state non-idle for the readonly period, which suppresses
      // cursor-leave. Reset so the crosshair/tooltip can dismiss.
      this.resetState();
      return;
    }

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
          x1: state.startX,
          y1: state.startY,
          x2: x,
          y2: y,
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
        this.momentum.start(state.velocityX, state.velocityY, state.axis);
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
          this.state = this.makePressState(
            'press',
            survivor,
            this.getAxisArea(survivor.x, survivor.y),
          );
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
      // A mouse click is a click however long it is held; a long touch is a press.
      (ptr.pointerType === 'mouse' || elapsed < TAP_TIMEOUT)
    ) {
      const now = Date.now();
      if (this.isDoubleTapCandidate(x, y, now)) {
        this.eventBus.emit('action:reset-zoom', undefined);
        this.resetTapMemory();
      } else {
        this.eventBus.emit('action:tap', { x, y, pointerType: ptr.pointerType });
        if (ptr.pointerType !== 'mouse') this.persistTouchTooltip();
        this.lastTapTime = now;
        this.lastTapX = x;
        this.lastTapY = y;
      }
    }

    this.resetState();
  }

  private onPointerLeave(e: PointerEvent): void {
    // A finger lifting leaves the element too: a tap's tooltip persists (persistTouchTooltip).
    if (this.isTouchLike(e) && this.releaseTouchTooltip) return;
    // Suppress cursor-leave while a gesture is in flight, pointer capture
    // keeps the drag alive even when the pointer briefly leaves the canvas
    // bounds. Without this guard the crosshair/tooltip flickers mid-pan.
    // In readonly there is no active gesture to protect, and a mode flip to
    // readonly mid-gesture can strand a non-idle state with no pointerup to
    // clear it, so always allow the crosshair/tooltip to dismiss there.
    if (this.getMode() !== 'readonly' && this.state.kind !== 'idle') return;
    this.eventBus.emit('action:cursor-leave', undefined);
  }

  private onPointerCancel(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    try {
      this.target.releasePointerCapture(e.pointerId);
    } catch {}
    this.clearLongPress();
    this.momentum.cancel();

    // Cancel is terminal: drop every stranded pointer so the next touch starts
    // from a clean single-pointer state rather than being read as a pinch.
    const wasBox = this.state.kind === 'box';
    const wasActive = this.state.kind !== 'idle';
    this.pointers.clear();
    this.state = { kind: 'idle' };

    // Clear any in-progress selection/zoom box overlay (zero-area = cancel).
    if (wasBox) this.eventBus.emit('action:box-end', { x1: 0, y1: 0, x2: 0, y2: 0 });
    if (wasActive) this.eventBus.emit('action:cursor-leave', undefined);
  }

  private resetState(): void {
    if (this.pointers.size === 0) {
      this.state = { kind: 'idle' };
    }
  }

  // ─── Wheel (mouse scroll / trackpad pinch) ────────────────

  private onWheel(e: WheelEvent): void {
    const mode = this.getMode();
    if (mode === 'readonly') return;
    // A line- or page-mode notch zooms as much as a pixel-mode one (Firefox, some mice).
    const deltaY =
      e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;

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

        const factor = wheelFactor(deltaY, zoom.wheelStep);
        // Anchor and axis must agree: use the axis under the pointer now, not
        // the gesture-start axis. Crossing from one gutter into another within
        // the 200ms window would otherwise zoom the start axis anchored at a
        // pixel inside the other gutter (an off-plot anchor).
        const axis = area.axisKey!;

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

    // Without zoom, Ctrl+wheel is the page's (the browser zoom).
    if (!zoom.enabled) return;
    e.preventDefault();

    const factor = wheelFactor(deltaY, zoom.wheelStep);

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

  // ─── Keyboard (the key table in keyboard.ts) ──────────────

  /** Keyboard shortcuts while the chart container has focus; readonly charts take none. */
  private onKeyDown(e: KeyboardEvent): void {
    const mode = this.getMode();
    if (mode === 'readonly') return;

    // Ignore if the user is typing into an input/textarea that happens
    // to be nested inside a custom chart container (tooltip templates etc.).
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
      return;
    }

    // Only preventDefault when the chart will actually act, otherwise a focused
    // chart with pan/zoom disabled would silently swallow page-scroll keys.
    const handled = handleChartKey({
      event: e,
      bus: this.eventBus,
      layout: this.getLayout(),
      pan: this.getPanConfig(),
      zoom: this.getZoomConfig(),
      ...this.getKeyState(),
    });
    if (handled) e.preventDefault();
  }
}
