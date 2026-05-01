import { createSignal, createEffect, on, onCleanup, untrack, type Accessor } from 'solid-js';
import { ChartCore } from '../core/Chart';
import type { ChartConfig, ChartInstance, ColumnarData } from '../types';

/**
 * createChart, lower-level reactive primitive for advanced use cases.
 *
 * Returns an accessor to the ChartInstance. The chart automatically
 * updates when data or config signals change.
 *
 * Usage:
 *   const [data, setData] = createSignal(myData);
 *   const [config] = createSignal(myConfig);
 *   let ref!: HTMLDivElement;
 *   const chart = createChart(() => ref, config, data);
 */
export function createChart<TMeta = unknown>(
  containerRef: Accessor<HTMLElement | undefined>,
  config: Accessor<ChartConfig<TMeta>>,
  data: Accessor<ColumnarData>,
): Accessor<ChartInstance | undefined> {
  const [chart, setChart] = createSignal<ChartInstance | undefined>();

  createEffect(() => {
    const el = containerRef();
    if (!el) return;

    // Chart construction should be keyed only by the container element.
    // Initial config/data are read untracked; later signal changes flow
    // through the dedicated setOptions/setData effects below.
    const instance = new ChartCore(el, untrack(config) as ChartConfig, untrack(data));
    setChart(instance as ChartInstance);

    onCleanup(() => {
      instance.destroy();
      setChart(undefined);
    });
  });

  // React to data changes
  createEffect(
    on(
      data,
      (d) => {
        chart()?.setData(d);
      },
      { defer: true },
    ),
  );

  // React to config changes
  createEffect(
    on(
      config,
      (c) => {
        chart()?.replaceOptions(c as ChartConfig);
      },
      { defer: true },
    ),
  );

  return chart;
}
