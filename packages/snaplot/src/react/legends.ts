import {
  createElement as h,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { ChartHandle, ChartPoint, LegendItem, CursorSnapshot } from '../public/types';
import { applyThemeToElement } from '../config/theme';
import { useChartState, useCursorSnapshot } from './hooks';
import { legendPoint, type LegendTableFallback } from './shared';
/** Props of {@link SeriesLegend}. */
export interface SeriesLegendProps<Row = Record<string, any>> {
  /** The chart, from a ref. */
  chart: ChartHandle<Row> | null | undefined;
  /** Toggle a series on click. @defaultValue `true` */
  toggle?: boolean;
  /** Highlight a series on hover and focus. @defaultValue `true` */
  highlight?: boolean;
  /** Extra class names. @defaultValue none */
  className?: string;
  /** Inline styles. @defaultValue none */
  style?: CSSProperties;
}
function useLegend<Row>(chart: ChartHandle<Row> | null | undefined) {
  const state = useChartState(chart);
  const [, refresh] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!chart) return;
    const update = () => {
      if (root.current) applyThemeToElement(root.current, chart.getTheme());
      refresh((n) => n + 1);
    };
    update();
    const off = [chart.on('options:update', update), chart.on('theme:update', update)];
    return () => {
      for (const stop of off) stop();
    };
  }, [chart]);
  return { state, root, items: chart?.getLegendItems() ?? [] };
}
/** A list legend for a chart: one button per series. */
export function SeriesLegend<Row>(props: SeriesLegendProps<Row>): ReactElement {
  const { root, items } = useLegend(props.chart);
  return h(
    'div',
    {
      ref: root,
      className: `snaplot-legend-root snaplot-series-legend${props.className ? ' ' + props.className : ''}`,
      style: props.style,
      role: 'group',
      'aria-label': 'Chart legend',
    },
    items.map((item) =>
      h(
        'button',
        {
          key: item.id,
          type: 'button',
          className: 'snaplot-legend-item',
          'data-hidden': !item.visible ? 'true' : undefined,
          'aria-pressed': item.visible,
          'aria-label': `${item.visible ? 'Hide' : 'Show'} ${item.label}`,
          onClick: () =>
            props.toggle !== false && props.chart?.setSeriesVisible(item.id, !item.visible),
          onPointerEnter: () => props.highlight !== false && props.chart?.setHighlight(item.id),
          onPointerLeave: () => props.highlight !== false && props.chart?.setHighlight(null),
          onFocus: () => props.highlight !== false && props.chart?.setHighlight(item.id),
          onBlur: () => props.highlight !== false && props.chart?.setHighlight(null),
        },
        h('span', {
          className: 'snaplot-legend-dot',
          'data-mark': item.type,
          'data-dashed': item.dash.length ? 'true' : undefined,
          style: {
            color: item.color,
            opacity: item.opacity,
            borderColor: item.color,
            backgroundColor: item.fill ?? undefined,
          },
        }),
        h('span', { className: 'snaplot-legend-label' }, item.label),
      ),
    ),
  );
}
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
    series: LegendItem,
    api: { setHighlight: (id: string | null) => void },
  ) => ReactNode;
}
/** Props of {@link LegendTable}. */
export interface LegendTableProps<Row = Record<string, any>> {
  /** The chart, from a ref. */
  chart: ChartHandle<Row> | null | undefined;
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
  className?: string;
  /** Inline styles. @defaultValue none */
  style?: CSSProperties;
  /** Render the table yourself from the cursor snapshot. */
  children?: (
    snapshot: CursorSnapshot<Row> | undefined,
    highlight: string | null,
    setHighlight: (id: string | null) => void,
  ) => ReactNode;
}
/** A table of each series' value at the cursor. */
export function LegendTable<Row>(props: LegendTableProps<Row>) {
  const { state, root, items } = useLegend(props.chart);
  const fallback = props.fallback ?? 'series-only';
  const snapshot = useCursorSnapshot(props.chart, {
    fallback: fallback === 'series-only' ? 'latest' : fallback,
  });
  const setHighlight = (id: string | null) => props.chart?.setHighlight(id);
  if (props.children) return props.children(snapshot, state?.highlight ?? null, setHighlight);
  const columns: readonly LegendTableColumn<Row>[] = props.columns ?? [
    {
      key: 'name',
      header: 'Name',
      cell: (point) =>
        h(
          'span',
          { style: { display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 160 } },
          h('span', {
            className: 'snaplot-legend-swatch',
            style: {
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: point.color,
              flexShrink: 0,
            },
          }),
          h(
            'span',
            {
              title: point.label,
              style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
            },
            point.label,
          ),
        ),
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      cell: (point) =>
        point.formattedY
          ? h('span', { style: { fontVariantNumeric: 'tabular-nums' } }, point.formattedY)
          : '—',
    },
  ];
  const haveStep =
    snapshot?.x != null && (fallback !== 'series-only' || snapshot.source === 'cursor');
  return h(
    'div',
    {
      ref: root,
      className: ['snaplot-legend-table-root', props.className].filter(Boolean).join(' '),
      style: {
        flexShrink: 0,
        padding: '8px 12px',
        fontSize: 12,
        lineHeight: '1.4',
        ...(props.maxHeight ? { maxHeight: props.maxHeight, overflow: 'auto' } : {}),
        ...props.style,
        ...(fallback === 'hide' && (!snapshot || snapshot.source === 'none')
          ? { display: 'none' }
          : {}),
      },
    },
    props.showStepHeader !== false &&
      h(
        'div',
        {
          className: 'snaplot-legend-step',
          style: { marginBottom: 6, fontSize: 11, opacity: 0.75, minHeight: 16 },
        },
        'Step: ',
        h(
          'span',
          {
            style: {
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              visibility: haveStep ? 'visible' : 'hidden',
            },
          },
          haveStep ? (props.formatStep?.(snapshot.x!) ?? snapshot.formattedX) : '\u00a0',
        ),
      ),
    h(
      'table',
      { className: 'snaplot-legend-table', style: { width: '100%', borderCollapse: 'collapse' } },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          columns.map((col) =>
            h(
              'th',
              {
                key: col.key,
                className: `snaplot-legend-header snaplot-legend-header--${col.key}`,
                title: col.title,
                style: {
                  fontWeight: 400,
                  fontSize: 11,
                  opacity: 0.6,
                  textAlign: col.align ?? 'left',
                  padding: '0 8px 4px 0',
                  width: col.width,
                },
              },
              col.header,
            ),
          ),
        ),
      ),
      h(
        'tbody',
        null,
        items
          .filter((item) => item.visible)
          .map((item) =>
            h(
              'tr',
              {
                key: item.id,
                className: 'snaplot-legend-row',
                'data-series-id': item.id,
                'data-highlighted': state?.highlight === item.id ? 'true' : undefined,
                'data-dimmed': state?.highlight && state.highlight !== item.id ? 'true' : undefined,
                onMouseEnter: () => props.highlightOnHover !== false && setHighlight(item.id),
                onMouseLeave: () => props.highlightOnHover !== false && setHighlight(null),
              },
              columns.map((col) =>
                h(
                  'td',
                  {
                    key: col.key,
                    className: `snaplot-legend-cell snaplot-legend-cell--${col.key}`,
                    style: { textAlign: col.align, width: col.width },
                  },
                  col.cell(
                    legendPoint(
                      item,
                      state,
                      snapshot?.points.find((point) => point.seriesId === item.id),
                      fallback,
                    ),
                    item,
                    { setHighlight },
                  ),
                ),
              ),
            ),
          ),
      ),
    ),
  );
}
/** Native React cells; no DOM nodes are constructed while rendering. */
export function swatchColumn<Row>(
  options: { size?: number; shape?: 'dot' | 'bar' } = {},
): LegendTableColumn<Row> {
  const size = options.size ?? 10;
  return {
    key: 'swatch',
    header: '',
    width: `${size + 4}px`,
    cell: (point) =>
      h('span', {
        className: 'snaplot-legend-swatch',
        style: {
          display: 'inline-block',
          width: size,
          height: options.shape === 'bar' ? Math.max(2, Math.round(size * 0.4)) : size,
          borderRadius: options.shape === 'bar' ? 1 : '50%',
          background: point.color,
          flexShrink: 0,
        },
      }),
  };
}
/** A column with the series swatch and name. */
export function nameColumn<Row>(
  options: { swatch?: boolean; truncate?: number } = {},
): LegendTableColumn<Row> {
  return {
    key: 'name',
    header: 'Name',
    cell: (point) =>
      h(
        'span',
        {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            maxWidth: options.truncate ?? 160,
          },
        },
        options.swatch !== false &&
          swatchColumn<Row>({ size: 8 }).cell(point, {} as LegendItem, { setHighlight: () => {} }),
        h(
          'span',
          {
            title: point.label,
            style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
          },
          point.label,
        ),
      ),
  };
}
/** A column with the series value. */
export function valueColumn<Row>(
  options: {
    format?: (value: number, point: ChartPoint<Row>) => string;
    placeholder?: string;
    align?: 'left' | 'right' | 'center';
    header?: string;
  } = {},
): LegendTableColumn<Row> {
  return {
    key: 'value',
    header: options.header ?? 'Value',
    align: options.align ?? 'right',
    cell: (point) =>
      Number.isNaN(point.y) || !point.formattedY
        ? (options.placeholder ?? '—')
        : h(
            'span',
            { style: { fontVariantNumeric: 'tabular-nums' } },
            options.format?.(point.y, point) ?? point.formattedY,
          ),
  };
}
/** A column with a value computed from the point. */
export function metricColumn<Row>(
  resolve: (point: ChartPoint<Row>, series: LegendItem) => string,
  options: { header?: string; truncate?: number } = {},
): LegendTableColumn<Row> {
  return {
    key: 'metric',
    header: options.header ?? 'Metric',
    cell: (point, series) =>
      h(
        'span',
        {
          title: resolve(point, series),
          style: {
            display: 'inline-block',
            maxWidth: options.truncate ?? 160,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          },
        },
        resolve(point, series),
      ),
  };
}
/** Declares a custom column. */
export function column<Row>(spec: LegendTableColumn<Row>): LegendTableColumn<Row> {
  return spec;
}
