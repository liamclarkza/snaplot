import {
  createElement,
  type CSSProperties,
  type ReactElement,
  type Ref,
  useLayoutEffect,
  useRef,
} from 'react';
import { createChart } from '../public/chart';
import type { ChartHandle, ChartOptions } from '../public/types';
import { type HostAttributes, splitProps } from './shared';

/** The props of {@link Chart}: the chart's options, plus the host element's attributes. */
export interface ChartProps<Row = Record<string, any>> extends ChartOptions<Row>, HostAttributes {
  /** Class names of the host element. @defaultValue none */
  className?: string;
  /** Inline styles of the host element. @defaultValue full width and height */
  style?: CSSProperties;
  /** Receives the chart handle. */
  ref?: Ref<ChartHandle<Row>>;
}

function assignRef<T>(ref: Ref<T> | undefined, value: T): (() => void) | undefined {
  if (typeof ref === 'function') {
    const cleanup = ref(value);
    return typeof cleanup === 'function'
      ? cleanup
      : () => {
          ref(null);
        };
  }
  if (ref) {
    ref.current = value;
    return () => {
      ref.current = null;
    };
  }
}

/**
 * A chart. Its props are the same options `createChart` takes, applied with `setOptions` on
 * every render, so inline objects and callbacks cost only what they change.
 */
export function Chart<Row = Record<string, any>>(props: ChartProps<Row>): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<ChartHandle<Row> | null>(null);
  const latest = useRef(props);
  latest.current = props;
  useLayoutEffect(() => {
    if (!host.current) return;
    const chart = createChart(host.current, splitProps<Row>(latest.current).options);
    instance.current = chart;
    return () => {
      instance.current = null;
      chart.destroy();
    };
  }, []);
  useLayoutEffect(() => {
    instance.current?.setOptions(splitProps<Row>(props).options);
  });
  const forwardedRef = props.ref;
  useLayoutEffect(() => {
    if (instance.current) return assignRef(forwardedRef, instance.current);
  }, [forwardedRef]);
  const { attributes } = splitProps(props);
  return createElement('div', {
    ...attributes,
    ref: host,
    className: props.className,
    style: { width: '100%', height: '100%', ...props.style },
    role: 'group',
    'aria-label': props['aria-label'] ?? props.ariaLabel ?? 'Chart',
  });
}
