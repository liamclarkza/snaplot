import type { CSSProperties, ReactElement, RefObject } from 'react';
import { createElement, useRef } from 'react';
import type { ChartHandle, LegendTableHandle, LegendTableOptions } from 'snaplot';
import { createLegendTable } from 'snaplot';
import { useChart, useIsoLayoutEffect } from './hooks';

/** The props of {@link LegendTable}: the vanilla options, plus the host's class and style. */
export interface LegendTableProps<Row = Record<string, any>>
  extends Omit<LegendTableOptions<Row>, 'chart'> {
  /** The chart the table reads; nothing renders until there is one. */
  chart: ChartHandle<Row> | RefObject<ChartHandle<Row> | null> | null | undefined;
  /** Class names of the host element. @defaultValue none */
  className?: string;
  /** Inline styles of the host element. @defaultValue none */
  style?: CSSProperties;
}

/** A table of each series' value at the cursor: `createLegendTable` as a component. */
export function LegendTable<Row = Record<string, any>>(props: LegendTableProps<Row>): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const table = useRef<LegendTableHandle<Row> | null>(null);
  const chart = useChart(props.chart);
  const { columns, fallback } = props;
  // A new chart, or an option removed (back to its default), makes a new table.
  useIsoLayoutEffect(() => {
    if (!chart || !host.current) return;
    const made = (table.current = createLegendTable(host.current, { chart, columns, fallback }));
    return () => {
      table.current = null;
      made.destroy();
    };
  }, [chart, columns === undefined, fallback === undefined]);
  useIsoLayoutEffect(() => table.current?.update({ columns, fallback }), [columns, fallback]);
  return createElement('div', { ref: host, className: props.className, style: props.style });
}
