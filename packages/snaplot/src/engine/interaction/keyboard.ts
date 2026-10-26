/**
 * Keyboard shortcuts as a key → action table (plan §3.1): what each key emits on the gesture bus
 * while the chart container has focus. The GestureManager listens and calls `handleChartKey`; M12a
 * adds the keyboard cursor and the live region here.
 *
 *   ArrowLeft / ArrowRight   pan X by PAN_STEP
 *   ArrowUp / ArrowDown      pan Y by PAN_STEP (if pan.y is enabled)
 *   Shift + Arrow            a larger step (PAN_STEP_FAST)
 *   `+` / `=`                zoom in at the plot centre
 *   `-` / `_`                zoom out at the plot centre
 *   `0` / `Home`             reset zoom
 */
import type { Layout, PanConfig, ZoomConfig } from '../spec';
import type { EventBus } from './bus';

const PAN_STEP = 40;
const PAN_STEP_FAST = 120;
/** 20% per key press, matching the wheel's feel. */
const ZOOM_FACTOR = 1.2;

/** What a key binding reads: the key event and the chart's layout, pan and zoom options. */
export interface KeyContext {
  readonly event: KeyboardEvent;
  readonly bus: EventBus;
  readonly layout: Layout;
  readonly pan: PanConfig;
  readonly zoom: ZoomConfig;
}

/**
 * A key binding emits its action and returns true, or returns false when the chart would not act
 * (pan or zoom disabled), so the key keeps its default (page scrolling). The guards mirror the
 * engine's own (pan.enabled / pan.x / pan.y and zoom.enabled), so the two never disagree.
 */
type KeyBinding = (context: KeyContext) => boolean;

const step = (event: KeyboardEvent) => (event.shiftKey ? PAN_STEP_FAST : PAN_STEP);

const panX =
  (sign: 1 | -1): KeyBinding =>
  ({ event, bus, pan }) => {
    if (!pan.enabled || pan.x === false) return false;
    bus.emit('action:pan', { dx: sign * step(event), dy: 0 });
    return true;
  };

const panY =
  (sign: 1 | -1): KeyBinding =>
  ({ event, bus, pan }) => {
    if (!pan.enabled || !pan.y) return false;
    bus.emit('action:pan', { dx: 0, dy: sign * step(event) });
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

/** Reset always acts (the engine's resetZoom has no enable guard). */
const resetZoom: KeyBinding = ({ bus }) => {
  bus.emit('action:reset-zoom', undefined);
  return true;
};

const zoomIn = zoomBy(1 / ZOOM_FACTOR);
const zoomOut = zoomBy(ZOOM_FACTOR);

/** The key table, by `KeyboardEvent.key`. */
export const KEY_BINDINGS: ReadonlyMap<string, KeyBinding> = new Map([
  ['ArrowLeft', panX(1)],
  ['ArrowRight', panX(-1)],
  ['ArrowUp', panY(1)],
  ['ArrowDown', panY(-1)],
  ['+', zoomIn],
  ['=', zoomIn],
  ['-', zoomOut],
  ['_', zoomOut],
  ['0', resetZoom],
  ['Home', resetZoom],
]);

/**
 * Run the binding of the event's key. Returns whether the chart acted, in which case the caller
 * prevents the key's default.
 */
export function handleChartKey(context: KeyContext): boolean {
  const binding = KEY_BINDINGS.get(context.event.key);
  return binding ? binding(context) : false;
}
