import type {
  ChartHandle,
  ChartOptions,
  ChartState,
  ViewportRanges,
  SeriesState,
  ChartPoint,
  SelectionRange,
} from '../public/types';

/**
 * Options the framework components take as controlled props instead (see
 * {@link ChartControls}).
 */
export type ControlledOptionKeys =
  | 'viewport'
  | 'selection'
  | 'hiddenSeries'
  | 'onViewportChange'
  | 'onSelectionChange'
  | 'onHiddenSeriesChange';

/** Controlled values are authoritative; defaults are applied only at mount. */
export interface ChartControls {
  /** The host's accessible name. @defaultValue `ariaLabel`, else `'Chart'` */
  'aria-label'?: string;
  /** Ids of elements that describe the chart. @defaultValue none */
  'aria-describedby'?: string;
  /** Ids of elements that name the chart. @defaultValue none */
  'aria-labelledby'?: string;
  /** Controlled axis ranges: gestures propose changes through `onViewportChange`. @defaultValue uncontrolled */
  viewport?: ViewportRanges;
  /** Axis ranges applied once at mount. @defaultValue automatic */
  defaultViewport?: ViewportRanges;
  /** Called with proposed axis ranges. */
  onViewportChange?: (viewport: ViewportRanges) => void;
  /** The controlled selection. @defaultValue uncontrolled */
  selectionState?: SelectionRange | null;
  /** A selection applied once at mount. @defaultValue none */
  defaultSelection?: SelectionRange | null;
  /** Called with a proposed selection. */
  onSelectionChange?: (selection: SelectionRange | null) => void;
  /** The controlled hidden series ids. @defaultValue uncontrolled */
  hiddenSeries?: readonly string[];
  /** Series hidden once at mount. @defaultValue none */
  defaultHiddenSeries?: readonly string[];
  /** Called with proposed hidden series ids. */
  onHiddenSeriesChange?: (ids: readonly string[]) => void;
}
export const wrapperKeys = new Set([
  'class',
  'className',
  'style',
  'ref',
  'onReady',
  'viewport',
  'defaultViewport',
  'onViewportChange',
  'selectionState',
  'defaultSelection',
  'onSelectionChange',
  'hiddenSeries',
  'defaultHiddenSeries',
  'onHiddenSeriesChange',
]);
export function chartOptions<Row>(
  props: Omit<ChartOptions<Row>, ControlledOptionKeys> & ChartControls,
): ChartOptions<Row> {
  return {
    ...Object.fromEntries(
      Object.entries(props).filter(([key]) => !wrapperKeys.has(key) && !key.startsWith('aria-')),
    ),
    ariaLabel: props['aria-label'] ?? props.ariaLabel ?? 'Chart',
  } as unknown as ChartOptions<Row>;
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
  if (props.viewport === undefined && props.defaultViewport)
    chart.setViewport(props.defaultViewport);
  if (props.selectionState === undefined && props.defaultSelection !== undefined)
    chart.setSelection(props.defaultSelection);
  if (props.hiddenSeries === undefined && props.defaultHiddenSeries) {
    for (const item of chart.getLegendItems())
      chart.setSeriesVisible(item.id, !props.defaultHiddenSeries.includes(item.id));
  }
}
/** What a legend table shows when the cursor is not over the chart. */
export type LegendTableFallback = 'hide' | 'latest' | 'first' | 'series-only';
export function legendPoint<Row>(
  item: SeriesState,
  state: ChartState<Row> | undefined,
  point: ChartPoint<Row> | undefined,
  fallback: LegendTableFallback,
): ChartPoint<Row> {
  const base = point ?? {
    seriesId: item.id,
    label: item.label,
    rowIndex: -1,
    x: Number.NaN,
    y: Number.NaN,
    formattedX: '',
    formattedY: '',
    color: item.color,
  };
  return fallback === 'series-only' && state?.cursor.source !== 'cursor'
    ? { ...base, y: Number.NaN, formattedY: '' }
    : base;
}
