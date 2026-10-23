import { onMount, onCleanup, createEffect, type JSX } from 'solid-js';
import { createChart, reconcileChart, setChartControls } from '../api/createChart';
import type { ChartOptions, ChartHandle } from '../api/types';
import { applyDefaults, chartOptions, chartControls, type ChartControls } from '../react/shared';
export interface ChartProps<Row = Record<string, unknown>>
  extends ChartOptions<Row>,
    ChartControls {
  class?: string;
  style?: string | JSX.CSSProperties;
  ref?: (chart: ChartHandle<Row> | undefined) => void;
  onReady?: (chart: ChartHandle<Row>) => void;
}
export function Chart<Row = Record<string, unknown>>(props: ChartProps<Row>): JSX.Element {
  let host!: HTMLDivElement;
  onMount(() => {
    const chart = createChart(host, chartOptions(props));
    setChartControls(chart, chartControls(props));
    applyDefaults(chart, props);
    props.onReady?.(chart);
    createEffect(() => {
      const ref = props.ref;
      ref?.(chart);
      onCleanup(() => ref?.(undefined));
    });
    createEffect(() => {
      reconcileChart(chart, chartOptions(props), chartControls(props));
    });
    onCleanup(() => chart.destroy());
  });
  return (
    <div
      ref={host!}
      class={props.class}
      role="group"
      aria-label={props['aria-label'] ?? props.ariaLabel ?? 'Chart'}
      aria-describedby={props['aria-describedby']}
      aria-labelledby={props['aria-labelledby']}
      style={
        typeof props.style === 'string'
          ? 'width:100%;height:100%;' + props.style
          : { width: '100%', height: '100%', ...props.style }
      }
    />
  );
}
