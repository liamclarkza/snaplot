import { For, Show, createEffect, createMemo, createSignal, onCleanup, type Accessor, type JSX } from 'solid-js';
import type { ChartHandle, ChartPoint, LegendItem, CursorSnapshot } from '../api/types';
import { applyThemeToElement } from '../config/theme';
import { createChartState } from './createChartState';
import { createCursorSnapshot } from './createCursorSnapshot';
import { legendPoint, type LegendTableFallback } from '../react/shared';
export interface LegendTableColumn<Row> {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  width?: string;
  title?: string;
  cell: (point: ChartPoint<Row>, series: LegendItem, api: { setHighlight: (id: string | null) => void }) => JSX.Element;
}
export interface LegendTableProps<Row = Record<string, unknown>> {
  chart: Accessor<ChartHandle<Row> | null | undefined>;
  fallback?: LegendTableFallback;
  columns?: readonly LegendTableColumn<Row>[];
  showStepHeader?: boolean;
  formatStep?: (value: number | string) => string;
  highlightOnHover?: boolean;
  maxHeight?: string;
  class?: string;
  style?: string | JSX.CSSProperties;
  children?: (snapshot: Accessor<CursorSnapshot<Row> | undefined>, highlight: Accessor<string | null>, setHighlight: (id: string | null) => void) => JSX.Element;
}
export function LegendTable<Row>(props: LegendTableProps<Row>): JSX.Element {
  let root!: HTMLDivElement;
  const state = createChartState(props.chart);
  const visibility = createMemo(() => state()?.hiddenSeries ?? [], undefined, { equals: (a, b) => a.length === b.length && a.every((id, i) => id === b[i]) });
  const fallback = () => props.fallback ?? 'series-only';
  const snapshot = createCursorSnapshot(props.chart, () => ({ fallback: fallback() === 'series-only' ? 'latest' : fallback() as 'hide' | 'first' | 'latest' }));
  const highlighted = createMemo(() => state()?.highlightedSeries ?? null);
  const setHighlight = (id: string | null) => props.chart()?.setHighlight(id);
  const [items, setItems] = createSignal<LegendItem[]>([]);
  createEffect(() => {
    visibility();
    const chart = props.chart();
    const refresh = () => { setItems(chart?.getLegendItems() ?? []); if (chart && root) applyThemeToElement(root, chart.getTheme()); };
    refresh();
    if (chart) { const off = [chart.on('options:update', refresh), chart.on('theme:update', refresh)]; onCleanup(() => off.forEach(stop => { stop(); })); }
  });
  const columns = (): readonly LegendTableColumn<Row>[] => props.columns ?? [
    { key: 'name', header: 'Name', cell: point => <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '6px', 'max-width': '160px' }}><span class="snaplot-legend-swatch" style={{ width: '8px', height: '8px', 'border-radius': '50%', background: point.color, 'flex-shrink': 0 }} /><span title={point.label} style={{ overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>{point.label}</span></span> },
    { key: 'value', header: 'Value', align: 'right', cell: point => point.formattedY ? <span style={{ 'font-variant-numeric': 'tabular-nums' }}>{point.formattedY}</span> : '—' },
  ];
  const haveStep = () => snapshot()?.x != null && (fallback() !== 'series-only' || snapshot()?.source === 'cursor');
  const hide = () => fallback() === 'hide' && (!snapshot() || snapshot()?.source === 'none');
  if (props.children) return props.children(snapshot, highlighted, setHighlight);
  return <div ref={root!} class={['snaplot-legend-table-root', props.class].filter(Boolean).join(' ')} style={typeof props.style === 'string'
    ? 'flex-shrink:0;padding:8px 12px;font-size:12px;line-height:1.4;' + (props.maxHeight ? `max-height:${props.maxHeight};overflow:auto;` : '') + props.style + (hide() ? ';display:none' : '')
    : { 'flex-shrink': 0, padding: '8px 12px', 'font-size': '12px', 'line-height': '1.4', ...(props.maxHeight ? { 'max-height': props.maxHeight, overflow: 'auto' } : {}), ...props.style, ...(hide() ? { display: 'none' } : {}) }}>
    <Show when={props.showStepHeader !== false}><div class="snaplot-legend-step" style={{ 'margin-bottom': '6px', 'font-size': '11px', opacity: .75, 'min-height': '16px' }}>Step: <span style={{ 'font-weight': 600, 'font-variant-numeric': 'tabular-nums', visibility: haveStep() ? 'visible' : 'hidden' }}>{haveStep() ? props.formatStep?.(snapshot()!.x!) ?? snapshot()!.formattedX : '\u00a0'}</span></div></Show>
    <table class="snaplot-legend-table" style={{ width: '100%', 'border-collapse': 'collapse' }}><thead><tr><For each={columns()}>{col => <th class={`snaplot-legend-header snaplot-legend-header--${col.key}`} title={col.title} style={{ 'font-weight': 400, 'font-size': '11px', opacity: .6, 'text-align': col.align ?? 'left', padding: '0 8px 4px 0', width: col.width }}>{col.header}</th>}</For></tr></thead>
      <tbody><For each={items().filter(item => item.visible)}>{item => <tr class="snaplot-legend-row" data-series-id={item.id} data-highlighted={highlighted() === item.id ? 'true' : undefined} data-dimmed={highlighted() && highlighted() !== item.id ? 'true' : undefined}
        onMouseEnter={() => props.highlightOnHover !== false && setHighlight(item.id)} onMouseLeave={() => props.highlightOnHover !== false && setHighlight(null)}>
        <For each={columns()}>{col => <td class={`snaplot-legend-cell snaplot-legend-cell--${col.key}`} style={{ 'text-align': col.align, width: col.width }}>{col.cell(legendPoint(item, state(), snapshot()?.points.find(point => point.seriesId === item.id), fallback()), item, { setHighlight })}</td>}</For>
      </tr>}</For></tbody>
    </table>
  </div>;
}
