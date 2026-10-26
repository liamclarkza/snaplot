import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  type Accessor,
  type JSX,
} from 'solid-js';
import type { ChartHandle, ChartPoint, SeriesState, CursorSnapshot } from '../public/types';
import { applyThemeToElement } from '../config/theme';
import { createChartState } from './createChartState';
import { createCursorSnapshot } from './createCursorSnapshot';
import { legendPoint, type LegendTableFallback } from '../react/shared';
/** One column of {@link LegendTable}. */
export interface LegendTableColumn<Row> {
  /** A stable key for the column. */
  key: string;
  /** The header text. */
  header: string;
  /** Text alignment. @defaultValue `'left'` */
  align?: 'left' | 'right' | 'center';
  /** A CSS width. @defaultValue automatic */
  width?: string;
  /** The header's title attribute. @defaultValue none */
  title?: string;
  /** Renders the cell of one series. */
  cell: (
    point: ChartPoint<Row>,
    series: SeriesState,
    api: { setHighlight: (id: string | null) => void },
  ) => JSX.Element;
}
/** Props of {@link LegendTable}. */
export interface LegendTableProps<Row = Record<string, any>> {
  /** The chart, as an accessor. */
  chart: Accessor<ChartHandle<Row> | null | undefined>;
  /** What the rows show when the cursor is not over the chart. @defaultValue `'series-only'` */
  fallback?: LegendTableFallback;
  /** The columns. @defaultValue name and value */
  columns?: readonly LegendTableColumn<Row>[];
  /** Show the X value above the rows. @defaultValue `true` */
  showStepHeader?: boolean;
  /** How the X value in the header is written. @defaultValue the X axis format */
  formatStep?: (value: number | string) => string;
  /** Highlight a series while its row is hovered. @defaultValue `true` */
  highlightOnHover?: boolean;
  /** A CSS max-height; the table scrolls beyond it. @defaultValue no limit */
  maxHeight?: string;
  /** Extra class names. @defaultValue none */
  class?: string;
  /** Inline styles. @defaultValue none */
  style?: string | JSX.CSSProperties;
  /** Render the table yourself from the cursor snapshot. */
  children?: (
    snapshot: Accessor<CursorSnapshot<Row> | undefined>,
    highlight: Accessor<string | null>,
    setHighlight: (id: string | null) => void,
  ) => JSX.Element;
}
/** A table of each series' value at the cursor. */
export function LegendTable<Row>(props: LegendTableProps<Row>): JSX.Element {
  let root!: HTMLDivElement;
  const state = createChartState(props.chart);
  const visibility = createMemo(() => state()?.hiddenSeries ?? [], undefined, {
    equals: (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
  });
  const fallback = () => props.fallback ?? 'series-only';
  const snapshot = createCursorSnapshot(props.chart, () => ({
    fallback: fallback() === 'series-only' ? 'latest' : (fallback() as 'hide' | 'first' | 'latest'),
  }));
  const highlighted = createMemo(() => state()?.highlight ?? null);
  const setHighlight = (id: string | null) => props.chart()?.setHighlight(id);
  const [items, setItems] = createSignal<SeriesState[]>([]);
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
  const columns = (): readonly LegendTableColumn<Row>[] =>
    props.columns ?? [
      {
        key: 'name',
        header: 'Name',
        cell: (point) => (
          <span
            style={{
              display: 'inline-flex',
              'align-items': 'center',
              gap: '6px',
              'max-width': '160px',
            }}
          >
            <span
              class="snaplot-legend-swatch"
              style={{
                width: '8px',
                height: '8px',
                'border-radius': '50%',
                background: point.color,
                'flex-shrink': 0,
              }}
            />
            <span
              title={point.label}
              style={{ overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}
            >
              {point.label}
            </span>
          </span>
        ),
      },
      {
        key: 'value',
        header: 'Value',
        align: 'right',
        cell: (point) =>
          point.formattedY ? (
            <span style={{ 'font-variant-numeric': 'tabular-nums' }}>{point.formattedY}</span>
          ) : (
            '—'
          ),
      },
    ];
  const haveStep = () =>
    snapshot()?.x != null && (fallback() !== 'series-only' || snapshot()?.source === 'cursor');
  const hide = () => fallback() === 'hide' && (!snapshot() || snapshot()?.source === 'none');
  if (props.children) return props.children(snapshot, highlighted, setHighlight);
  return (
    <div
      ref={root!}
      class={['snaplot-legend-table-root', props.class].filter(Boolean).join(' ')}
      style={
        typeof props.style === 'string'
          ? 'flex-shrink:0;padding:8px 12px;font-size:12px;line-height:1.4;' +
            (props.maxHeight ? `max-height:${props.maxHeight};overflow:auto;` : '') +
            props.style +
            (hide() ? ';display:none' : '')
          : {
              'flex-shrink': 0,
              padding: '8px 12px',
              'font-size': '12px',
              'line-height': '1.4',
              ...(props.maxHeight ? { 'max-height': props.maxHeight, overflow: 'auto' } : {}),
              ...props.style,
              ...(hide() ? { display: 'none' } : {}),
            }
      }
    >
      <Show when={props.showStepHeader !== false}>
        <div
          class="snaplot-legend-step"
          style={{
            'margin-bottom': '6px',
            'font-size': '11px',
            opacity: 0.75,
            'min-height': '16px',
          }}
        >
          Step:{' '}
          <span
            style={{
              'font-weight': 600,
              'font-variant-numeric': 'tabular-nums',
              visibility: haveStep() ? 'visible' : 'hidden',
            }}
          >
            {haveStep() ? (props.formatStep?.(snapshot()!.x!) ?? snapshot()!.formattedX) : '\u00a0'}
          </span>
        </div>
      </Show>
      <table class="snaplot-legend-table" style={{ width: '100%', 'border-collapse': 'collapse' }}>
        <thead>
          <tr>
            <For each={columns()}>
              {(col) => (
                <th
                  class={`snaplot-legend-header snaplot-legend-header--${col.key}`}
                  title={col.title}
                  style={{
                    'font-weight': 400,
                    'font-size': '11px',
                    opacity: 0.6,
                    'text-align': col.align ?? 'left',
                    padding: '0 8px 4px 0',
                    width: col.width,
                  }}
                >
                  {col.header}
                </th>
              )}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={items().filter((item) => item.visible)}>
            {(item) => (
              <tr
                class="snaplot-legend-row"
                data-series-id={item.id}
                data-highlighted={highlighted() === item.id ? 'true' : undefined}
                data-dimmed={highlighted() && highlighted() !== item.id ? 'true' : undefined}
                onMouseEnter={() => props.highlightOnHover !== false && setHighlight(item.id)}
                onMouseLeave={() => props.highlightOnHover !== false && setHighlight(null)}
              >
                <For each={columns()}>
                  {(col) => (
                    <td
                      class={`snaplot-legend-cell snaplot-legend-cell--${col.key}`}
                      style={{ 'text-align': col.align, width: col.width }}
                    >
                      {col.cell(
                        legendPoint(
                          item,
                          state(),
                          snapshot()?.points.find((point) => point.seriesId === item.id),
                          fallback(),
                        ),
                        item,
                        { setHighlight },
                      )}
                    </td>
                  )}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}
