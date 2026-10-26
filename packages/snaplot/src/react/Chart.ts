import type { CSSProperties, HTMLAttributes, ReactElement, Ref } from 'react';
import { createElement, forwardRef, useRef } from 'react';
import type { ChartHandle, ChartOptions } from 'snaplot';
import type { Binding } from '../adapters/bind';
import { attachRef, bindChart, cssHeight, hostDefaults, splitProps } from '../adapters/bind';
import { useIsoLayoutEffect } from './hooks';

/**
 * Attributes of the host element that a chart component passes through, with any `data-*`
 * attribute (JSX accepts those on components without declaring them).
 */
export interface HostAttributes
  extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'children' | 'dangerouslySetInnerHTML' | keyof ChartOptions
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
  className?: string;
  /** Inline styles of the host element. @defaultValue full width and height */
  style?: CSSProperties;
  /** Receives the chart handle. */
  ref?: Ref<ChartHandle<Row>>;
}

/**
 * A chart. Its props are the same options `createChart` takes, applied with `setOptions` on
 * every render, so inline objects and callbacks cost only what they change.
 */
export const Chart = forwardRef(function Chart<Row>(
  props: ChartProps<Row>,
  ref: Ref<ChartHandle<Row>>,
): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const bound = useRef<Binding<Row> | null>(null);
  const { options, attributes } = splitProps<Row>(props);
  useIsoLayoutEffect(() => {
    const binding = bindChart(host.current as HTMLDivElement, options);
    bound.current = binding;
    return () => {
      bound.current = null;
      binding.destroy();
    };
  }, []);
  useIsoLayoutEffect(() => bound.current?.update(options));
  useIsoLayoutEffect(
    () => (bound.current ? attachRef(ref, bound.current.chart) : undefined),
    [ref],
  );
  const height = cssHeight(options.height);
  return createElement('div', {
    ...hostDefaults(options),
    ...attributes,
    ref: host,
    style: { width: '100%', height: '100%', ...props.style, ...(height ? { height } : {}) },
  });
}) as <Row = Record<string, any>>(props: ChartProps<Row>) => ReactElement;
