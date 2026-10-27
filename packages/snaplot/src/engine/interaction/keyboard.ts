/**
 * Keyboard shortcuts as a key → action table (plan §3.1, D20): what each key emits on the gesture
 * bus while the chart has focus. The GestureManager listens and calls `handleChartKey`.
 *
 *   ArrowLeft / ArrowRight   move the cursor to the previous or next point
 *   Home / End               the first or last point, once the cursor is on the chart
 *   Shift + ArrowLeft/Right  pan X
 *   ArrowUp / ArrowDown      pan Y (if pan.y is enabled)
 *   `+` / `=`                zoom in at the plot centre
 *   `-` / `_`                zoom out at the plot centre
 *   `0`                      reset zoom
 *   Escape                   clear the selection and hide the tooltip
 *
 * Ctrl, ⌘ and Alt combinations always reach the browser.
 */
import type { Layout, PanConfig, ZoomConfig } from '../spec';
import type { EventBus } from './bus';

const PAN_STEP = 40;
const PAN_STEP_FAST = 120;
/** 20% per key press, matching the wheel's feel. */
const ZOOM_FACTOR = 1.2;

/** What a key binding reads: the key event and the chart's layout, pan, zoom and state. */
export interface KeyContext {
  readonly event: KeyboardEvent;
  readonly bus: EventBus;
  readonly layout: Layout;
  readonly pan: PanConfig;
  readonly zoom: ZoomConfig;
  /** The cursor is on the chart (a hover or a key put it there). */
  readonly cursorActive: boolean;
  /** A brush or box selection is shown. */
  readonly selectionActive: boolean;
}

/**
 * A key binding emits its action and returns true, or returns false when the chart would not act
 * (pan or zoom disabled), so the key keeps its default (page scrolling). The guards mirror the
 * engine's own (pan.enabled / pan.x / pan.y and zoom.enabled), so the two never disagree.
 */
type KeyBinding = (context: KeyContext) => boolean;

const panX =
  (sign: 1 | -1): KeyBinding =>
  ({ bus, pan }) => {
    if (!pan.enabled || pan.x === false) return false;
    bus.emit('action:pan', { dx: sign * PAN_STEP_FAST, dy: 0 });
    return true;
  };

const panY =
  (sign: 1 | -1): KeyBinding =>
  ({ event, bus, pan }) => {
    if (!pan.enabled || !pan.y) return false;
    bus.emit('action:pan', { dx: 0, dy: sign * (event.shiftKey ? PAN_STEP_FAST : PAN_STEP) });
    return true;
  };

/** An arrow moves the cursor point by point; with Shift it pans. */
const arrow =
  (to: 'prev' | 'next'): KeyBinding =>
  (context) => {
    if (context.event.shiftKey) return panX(to === 'prev' ? 1 : -1)(context);
    context.bus.emit('action:step-cursor', { to });
    return true;
  };

/** Home and End jump to the ends once the cursor is on the chart; before that they scroll. */
const end =
  (to: 'first' | 'last'): KeyBinding =>
  ({ bus, cursorActive }) => {
    if (!cursorActive) return false;
    bus.emit('action:step-cursor', { to });
    return true;
  };

const zoomBy =
  (factor: number): KeyBinding =>
  ({ bus, layout, zoom }) => {
    if (!zoom.enabled) return false;
    const axis = zoom.x && !zoom.y ? 'x' : !zoom.x && zoom.y ? 'y' : 'xy';
    bus.emit('action:zoom', {
      factor,
      anchorX: layout.plot.left + layout.plot.width / 2,
      anchorY: layout.plot.top + layout.plot.height / 2,
      axis,
    });
    return true;
  };

const resetZoom: KeyBinding = ({ bus, zoom, pan }) => {
  if (!zoom.enabled && !pan.enabled) return false;
  bus.emit('action:reset-zoom', undefined);
  return true;
};

const clearShown: KeyBinding = ({ bus, cursorActive, selectionActive }) => {
  if (!cursorActive && !selectionActive) return false;
  bus.emit('action:escape', undefined);
  return true;
};

const zoomIn = zoomBy(1 / ZOOM_FACTOR);
const zoomOut = zoomBy(ZOOM_FACTOR);

/** The key table, by `KeyboardEvent.key`. */
export const KEY_BINDINGS: ReadonlyMap<string, KeyBinding> = new Map([
  ['ArrowLeft', arrow('prev')],
  ['ArrowRight', arrow('next')],
  ['Home', end('first')],
  ['End', end('last')],
  ['ArrowUp', panY(1)],
  ['ArrowDown', panY(-1)],
  ['+', zoomIn],
  ['=', zoomIn],
  ['-', zoomOut],
  ['_', zoomOut],
  ['0', resetZoom],
  ['Escape', clearShown],
]);

/**
 * Run the binding of the event's key. Returns whether the chart acted, in which case the caller
 * prevents the key's default. A Ctrl, ⌘ or Alt combination is the browser's.
 */
export function handleChartKey(context: KeyContext): boolean {
  const { event } = context;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const binding = KEY_BINDINGS.get(event.key);
  return binding ? binding(context) : false;
}
