import { createEffect, type JSX, onCleanup } from 'solid-js';
import { createLegendTable, type LegendTableOptions } from '../public/legend';
import { type MaybeChart, resolveChart } from './primitives';

/** The props of {@link LegendTable}: the vanilla options, plus the host's class and style. */
export interface LegendTableProps<Row = Record<string, any>>
  extends Omit<LegendTableOptions<Row>, 'chart'> {
  /** The chart the table reads: a handle, an accessor of one, or nothing yet. */
  chart: MaybeChart<Row>;
  /** Class names of the host element. @defaultValue none */
  class?: string;
  /** Inline styles of the host element. @defaultValue none */
  style?: string | JSX.CSSProperties;
}

/** A table of each series' value at the cursor: `createLegendTable` as a component. */
export function LegendTable<Row = Record<string, any>>(props: LegendTableProps<Row>): JSX.Element {
  let host!: HTMLDivElement;
  createEffect(() => {
    const chart = resolveChart(props.chart);
    if (!chart) return;
    const table = createLegendTable(host, {
      chart,
      ...(props.columns ? { columns: props.columns } : {}),
      ...(props.fallback ? { fallback: props.fallback } : {}),
    });
    createEffect(() => table.update({ columns: props.columns, fallback: props.fallback }));
    onCleanup(() => table.destroy());
  });
  return <div ref={host!} class={props.class} style={props.style} />;
}
