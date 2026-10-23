import { createSignal, createEffect, onCleanup, untrack, type Accessor } from 'solid-js';
import { createChart as createCoreChart, reconcileChart } from '../api/createChart';
import type { ChartOptions, ChartHandle } from '../public/types';
/** Own a chart for a reactive host and a complete reactive options snapshot. */
export function createChart<Row>(
  container: Accessor<HTMLElement | undefined>,
  options: Accessor<ChartOptions<Row>>,
): Accessor<ChartHandle<Row> | undefined> {
  const [chart, setChart] = createSignal<ChartHandle<Row>>();
  createEffect(() => {
    const el = container();
    if (!el) return;
    const instance = createCoreChart(el, untrack(options));
    setChart(() => instance);
    onCleanup(() => {
      instance.destroy();
      setChart(undefined);
    });
  });
  createEffect(() => {
    const value = options();
    const instance = chart();
    if (instance) reconcileChart(instance, value);
  });
  return chart;
}
