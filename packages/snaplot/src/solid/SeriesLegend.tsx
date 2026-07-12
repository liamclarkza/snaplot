import { For, createSignal, onCleanup, onMount } from 'solid-js';
import type { JSX } from 'solid-js';
import { applyThemeToElement } from '../config/theme';
import type { ChartInstance, LegendItem } from '../types';

export interface SeriesLegendProps {
  /** Chart whose resolved series/theme state should be represented. */
  chart: ChartInstance;
  /** Toggle series visibility when an item is activated. Default: `true`. */
  toggle?: boolean;
  /** Link pointer hover to the chart's series highlight. Default: `true`. */
  highlight?: boolean;
  class?: string;
  style?: string | JSX.CSSProperties;
}

/**
 * Compact, theme-aware series legend for an application-owned card header.
 * Import `snaplot/legend-table.css` once for its default styling.
 */
export function SeriesLegend(props: SeriesLegendProps): JSX.Element {
  let root!: HTMLDivElement;
  const [items, setItems] = createSignal<LegendItem[]>(props.chart.getLegendItems());

  const refresh = () => {
    setItems(props.chart.getLegendItems());
    applyThemeToElement(root, props.chart.getTheme());
  };

  onMount(() => {
    refresh();
    const offOptions = props.chart.on('options:update', refresh);
    const offTheme = props.chart.on('theme:update', refresh);
    onCleanup(() => {
      offOptions();
      offTheme();
    });
  });

  const toggle = (item: LegendItem) => {
    if (props.toggle === false) return;
    const config = props.chart.getOptions();
    props.chart.setOptions({
      series: config.series.map((series, index) =>
        index === item.seriesIndex ? { ...series, visible: !item.visible } : series,
      ),
    });
  };

  return (
    <div
      ref={root!}
      class={`snaplot-legend-root snaplot-series-legend${props.class ? ` ${props.class}` : ''}`}
      style={props.style}
      role="group"
      aria-label="Chart legend"
    >
      <For each={items()}>{item => (
        <button
          type="button"
          class="snaplot-legend-item"
          data-hidden={!item.visible ? 'true' : undefined}
          aria-pressed={item.visible}
          aria-label={`${item.visible ? 'Hide' : 'Show'} ${item.label}`}
          onClick={() => toggle(item)}
          onPointerEnter={() => props.highlight !== false && props.chart.setHighlight(item.seriesIndex)}
          onPointerLeave={() => props.highlight !== false && props.chart.setHighlight(null)}
        >
          <span
            class="snaplot-legend-dot"
            data-mark={item.type}
            data-dashed={item.lineDash.length > 0 ? 'true' : undefined}
            style={{
              color: item.color,
              opacity: item.opacity,
              'border-color': item.color,
              'background-color': item.fill ?? undefined,
            }}
          />
          <span class="snaplot-legend-label">{item.label}</span>
        </button>
      )}</For>
    </div>
  );
}
