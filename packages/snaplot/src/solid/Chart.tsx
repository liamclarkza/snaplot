import { createEffect, type JSX, onCleanup, onMount } from 'solid-js';
import { createChart } from '../public/chart';
import type { ChartHandle, ChartOptions } from '../public/types';
import { type HostAttributes, splitProps } from '../react/shared';

/** The props of {@link Chart}: the chart's options, plus the host element's attributes. */
export interface ChartProps<Row = Record<string, any>> extends ChartOptions<Row>, HostAttributes {
  /** Class names of the host element. @defaultValue none */
  class?: string;
  /** Inline styles of the host element. @defaultValue full width and height */
  style?: string | JSX.CSSProperties;
  /** Receives the chart handle, and `undefined` on cleanup. */
  ref?: (chart: ChartHandle<Row> | undefined) => void;
}

/**
 * A chart. Its props are the same options `createChart` takes, applied with `setOptions` when
 * they change, so inline objects and callbacks cost only what they change.
 */
export function Chart<Row = Record<string, any>>(props: ChartProps<Row>): JSX.Element {
  let host!: HTMLDivElement;
  onMount(() => {
    const chart = createChart(host, splitProps<Row>(props).options);
    createEffect(() => {
      const ref = props.ref;
      ref?.(chart);
      onCleanup(() => ref?.(undefined));
    });
    createEffect(() => chart.setOptions(splitProps<Row>(props).options));
    onCleanup(() => chart.destroy());
  });
  return (
    <div
      ref={host!}
      {...splitProps(props).attributes}
      class={props.class}
      role="group"
      aria-label={props['aria-label'] ?? props.ariaLabel ?? 'Chart'}
      style={
        typeof props.style === 'string'
          ? 'width:100%;height:100%;' + props.style
          : { width: '100%', height: '100%', ...props.style }
      }
    />
  );
}
