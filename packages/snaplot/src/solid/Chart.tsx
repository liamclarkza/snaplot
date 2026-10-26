import { createEffect, type JSX, onCleanup, onMount, type Ref, splitProps } from 'solid-js';
import type { ChartHandle, ChartOptions } from 'snaplot';
import { accessibleName, bindChart, cssHeight, OPTION_KEYS } from '../adapters/bind';

/**
 * Attributes of the host element that a chart component passes through, with any `data-*`
 * attribute (JSX accepts those on components without declaring them).
 */
export interface HostAttributes
  extends Omit<
    JSX.HTMLAttributes<HTMLDivElement>,
    'ref' | 'children' | 'style' | 'innerHTML' | 'innerText' | 'textContent' | keyof ChartOptions
  > {
  /** The host element's id. @defaultValue none */
  id?: string;
  /** The host's accessible name. @defaultValue `ariaLabel`, else a summary of the series */
  'aria-label'?: string;
  /** Ids of elements that describe the chart. @defaultValue none */
  'aria-describedby'?: string;
  /** Ids of elements that name the chart. @defaultValue none */
  'aria-labelledby'?: string;
}

/** The props of {@link Chart}: the chart's options, plus the host element's attributes. */
export interface ChartProps<Row = Record<string, any>> extends ChartOptions<Row>, HostAttributes {
  /** Class names of the host element. @defaultValue none */
  class?: string;
  /** Inline styles of the host element. @defaultValue full width and height */
  style?: string | JSX.CSSProperties;
  /** Receives the chart handle, and `undefined` on cleanup. */
  ref?: Ref<ChartHandle<Row> | undefined>;
}

/**
 * A chart. Its props are the same options `createChart` takes, applied with `setOptions` when
 * they change, so inline objects and callbacks cost only what they change.
 */
export function Chart<Row = Record<string, any>>(props: ChartProps<Row>): JSX.Element {
  let host!: HTMLDivElement;
  const [options, own, attributes] = splitProps(props, OPTION_KEYS, ['ref', 'style']);
  const read = () => ({ ...options }) as ChartOptions<Row>;
  onMount(() => {
    const binding = bindChart<Row>(host, read());
    // A variable ref compiles to a function too.
    const ref = own.ref as ((chart: ChartHandle<Row> | undefined) => void) | undefined;
    ref?.(binding.chart);
    createEffect(() => binding.update(read()));
    onCleanup(() => {
      ref?.(undefined);
      binding.destroy();
    });
  });
  const style = (): JSX.CSSProperties | string => {
    const height = cssHeight(options.height);
    if (typeof own.style === 'string')
      return `width:100%;height:100%;${own.style}${height ? `;height:${height}` : ''}`;
    return { width: '100%', height: '100%', ...own.style, ...(height ? { height } : {}) };
  };
  return (
    <div
      ref={host}
      role="figure"
      aria-label={accessibleName(options)}
      {...attributes}
      style={style()}
    />
  );
}
