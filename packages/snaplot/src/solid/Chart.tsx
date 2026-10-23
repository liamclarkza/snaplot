import { onMount, onCleanup, createEffect, type JSX } from 'solid-js';
import { createChart, reconcileChart, setChartControls } from '../public/chart';
import type { ChartOptions, ChartHandle } from '../public/types';
import {
  applyDefaults,
  chartOptions,
  chartControls,
  type ChartControls,
  type ControlledOptionKeys,
} from '../react/shared';
export interface ChartProps<Row = Record<string, any>>
  extends Omit<ChartOptions<Row>, ControlledOptionKeys>,
    ChartControls {
  /** Class names of the host element. @defaultValue none */
  class?: string;
  /** Inline styles of the host element. @defaultValue full width and height */
  style?: string | JSX.CSSProperties;
  /** Receives the chart handle, and `undefined` on cleanup. */
  ref?: (chart: ChartHandle<Row> | undefined) => void;
  /** Called once with the chart handle after mount. */
  onReady?: (chart: ChartHandle<Row>) => void;
}
/** A chart. Its props are the {@link ChartOptions} plus the host's attributes. */
export function Chart<Row = Record<string, any>>(props: ChartProps<Row>): JSX.Element {
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
