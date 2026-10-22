import type { ChartHandle, ChartOptions, ChartState, Viewport, LegendItem, ChartPoint } from '../api/types';
import type { SelectionRange } from '../types';

/** Controlled values are authoritative; defaults are applied only at mount. */
export interface ChartControls {
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-labelledby'?: string;
  viewport?: Viewport;
  defaultViewport?: Viewport;
  onViewportChange?: (viewport: Viewport) => void;
  selectionState?: SelectionRange | null;
  defaultSelection?: SelectionRange | null;
  onSelectionChange?: (selection: SelectionRange | null) => void;
  hiddenSeries?: readonly string[];
  defaultHiddenSeries?: readonly string[];
  onHiddenSeriesChange?: (ids: readonly string[]) => void;
}
export const wrapperKeys = new Set([
  'class', 'className', 'style', 'ref', 'onReady', 'viewport', 'defaultViewport',
  'onViewportChange', 'selectionState', 'defaultSelection', 'onSelectionChange',
  'hiddenSeries', 'defaultHiddenSeries', 'onHiddenSeriesChange',
]);
export function chartOptions<Row>(props: ChartOptions<Row> & ChartControls): ChartOptions<Row> {
  return { ...Object.fromEntries(Object.entries(props).filter(([key]) => !wrapperKeys.has(key) && !key.startsWith('aria-'))), ariaLabel: props['aria-label'] ?? props.ariaLabel ?? 'Chart' } as unknown as ChartOptions<Row>;
}
export function chartControls(props: ChartControls) {
  return {
    ...(props.viewport === undefined ? {} : { viewport: props.viewport }),
    ...(props.selectionState === undefined ? {} : { selection: props.selectionState }),
    ...(props.hiddenSeries === undefined ? {} : { hiddenSeries: props.hiddenSeries }),
    onViewportChange: props.onViewportChange,
    onSelectionChange: props.onSelectionChange,
    onHiddenSeriesChange: props.onHiddenSeriesChange,
  };
}
export function applyDefaults<Row>(chart: ChartHandle<Row>, props: ChartControls): void {
  if (props.viewport === undefined && props.defaultViewport) chart.setViewport(props.defaultViewport);
  if (props.selectionState === undefined && props.defaultSelection !== undefined) chart.setSelection(props.defaultSelection);
  if (props.hiddenSeries === undefined && props.defaultHiddenSeries) {
    for (const item of chart.getLegendItems()) chart.setSeriesVisible(item.id, !props.defaultHiddenSeries.includes(item.id));
  }
}
export type LegendTableFallback = 'hide' | 'latest' | 'first' | 'series-only';
export function legendPoint<Row>(item: LegendItem, state: ChartState<Row> | undefined, point: ChartPoint<Row> | undefined, fallback: LegendTableFallback): ChartPoint<Row> {
  const base = point ?? { seriesId: item.id, label: item.label, rowIndex: -1, x: Number.NaN, y: Number.NaN, formattedX: '', formattedY: '', color: item.color, meta: item.meta };
  return fallback === 'series-only' && state?.cursor.source !== 'cursor' ? { ...base, y: Number.NaN, formattedY: '' } : base;
}
