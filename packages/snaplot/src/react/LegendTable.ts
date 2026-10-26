import {
  createElement,
  type CSSProperties,
  type ReactElement,
  useLayoutEffect,
  useRef,
} from 'react';
import {
  createLegendTable,
  type LegendTableHandle,
  type LegendTableOptions,
} from '../public/legend';
import type { ChartHandle } from '../public/types';

/** The props of {@link LegendTable}: the vanilla options, plus the host's class and style. */
export interface LegendTableProps<Row = Record<string, any>>
  extends Omit<LegendTableOptions<Row>, 'chart'> {
  /** The chart the table reads; nothing renders until there is one. */
  chart: ChartHandle<Row> | null | undefined;
  /** Class names of the host element. @defaultValue none */
  className?: string;
  /** Inline styles of the host element. @defaultValue none */
  style?: CSSProperties;
}

/** A table of each series' value at the cursor: `createLegendTable` as a component. */
export function LegendTable<Row = Record<string, any>>(props: LegendTableProps<Row>): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const table = useRef<{ chart: ChartHandle<Row>; handle: LegendTableHandle<Row> } | null>(null);
  useLayoutEffect(() => {
    const chart = props.chart;
    const options = { columns: props.columns, fallback: props.fallback };
    if (table.current && table.current.chart !== chart) {
      table.current.handle.destroy();
      table.current = null;
    }
    if (!chart || !host.current) return;
    if (table.current) table.current.handle.update(options);
    else
      table.current = {
        chart,
        handle: createLegendTable(host.current, {
          chart,
          ...(options.columns ? { columns: options.columns } : {}),
          ...(options.fallback ? { fallback: options.fallback } : {}),
        }),
      };
  });
  useLayoutEffect(
    () => () => {
      table.current?.handle.destroy();
      table.current = null;
    },
    [],
  );
  return createElement('div', { ref: host, className: props.className, style: props.style });
}
