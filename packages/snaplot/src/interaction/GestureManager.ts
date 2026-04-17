import type { InteractionMode, Layout, ZoomConfig } from '../types';
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

  // Pinch state — just the distance; the centre point is recomputed each
  // move because it depends on both pointer positions.
  private lastPinchDist = 0;

  // Pan drag start
  private dragStartX = 0;
  private dragStartY = 0;

  // Pan velocity tracking (touch-only momentum).
  // EMA velocity in px/ms, sampled during touch pan. `lastMoveTime` anchors
  // the sample interval; the pointer positions live on the PointerState map.
  private lastMoveTime = 0;
  private velocityX = 0;
  private velocityY = 0;
  private momentumFrame: number | null = null;
  private momentumAxis: string | undefined;

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
  private boundKeyDown: (e: KeyboardEvent) => void;
  /** Element that receives keyboard focus (chart container with tabindex=0). */
  private keyboardTarget: HTMLElement | null = null;

  constructor(
    private target: HTMLElement,
    private eventBus: EventBus,
    private getMode: () => InteractionMode,
    private getLayout: () => Layout,
    private getZoomConfig: () => ZoomConfig,
    longPressMs?: number,
  ) {
    this.longPressMs = longPressMs ?? DEFAULT_LONG_PRESS_MS;

    this.boundPointerDown = this.onPointerDown.bind(this);
    this.boundPointerMove = this.onPointerMove.bind(this);
    this.boundPointerUp = this.onPointerUp.bind(this);
    this.boundPointerLeave = this.onPointerLeave.bind(this);
    this.boundWheel = this.onWheel.bind(this);
    this.boundDblClick = this.onDblClick.bind(this);
    this.boundKeyDown = this.onKeyDown.bind(this);
  }

  attach(): void {
    this.updateTouchAction();
    this.target.addEventListener('pointerdown', this.boundPointerDown);
    this.target.addEventListener('pointermove', this.boundPointerMove);
    this.target.addEventListener('pointerup', this.boundPointerUp);
    this.target.addEventListener('pointerleave', this.boundPointerLeave);
    this.target.addEventListener('wheel', this.boundWheel, { passive: false });
    this.target.addEventListener('dblclick', this.boundDblClick);

    // Keyboard events bubble up from the focused element, so attach to the
    // focusable container (the CanvasManager's tabindex=0 parent of dataCanvas).
    // Walking the parent chain keeps GestureManager's constructor signature
    // stable — callers don't need to pass both targets separately.
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

    // Cancel any in-flight pan momentum — grabbing the chart stops the glide.
    this.cancelMomentum();

    const { x, y } = this.localCoords(e);
    const area = this.getAxisArea(x, y);
    if (area.type === 'outside') return;

    this.dragStartArea = area;
    // setPointerCapture can throw when the UA has already retargeted the
    // pointer (e.g. fast multi-touch under iOS, or synthetic events). Keep
    // going either way — capture is an optimisation, not a correctness
    // requirement for our state machine.
    try { this.target.setPointerCapture(e.pointerId); } catch {}

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

    // Reset pan-velocity sampler; first move will populate it.
    this.lastMoveTime = performance.now();
    this.velocityX = 0;
    this.velocityY = 0;
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
        const dxPan = x - prevX;
        const dyPan = y - prevY;
        this.eventBus.emit('action:pan', { dx: dxPan, dy: dyPan, axis: panAxis });
        this.dragStartX = x;
        this.dragStartY = y;

        // Sample pan velocity for touch momentum (EMA).
        if (e.pointerType === 'touch') {
          const now = performance.now();
          const dt = Math.max(1, now - this.lastMoveTime);
          const instVX = dxPan / dt;
          const instVY = dyPan / dt;
          // α = 0.5 — fast to react, stable enough against jitter.
          const a = 0.5;
          this.velocityX = a * instVX + (1 - a) * this.velocityX;
          this.velocityY = a * instVY + (1 - a) * this.velocityY;
          this.lastMoveTime = now;
          this.momentumAxis = panAxis;
        }

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
        // Rebase pan state on the surviving finger's current position.
        // Without this, `dragStartX/Y` still reflect the original (now-lifted)
        // finger's down-position and the next pan emits a huge first-frame
        // delta (pinch-to-drag jump bug).
        const survivor = this.pointers.values().next().value;
        if (survivor) {
          this.dragStartX = survivor.x;
          this.dragStartY = survivor.y;
          this.lastMoveTime = performance.now();
          this.velocityX = 0;
          this.velocityY = 0;
        }
      }
    }

    // ── Touch pan released: start momentum if the flick was fast enough ──
    if (
      ptr.pointerType === 'touch' &&
      this.state === 'dragging' &&
      this.pointers.size === 0
    ) {
      this.startMomentum();
    }

    this.resetState();
  }

  private onPointerLeave(_e: PointerEvent): void {
    // Suppress cursor-leave while a gesture is in flight — pointer capture
    // keeps the drag alive even when the pointer briefly leaves the canvas
    // bounds. Without this guard the crosshair/tooltip flickers mid-pan.
    if (this.state !== 'idle') return;
    this.eventBus.emit('action:cursor-leave', undefined);
  }

  private resetState(): void {
    if (this.pointers.size === 0) {
      this.state = 'idle';
      this.boxStartX = 0;
      this.boxStartY = 0;
    }
  }

  // ─── Pan momentum (touch only) ────────────────────────────

  private startMomentum(): void {
    // Threshold of 0.1 px/ms ≈ 100 px/s — below this it's just a static release.
    const vMag = Math.hypot(this.velocityX, this.velocityY);
    if (vMag < 0.1) return;

    // Cap peak velocity so a jittery last sample can't launch the chart.
    const MAX_V = 2.5; // px/ms ≈ 2500 px/s
    if (vMag > MAX_V) {
      const s = MAX_V / vMag;
      this.velocityX *= s;
      this.velocityY *= s;
    }

    let lastT = performance.now();
    const step = (now: number) => {
      const dt = Math.min(32, now - lastT); // clamp frame to avoid teleporting after tab blur
      lastT = now;

      const dx = this.velocityX * dt;
      const dy = this.velocityY * dt;
      this.eventBus.emit('action:pan', { dx, dy, axis: this.momentumAxis });

      // Exponential decay — halves roughly every ~130ms.
      const decay = Math.exp(-dt / 180);
      this.velocityX *= decay;
      this.velocityY *= decay;

      if (Math.hypot(this.velocityX, this.velocityY) < 0.02) {
        this.momentumFrame = null;
        return;
      }
      this.momentumFrame = requestAnimationFrame(step);
    };
    this.momentumFrame = requestAnimationFrame(step);
  }

  private cancelMomentum(): void {
    if (this.momentumFrame !== null) {
      cancelAnimationFrame(this.momentumFrame);
      this.momentumFrame = null;
    }
    this.velocityX = 0;
    this.velocityY = 0;
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

        // Magnitude only — we always zoom out on deltaY > 0 and in on
        // deltaY < 0. Using `sensitivity - 1` directly inverted the
        // direction for `wheelFactor < 1`.
        const strength = Math.abs((zoom.wheelFactor ?? DEFAULT_WHEEL_FACTOR) - 1);
        const delta = Math.min(Math.abs(e.deltaY), 20) * 0.005;
        const factor = e.deltaY > 0 ? 1 + delta * strength * 10 : 1 / (1 + delta * strength * 10);
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

    const strength = Math.abs((zoom.wheelFactor ?? DEFAULT_WHEEL_FACTOR) - 1);
    const delta = Math.min(Math.abs(e.deltaY), 20) * 0.005;
    const factor = e.deltaY > 0 ? 1 + delta * strength * 10 : 1 / (1 + delta * strength * 10);

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

  // ─── Keyboard (arrow keys, +/-, 0) ─────────────────────────

  /**
   * Keyboard shortcuts for keyboard-only users. Active while the chart
   * container has focus.
   *
   *   ArrowLeft / ArrowRight   — pan X by PAN_STEP
   *   ArrowUp / ArrowDown      — pan Y by PAN_STEP (if pan.y enabled)
   *   Shift + Arrow            — larger step (PAN_STEP_FAST)
   *   `+` / `=`                — zoom in at the chart centre
   *   `-` / `_`                — zoom out at the chart centre
   *   `0` / `Home`             — reset zoom
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
    const ZOOM_FACTOR = 1.2; // 20% per key press — matches wheel feel
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
