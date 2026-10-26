// The "Write an adapter (Vue, Svelte)" recipe of the docs page "Annotations, plugins and adapters"
// (plan §7.4, research-08), type-checked against a minimal reactive store: a value you can read
// and subscribe to, which is what Vue's watch, Svelte's stores and signals reduce to. No Vue or
// Svelte dependency. Type-checked by `npm run typecheck` (tsconfig.test.json); never run.
//
// The recipe is everything between the two rules; keep it in step with the docs page.
import type { ChartHandle, ChartOptions, ChartState, CursorSnapshot } from 'snaplot';
import { createChart } from 'snaplot';

/** A reactive value, reduced to what an adapter needs. */
interface Store<T> {
  get(): T;
  subscribe(listener: (value: T) => void): () => void;
}

// ─────────────────────────────────────────────────────────────────────
/** Mount a chart and give it every new snapshot of the options; the chart applies what changed. */
export function bindChart<Row>(element: HTMLElement, options: Store<ChartOptions<Row>>) {
  const chart = createChart<Row>(element, options.get());
  const stop = options.subscribe((next) => chart.setOptions(next));
  return {
    chart,
    destroy() {
      stop();
      chart.destroy();
    },
  };
}

/** A slice of the chart's state as a store: it tells its listeners only when the slice changes. */
export function chartState<T>(chart: ChartHandle<any>, select: (state: ChartState) => T): Store<T> {
  return {
    get: () => select(chart.getState()),
    subscribe(listener) {
      let last = select(chart.getState());
      return chart.subscribe(() => {
        const next = select(chart.getState());
        if (!Object.is(next, last)) listener((last = next));
      });
    },
  };
}

/** The values under the cursor (or at the latest point) as a store. */
export function chartCursor<Row>(chart: ChartHandle<Row>): Store<CursorSnapshot<Row>> {
  const read = () => chart.getCursor({ fallback: 'latest' });
  return {
    get: read,
    subscribe(listener) {
      const offs = [chart.on('cursor:change', listener), chart.subscribe(() => listener(read()))];
      return () => {
        for (const off of offs) off();
      };
    },
  };
}
// ─────────────────────────────────────────────────────────────────────

// Using it, as a Svelte store or a Vue ref would.
declare function writable<T>(value: T): Store<T> & { set(value: T): void };
declare const element: HTMLElement;
type Row = { t: number; cpu: number };

const options = writable<ChartOptions<Row>>({ data: [], x: 't', series: [{ y: 'cpu' }] });
const bound = bindChart(element, options);
options.set({ data: [{ t: 0, cpu: 41 }], x: 't', series: [{ y: 'cpu' }], viewport: {} });
export const following: Store<boolean> = chartState(bound.chart, (state) => state.following);
export const latest: Store<CursorSnapshot<Row>> = chartCursor(bound.chart);
export const cpu: number | undefined = latest.get().points[0]?.row?.cpu;

// The store carries the row type into the options.
// @ts-expect-error `time` is not a field of Row
writable<ChartOptions<Row>>({ data: [], x: 'time', series: [{ y: 'cpu' }] });
