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
import type {
  ChartInstance,
  CursorSnapshot,
  CursorSeriesPoint,
  SeriesConfig,
} from '../types';
import { createCursorSnapshot } from './createCursorSnapshot';
import { createHighlight } from './createHighlight';
import {
  type LegendTableColumn,
  nameColumn,
  valueColumn,
} from '../plugins/builtins/legendTableColumns';

/** Mirrors the plugin's fallback union (re-exported for ergonomics). */
export type LegendTableFallback = 'hide' | 'latest' | 'first' | 'series-only';

/**
 * Solid-flavored column definition. The cell receives the snapshot row,
 * the series config, and (optionally) the highlight setter so a row's
 * cell can drive cross-chart highlighting from a button or link.
 *
 * If you don't need JSX in cells, the same `LegendTableColumn` from
 * the plugin works fine and is forwarded through `columns`.
 */
export interface LegendTableSolidColumn<TMeta = unknown> {
  /**
   * Must be `'solid'` for this column to be recognized as a Solid column
   * (JSX cell + `api` argument). Columns without it are treated as plugin
   * `LegendTableColumn`s whose cells return `string | Node`.
   */
  kind?: 'solid';
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  width?: string;
  title?: string;
  cell: (
    point: CursorSeriesPoint<TMeta>,
    series: SeriesConfig<TMeta>,
    api: { setHighlight: (idx: number | null) => void },
  ) => JSX.Element;
}

export interface LegendTableProps<TMeta = unknown> {
  /** The chart accessor (from `<Chart onReady>` or `createChart`). */
  chart: Accessor<ChartInstance | undefined>;

  /** Default: `'series-only'`, the table stays in place when the cursor leaves, preventing layout jolt. */
  fallback?: LegendTableFallback;

  /** Column definitions. Default: `[nameColumn(), valueColumn()]`. */
  columns?: Array<LegendTableSolidColumn<TMeta> | LegendTableColumn<TMeta>>;

  /** Show the "Step: N" header. Default: `true`. */
  showStepHeader?: boolean;

  /** Custom step header formatter. */
  formatStep?: (dataX: number) => string;

  /** Hovering a row sets `chart.setHighlight(seriesIndex)`. Default: `true`. */
  highlightOnHover?: boolean;

  /** Optional max-height (CSS string), useful for many series. */
  maxHeight?: string;

  /** Extra class added to the root container. */
  class?: string;

  /** Inline style on the root container. */
  style?: JSX.CSSProperties | string;

  /**
   * Render-prop escape hatch. When provided, `LegendTable` renders only
   * the children, but still wires cursor/highlight reactivity. Use this
   * for completely custom layouts (e.g. orbit's table with search and
   * "Add column" controls) that still want the heavy lifting done.
   */
  children?: (
    snapshot: Accessor<CursorSnapshot<TMeta> | null>,
    highlight: Accessor<number | null>,
    setHighlight: (idx: number | null) => void,
  ) => JSX.Element;
}

/**
 * A column is treated as a Solid column (its `cell` may return JSX and
 * receives the `{ setHighlight }` api as a third argument) only when it
 * explicitly declares `kind: 'solid'`. Columns without a `kind` default to
 * the plugin shape (`string | Node` cells, no api argument). The previous
 * `cell.length === 3` arity sniff misclassified 1-arg Solid cells and cells
 * using default/rest params, and could call a plugin cell with an api it
 * never expected.
 */
function isSolidColumn<T>(
  c: LegendTableSolidColumn<T> | LegendTableColumn<T>,
): c is LegendTableSolidColumn<T> {
  return (c as LegendTableSolidColumn<T>).kind === 'solid';
}

function renderPluginCell(content: string | Node): JSX.Element {
  if (typeof content === 'string') return content;
  // Wrap raw nodes in a span so Solid can mount them
  return content as unknown as JSX.Element;
}

/**
 * Cursor-synchronised legend table, the SolidJS-native counterpart to
 * `createLegendTablePlugin`.
 *
 * Zero-config defaults produce a sensible ML-dashboard look:
 *
 * ```tsx
 * <LegendTable chart={chart} />
 * ```
 *
 * Rich integration:
 *
 * ```tsx
 * <LegendTable<RunMeta>
 *   chart={chart}
 *   columns={[
 *     swatchColumn(),
 *     nameColumn(),
 *     metricColumn(p => p.meta!.metricKey),
 *     valueColumn({ format: v => v.toFixed(6) }),
 *   ]}
 * />
 * ```
 *
 * Headless mode (orbit's path, keep your own table layout):
 *
 * ```tsx
 * <LegendTable chart={chart}>
 *   {(snap, hl, setHl) => <MyTable data={snap()} highlight={hl()} onHover={setHl} />}
 * </LegendTable>
 * ```
 */
export function LegendTable<TMeta = unknown>(
  props: LegendTableProps<TMeta>,
): JSX.Element {
  const fallbackMode = (): LegendTableFallback => props.fallback ?? 'series-only';
  const bufferFallback = createMemo<'hide' | 'latest' | 'first'>(() =>
    fallbackMode() === 'series-only' ? 'latest' : (fallbackMode() as any),
  );

  const snapshot = createCursorSnapshot<TMeta>(
    props.chart,
    () => ({ fallback: bufferFallback() }),
  );
  const [highlight, setHighlight] = createHighlight(props.chart);
  const [optionsVersion, setOptionsVersion] = createSignal(0);

  createEffect(() => {
    const c = props.chart();
    if (!c) return;
    setOptionsVersion((v) => v + 1);
    const off = c.on('options:update', () => setOptionsVersion((v) => v + 1));
    onCleanup(off);
  });

  // If a render-prop child is provided, hand off and skip our table.
  if (typeof props.children === 'function') {
    return (
      <>{(props.children as Required<LegendTableProps<TMeta>>['children'])(snapshot, highlight, setHighlight)}</>
    );
  }

  const columns = (): Array<LegendTableSolidColumn<TMeta> | LegendTableColumn<TMeta>> =>
    (props.columns ?? [nameColumn<TMeta>(), valueColumn<TMeta>()]) as any;

  const showStepHeader = () => props.showStepHeader ?? true;
  const highlightOnHover = () => props.highlightOnHover ?? true;

  const seriesList = createMemo(() => {
    optionsVersion();
    return props.chart()?.getOptions().series ?? [];
  });

  const isCursorActive = () => snapshot()?.source === 'cursor';
  const isSeriesOnly = () =>
    fallbackMode() === 'series-only' && !isCursorActive();
  const shouldHide = () =>
    snapshot()?.source === 'none' && fallbackMode() === 'hide';

  /**
   * Look up a row by series index from the *current* snapshot buffer.
   * Called in tracked cell scopes, reading `snapshot()` here is the
   * whole point: it establishes a dependency on the `equals: false`
   * signal so every cursor tick re-runs the cell, even though the
   * row object is reused by reference for zero-alloc updates.
   */
  const pointOf = (si: number): CursorSeriesPoint<TMeta> | undefined => {
    const snap = snapshot();
    if (!snap) return undefined;
    // Linear scan is fine, `points` is small (visible series count).
    for (let i = 0; i < snap.points.length; i++) {
      if (snap.points[i].seriesIndex === si) return snap.points[i];
    }
    return undefined;
  };

  // Resolved categorical palette, matching the canvas. Used to color a
  // synthesized fallback point when a series has no snapshot row.
  const palette = createMemo<string[]>(() => {
    const c = props.chart();
    if (!c) return [];
    const theme = c.getTheme();
    return theme.categoricalPalette ?? theme.palette ?? [];
  });

  const colorFor = (si: number, series: SeriesConfig<TMeta>): string => {
    const pal = palette();
    return series.stroke ?? (pal.length > 0 ? pal[si % pal.length] : '');
  };

  /**
   * The point to render for a row. Falls back to a synthesized point built
   * from the series config when the snapshot has no row for this series, so a
   * series without data still shows its name/swatch instead of vanishing. In
   * series-only mode the value fields are blanked so *any* value-reading
   * column (not only `key === 'value'`) shows its placeholder rather than
   * stale latest-row numbers.
   */
  const effectivePoint = (si: number, series: SeriesConfig<TMeta>): CursorSeriesPoint<TMeta> => {
    const base: CursorSeriesPoint<TMeta> = pointOf(si) ?? {
      seriesIndex: si,
      dataIndex: -1,
      label: series.label,
      color: colorFor(si, series),
      value: Number.NaN,
      formattedValue: '',
      meta: series.meta,
    };
    if (isSeriesOnly()) {
      return { ...base, value: Number.NaN, formattedValue: '' };
    }
    return base;
  };

  /** True when there is anything to show, drives the "Step:" label. */
  const haveStepValue = () => {
    const snap = snapshot();
    return !!snap && snap.dataX !== null && !isSeriesOnly();
  };

  const renderStepValue = (): string => {
    const snap = snapshot();
    if (!snap || snap.dataX === null) return '';
    return props.formatStep ? props.formatStep(snap.dataX) : snap.formattedX;
  };

  return (
    <div
      class={['snaplot-legend-table-root', props.class].filter(Boolean).join(' ')}
      style={
        typeof props.style === 'string'
          ? (shouldHide() ? props.style + ';display:none' : props.style)
          : {
              'flex-shrink': '0',
              padding: '8px 12px',
              'font-size': '12px',
              'line-height': '1.4',
              ...(props.maxHeight ? { 'max-height': props.maxHeight, overflow: 'auto' } : {}),
              ...(props.style as JSX.CSSProperties),
              // Applied last so fallback='hide' wins over a user-supplied
              // `display` in the style object.
              ...(shouldHide() ? { display: 'none' } : {}),
            }
      }
    >
      {/* Step header, the slot is always reserved so cursor enter/leave
         doesn't jolt the layout. Only the value visibility flips. */}
      <Show when={showStepHeader()}>
        <div
          class="snaplot-legend-step"
          style={{
            'margin-bottom': '6px',
            'font-size': '11px',
            opacity: 0.75,
            // Reserve a stable row height so toggling the value
            // on cursor enter/leave doesn't reflow the chart.
            'min-height': '16px',
          }}
        >
          Step:{' '}
          <span
            style={{
              'font-weight': '600',
              'font-variant-numeric': 'tabular-nums',
              // Keep the span's box stable; only hide the glyphs.
              visibility: haveStepValue() ? 'visible' : 'hidden',
            }}
          >
            {/* Use a non-breaking space as a placeholder when the
               cursor is absent so the line-height is consistent. */}
            {haveStepValue() ? renderStepValue() : '\u00a0'}
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
                    'font-weight': '400',
                    'font-size': '11px',
                    opacity: 0.6,
                    'text-align': col.align ?? 'left',
                    padding: '0 8px 4px 0',
                    ...(col.width ? { width: col.width } : {}),
                  }}
                >
                  {col.header}
                </th>
              )}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={seriesList().map((s, i) => ({ s, i })).filter(({ s }) => s.visible !== false)}>
            {({ s: series, i: si }) => {
              const isHighlighted = () => highlight() === si;
              const isDimmed = () => highlight() !== null && highlight() !== si;

              return (
                <tr
                  class="snaplot-legend-row"
                  data-series-index={si}
                  data-highlighted={isHighlighted() ? 'true' : undefined}
                  data-dimmed={isDimmed() ? 'true' : undefined}
                  onMouseEnter={highlightOnHover() ? () => setHighlight(si) : undefined}
                  onMouseLeave={highlightOnHover() ? () => setHighlight(null) : undefined}
                >
                  <For each={columns()}>
                    {(col) => (
                      <td
                        class={`snaplot-legend-cell snaplot-legend-cell--${col.key}`}
                        style={{
                          ...(col.align ? { 'text-align': col.align } : {}),
                          ...(col.width ? { width: col.width } : {}),
                        }}
                      >
                        {/* The IIFE runs inside a tracked scope, calling
                           snapshot() via pointOf() forces re-evaluation on
                           every cursor tick, even though the row object
                           reference is reused for zero-alloc buffering. */}
                        {(() => {
                          const p = effectivePoint(si, series as SeriesConfig<TMeta>);
                          if (isSolidColumn<TMeta>(col)) {
                            return col.cell(p, series as SeriesConfig<TMeta>, { setHighlight });
                          }
                          return renderPluginCell(
                            (col as LegendTableColumn<TMeta>).cell(p, series as SeriesConfig<TMeta>),
                          );
                        })()}
                      </td>
                    )}
                  </For>
                </tr>
              );
            }}
          </For>
        </tbody>
      </table>
    </div>
  );
}
