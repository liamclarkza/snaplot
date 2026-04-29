import { onMount, onCleanup, createEffect, on } from 'solid-js';
import type { JSX } from 'solid-js';
import { ChartCore } from '../core/Chart';
import type { ChartConfig, ChartInstance, ColumnarData } from '../types';

export interface ChartProps<TMeta = unknown> {
  /** Chart configuration */
  config: ChartConfig<TMeta>;
  /** Columnar data (reactive, chart updates automatically when this changes) */
  data: ColumnarData;
  /** CSS class for the container div */
  class?: string;
  /** Inline styles for the container div */
  style?: string | Record<string, string>;
  /** Callback when chart instance is ready */
  onReady?: (chart: ChartInstance) => void;
}

/**
 * <Chart>, the SolidJS component wrapper for snaplot.
 *
 * Fine-grained reactivity: signal changes → targeted canvas layer updates.
 * No virtual DOM diffing.
 */
export function Chart<TMeta = unknown>(props: ChartProps<TMeta>): JSX.Element {
  let containerRef!: HTMLDivElement;
  let chart: ChartCore | undefined;

  onMount(() => {
    chart = new ChartCore(containerRef, props.config as ChartConfig, props.data);
    props.onReady?.(chart);

    createEffect(
      on(
        () => props.data,
        (data) => { chart?.setData(data); },
        { defer: true },
      ),
    );

    createEffect(
      on(
        () => props.config,
        (config) => { chart?.setOptions(config as ChartConfig); },
        { defer: true },
      ),
    );
  });

  onCleanup(() => { chart?.destroy(); });

  return (
    <div
      ref={containerRef!}
      class={props.class}
      style={typeof props.style === 'string'
        ? props.style + ';width:100%;height:100%'
        : { width: '100%', height: '100%', ...props.style }
      }
    />
  );
}
