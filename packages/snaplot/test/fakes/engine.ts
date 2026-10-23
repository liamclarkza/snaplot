/**
 * Engine builder for the engine-*.test.ts integration tests (plan M2).
 *
 * It constructs the internal engine the way createChart does: through
 * `sources` (one shared source unless the test passes several), on a sized
 * jsdom host with the shared fakes installed. Tests then drive the engine only
 * through its methods and its DOM, the way a user does: pointer, wheel and key
 * events on the elements it creates. They never read or write private fields,
 * so they survive the engine moves of M9a and M9b.
 *
 *   const fakes = installEngineFakes();
 *   const chart = fakes.engine({ series: [{ label: 'v', dataIndex: 1 }] }, [f([1, 2]), f([3, 4])]);
 *   hoverAt(chart, plotPoint(chart));
 *   fakes.uninstall(); // destroys every engine it built, then restores the globals
 */
import { ChartCore, type DebugSnapshot } from '../../src/core/Chart';
import type { ChartConfig, ColumnarData } from '../../src/types';
import { type FakeOptions, type Fakes, installFakes, type MountOptions } from './index';

/** A Float64Array column from plain numbers. */
export const f = (values: number[]): Float64Array => Float64Array.from(values);

/** Several independent sources and the source each series reads. */
export interface EngineSources {
  sources: readonly ColumnarData[];
  seriesSources: readonly number[];
}

export interface EngineFakes extends Fakes {
  /**
   * Build an engine on a new host in `document.body` (default 600 × 400, the
   * size the original suite measured against). `data` is one source shared by
   * every series, or explicit `{ sources, seriesSources }`. The config object
   * is passed through unchanged, so tests can check it is not mutated.
   */
  engine(config: ChartConfig, data: ColumnarData | EngineSources, size?: MountOptions): ChartCore;
}

export function installEngineFakes(options: FakeOptions = {}): EngineFakes {
  const fakes = installFakes(options);
  const engines: ChartCore[] = [];
  return {
    ...fakes,
    engine(config, data, size = {}) {
      const host = document.createElement('div');
      fakes.layout.setSize(host, size.width ?? 600, size.height ?? 400);
      document.body.append(host);
      const sources: EngineSources = isSources(data)
        ? data
        : { sources: [data], seriesSources: config.series.map(() => 0) };
      const chart = new ChartCore(host, config, sources);
      engines.push(chart);
      return chart;
    },
    uninstall() {
      for (const chart of engines.splice(0)) chart.destroy();
      fakes.uninstall();
    },
  };
}

function isSources(data: ColumnarData | EngineSources): data is EngineSources {
  return !Array.isArray(data);
}

/** Replace every source with one shared source, keeping `config`. */
export function replaceData(chart: ChartCore, config: ChartConfig, data: ColumnarData): void {
  chart.replaceSources(
    config,
    [data],
    config.series.map(() => 0),
  );
}

/** The D31 debug counters (the same snapshot createChart exposes on its handle). */
export function engineDebug(chart: ChartCore): DebugSnapshot {
  return chart.debugSnapshot();
}

// ─── The engine's DOM ──────────────────────────────────────────

/** The element the engine creates inside its host: keyboard focus target and coordinate origin. */
export function engineRoot(chart: ChartCore): HTMLElement {
  const root = chart.container.firstElementChild;
  if (!(root instanceof HTMLElement))
    throw new Error('engineRoot(): the engine has no root element');
  return root;
}

/** The transparent element that receives pointer and wheel input. */
export function inputLayer(chart: ChartCore): HTMLElement {
  const layer = [...engineRoot(chart).querySelectorAll<HTMLElement>('div')].find(
    (element) => element.style.pointerEvents === 'auto',
  );
  if (!layer) throw new Error('inputLayer(): the engine has no input layer');
  return layer;
}

export interface Point {
  x: number;
  y: number;
}

/** A point inside the plot, at `xFraction` of its width and half its height. */
export function plotPoint(chart: ChartCore, xFraction = 0.5): Point {
  const { plot } = chart.getLayout();
  return { x: plot.left + plot.width * xFraction, y: plot.top + plot.height / 2 };
}

/** The pixel of a data point on two axes. */
export function dataPoint(
  chart: ChartCore,
  x: number,
  y: number,
  axes = { x: 'x', y: 'y' },
): Point {
  const xScale = chart.getAxis(axes.x);
  const yScale = chart.getAxis(axes.y);
  if (!xScale || !yScale) throw new Error('dataPoint(): unknown axis');
  return { x: xScale.dataToPixel(x), y: yScale.dataToPixel(y) };
}

// ─── Input (the host sits at the client origin, so client = local pixels) ───

type PointerKind = 'mouse' | 'touch' | 'pen';

interface PointerOptions {
  pointerType?: PointerKind;
  pointerId?: number;
  shiftKey?: boolean;
}

/** Dispatch one pointer event on the input layer at a local pixel. */
export function pointer(
  chart: ChartCore,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointerleave',
  at: Point,
  { pointerType = 'mouse', pointerId = 1, shiftKey = false }: PointerOptions = {},
): void {
  inputLayer(chart).dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: at.x,
      clientY: at.y,
      button: 0,
      pointerId,
      pointerType,
      shiftKey,
    }),
  );
}

/** Move a pointer with no button pressed (mouse hover, or a hovering pen). */
export function hoverAt(chart: ChartCore, at: Point, pointerType: PointerKind = 'mouse'): void {
  pointer(chart, 'pointermove', at, { pointerType });
}

/** The pointer leaves the input layer. */
export function leave(chart: ChartCore): void {
  pointer(chart, 'pointerleave', { x: 0, y: 0 });
}

/** Press and release in place: a tap or a click. */
export function tapAt(chart: ChartCore, at: Point, pointerType: PointerKind = 'mouse'): void {
  pointer(chart, 'pointerdown', at, { pointerType });
  pointer(chart, 'pointerup', at, { pointerType });
}

/** Press at `from` and move to `to` without releasing (a drag in progress). */
export function dragStart(chart: ChartCore, from: Point, to: Point, options: PointerOptions = {}) {
  pointer(chart, 'pointerdown', from, options);
  pointer(chart, 'pointermove', to, options);
}

/** A complete drag: press at `from`, move to `to`, release there. */
export function drag(chart: ChartCore, from: Point, to: Point, options: PointerOptions = {}): void {
  dragStart(chart, from, to, options);
  pointer(chart, 'pointerup', to, options);
}

/**
 * Two touch points spread (or pinched) symmetrically about `center`, from
 * `fromDistance` to `toDistance` apart horizontally: each finger moves once.
 */
export function pinch(chart: ChartCore, center: Point, fromDistance: number, toDistance: number) {
  const at = (id: 1 | 2, distance: number): Point => ({
    x: center.x + (id === 1 ? -distance : distance) / 2,
    y: center.y,
  });
  const touch = (id: 1 | 2) => ({ pointerType: 'touch' as const, pointerId: id });
  pointer(chart, 'pointerdown', at(1, fromDistance), touch(1));
  pointer(chart, 'pointerdown', at(2, fromDistance), touch(2));
  pointer(chart, 'pointermove', at(1, toDistance), touch(1));
  pointer(chart, 'pointermove', at(2, toDistance), touch(2));
  pointer(chart, 'pointerup', at(1, toDistance), touch(1));
  pointer(chart, 'pointerup', at(2, toDistance), touch(2));
}

/**
 * One wheel event at a local pixel. `ctrlKey` is the trackpad pinch (zooms the
 * plot); a plain wheel zooms only when it starts over an axis with `zoom.axis`.
 * With `zoom.wheelStep: 1`, `deltaY: -20` zooms in by exactly 2× and `20` out by 2×.
 */
export function wheelAt(
  chart: ChartCore,
  at: Point,
  { deltaY, ctrlKey = false }: { deltaY: number; ctrlKey?: boolean },
): void {
  inputLayer(chart).dispatchEvent(
    new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: at.x,
      clientY: at.y,
      deltaY,
      ctrlKey,
    }),
  );
}

/**
 * One key press on the focused chart: `+` zooms in 1.2× at the plot centre,
 * `ArrowLeft` pans 40 px, `0` resets.
 */
export function press(chart: ChartCore, key: string): void {
  engineRoot(chart).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
}

// ─── What the engine painted ───────────────────────────────────

/** The tick labels of one axis in the last grid paint, as numbers. */
export function tickValues(chart: ChartCore, axis = 'x'): number[] {
  return engineDebug(chart)
    .labelBoxes()
    .filter((box) => box.axis === axis && box.kind === 'tick')
    .map((box) => Number(box.text));
}

/**
 * Pixels of the bottom axis tick marks in the last grid paint: one per slot
 * boundary on a planned bar axis, one per label elsewhere.
 */
export function bottomTickMarks(fakes: Fakes, chart: ChartCore, length = 4): number[] {
  const calls = fakes.canvas.of(engineDebug(chart).layers.grid).calls;
  const paint = calls.slice(calls.map((call) => call.name).lastIndexOf('clearRect'));
  const { plot } = chart.getLayout();
  const edge = Math.round(plot.top + plot.height) + (chart.getLayout().dpr === 1 ? 0.5 : 0);
  const marks: number[] = [];
  for (let i = 0; i + 1 < paint.length; i++) {
    const [move, line] = [paint[i], paint[i + 1]];
    if (move.name !== 'moveTo' || line.name !== 'lineTo') continue;
    if (move.args[1] === edge && line.args[1] === edge + length && move.args[0] === line.args[0])
      marks.push(move.args[0] as number);
  }
  return marks;
}

/** The pixel a tick mark or gridline at `value` lands on (1 px strokes at DPR 1). */
export function crispPixel(chart: ChartCore, value: number, axis = 'x'): number {
  const scale = chart.getAxis(axis);
  if (!scale) throw new Error('crispPixel(): unknown axis');
  return Math.round(scale.dataToPixel(value)) + (chart.getLayout().dpr === 1 ? 0.5 : 0);
}
