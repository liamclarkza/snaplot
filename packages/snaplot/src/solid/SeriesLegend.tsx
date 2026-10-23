import {
  For,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  type Accessor,
  type JSX,
} from 'solid-js';
import { applyThemeToElement } from '../config/theme';
import type { ChartHandle, LegendItem } from '../public/types';
import { createChartState } from './createChartState';
/** Props of {@link SeriesLegend}. */
export interface SeriesLegendProps<Row = Record<string, any>> {
  /** The chart, as an accessor. */
  chart: Accessor<ChartHandle<Row> | undefined | null>;
  /** Toggle a series on click. @defaultValue `true` */
  toggle?: boolean;
  /** Highlight a series on hover and focus. @defaultValue `true` */
  highlight?: boolean;
  /** Extra class names. @defaultValue none */
  class?: string;
  /** Inline styles. @defaultValue none */
  style?: string | JSX.CSSProperties;
}
/** A list legend for a chart: one button per series. */
export function SeriesLegend<Row>(props: SeriesLegendProps<Row>): JSX.Element {
  let root!: HTMLDivElement;
  const state = createChartState(props.chart);
  const visibility = createMemo(() => state()?.hiddenSeries ?? [], undefined, {
    equals: (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
  });
  const [items, setItems] = createSignal<LegendItem[]>([]);
  createEffect(() => {
    visibility();
    const chart = props.chart();
    const refresh = () => {
      setItems(chart?.getLegendItems() ?? []);
      if (chart && root) applyThemeToElement(root, chart.getTheme());
    };
    refresh();
    if (chart) {
      const off = [chart.on('options:update', refresh), chart.on('theme:update', refresh)];
      onCleanup(() =>
        off.forEach((stop) => {
          stop();
        }),
      );
    }
  });
  const highlight = (id: string | null) => {
    if (props.highlight !== false) props.chart()?.setHighlight(id);
  };
  return (
    <div
      ref={root!}
      class={`snaplot-legend-root snaplot-series-legend${props.class ? ` ${props.class}` : ''}`}
      style={props.style}
      role="group"
      aria-label="Chart legend"
    >
      <For each={items()}>
        {(item) => (
          <button
            type="button"
            class="snaplot-legend-item"
            data-hidden={!item.visible ? 'true' : undefined}
            aria-pressed={item.visible}
            aria-label={`${item.visible ? 'Hide' : 'Show'} ${item.label}`}
            onClick={() =>
              props.toggle !== false && props.chart()?.setSeriesVisible(item.id, !item.visible)
            }
            onPointerEnter={() => highlight(item.id)}
            onPointerLeave={() => highlight(null)}
            onFocus={() => highlight(item.id)}
            onBlur={() => highlight(null)}
          >
            <span
              class="snaplot-legend-dot"
              data-mark={item.type}
              data-dashed={item.dash.length ? 'true' : undefined}
              style={{
                color: item.color,
                opacity: item.opacity,
                'border-color': item.color,
                'background-color': item.fill ?? undefined,
              }}
            />
            <span class="snaplot-legend-label">{item.label}</span>
          </button>
        )}
      </For>
    </div>
  );
}
