import { createSignal, createEffect, on, onCleanup, type Accessor } from 'solid-js';
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
export function createChart(
  containerRef: Accessor<HTMLElement | undefined>,
  config: Accessor<ChartConfig>,
  data: Accessor<ColumnarData>,
): Accessor<ChartInstance | undefined> {
  const [chart, setChart] = createSignal<ChartInstance | undefined>();

  createEffect(() => {
    const el = containerRef();
    if (!el) return;

    const instance = new ChartCore(el, config(), data());
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
        chart()?.setOptions(c);
      },
      { defer: true },
    ),
  );

  return chart;
}
