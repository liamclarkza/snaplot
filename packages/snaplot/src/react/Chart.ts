import { createElement, useLayoutEffect, useRef, type CSSProperties, type Ref } from 'react';
import { createChart, reconcileChart, setChartControls } from '../api/createChart';
import type { ChartHandle, ChartOptions } from '../api/types';
import { applyDefaults, chartOptions, chartControls, type ChartControls } from './shared';

export interface ChartProps<Row = Record<string, unknown>> extends ChartOptions<Row>, ChartControls {
  className?: string;
  style?: CSSProperties;
  ref?: Ref<ChartHandle<Row>>;
  onReady?: (chart: ChartHandle<Row>) => void;
}
function assignRef<T>(ref: Ref<T> | undefined, value: T): (() => void) | undefined {
  if (typeof ref === 'function') {
    const cleanup = ref(value);
    return typeof cleanup === 'function' ? cleanup : () => { ref(null); };
  }
  if (ref) { ref.current = value; return () => { ref.current = null; }; }
}
/** Native React 19 component. Options are direct props; the ref exposes the imperative handle. */
export function Chart<Row = Record<string, unknown>>(props: ChartProps<Row>) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<ChartHandle<Row> | null>(null);
  const latest = useRef(props);
  latest.current = props;
  useLayoutEffect(() => {
    if (!host.current) return;
    const current = latest.current;
    const chart = createChart(host.current, chartOptions(current));
    instance.current = chart;
    setChartControls(chart, chartControls(current));
    applyDefaults(chart, current);
    current.onReady?.(chart);
    return () => { instance.current = null; chart.destroy(); };
  }, []);
  useLayoutEffect(() => {
    if (instance.current) {
      reconcileChart(instance.current, chartOptions(props), chartControls(props));
    }
  });
  const forwardedRef = props.ref;
  useLayoutEffect(() => {
    if (instance.current) return assignRef(forwardedRef, instance.current);
  }, [forwardedRef]);
  return createElement('div', { ref: host, className: props.className,
    style: { width: '100%', height: '100%', ...props.style }, role: 'group', 'aria-label': props['aria-label'] ?? props.ariaLabel ?? 'Chart', 'aria-describedby': props['aria-describedby'], 'aria-labelledby': props['aria-labelledby'] });
}
