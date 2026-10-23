import type {
  ChartConfig as EngineConfig,
  AxisConfig as EngineAxis,
  SeriesConfig as EngineSeries,
  CursorConfig,
  ZoomConfig,
  HighlightConfig,
  ThemeConfig,
  ScaleRange,
  SelectionRange,
  ChartStats,
  Layout,
  CursorSnapshotOptions,
  ScatterColorEncoding,
  ScatterSizeEncoding,
  ScatterTooltipField,
} from '../types';
import type { HistogramBins } from '../utils/histogram';

export type Field<Row, Value> = string extends keyof Row
  ? string
  : Extract<
      {
        [K in keyof Row]-?: NonNullable<Row[K]> extends Value ? K : never;
      }[keyof Row],
      string
    >;
export type Accessor<Row, Value> = Field<Row, Value> | ((row: Row, index: number) => Value);
export type AxisValue = number | Date | string;
export type RowId = string | number;
export interface ColumnData {
  columns: Record<string, Float64Array>;
  rowIds?: readonly RowId[];
}
export type DataSource<Row> = readonly Row[] | ColumnData | HistogramBins;
export type Viewport = Record<string, ScaleRange>;

export interface AxisOptions
  extends Omit<EngineAxis, 'type' | 'label' | 'nice' | 'padding' | 'tickFormat'> {
  type?: 'linear' | 'log' | 'time' | 'category';
  title?: string;
  roundBounds?: boolean;
  rangePadding?: number;
  /** Numbers include epoch milliseconds; category axes supply their labels. */
  format?(value: number | string): string;
  /** Authoritative category order, including slots without observations. */
  categories?: readonly string[];
}

type Numeric<Row> = Accessor<Row, number | null | undefined>;
export type ColorEncoding<Row> =
  | Accessor<Row, number | string | null | undefined>
  | (Omit<ScatterColorEncoding, 'dataIndex' | 'categoryValues'> & {
      field: Accessor<Row, number | string | null | undefined>;
    });
export type SizeEncoding<Row> =
  | Numeric<Row>
  | (Omit<ScatterSizeEncoding, 'dataIndex'> & { field: Numeric<Row> });
export type TooltipField<Row> =
  | Accessor<Row, number | string | null | undefined>
  | (Omit<ScatterTooltipField, 'dataIndex'> & {
      field: Accessor<Row, number | string | null | undefined>;
    });

export interface SeriesBase<Row>
  extends Omit<
    EngineSeries,
    | 'type'
    | 'label'
    | 'dataIndex'
    | 'xDataIndex'
    | 'yDataIndex'
    | 'upperDataIndex'
    | 'lowerDataIndex'
    | 'xAxisKey'
    | 'yAxisKey'
    | 'colorBy'
    | 'sizeBy'
    | 'tooltipFields'
    | 'fill'
    | 'visible'
    | 'heatmap'
  > {
  /** Inferred from a unique Y field; required for computed or ambiguous series. */
  id?: string;
  label?: string;
  data?: DataSource<Row>;
  x?: Accessor<Row, AxisValue>;
  rowId?: Accessor<Row, RowId>;
  xAxis?: string;
  yAxis?: string;
  format?: (value: number, point?: ChartPoint<Row>) => string;
  fill?: string | null | ((value: number, rowIndex: number, row?: Row) => string);
}
export type SeriesOptions<Row> =
  | (SeriesBase<Row> & { type?: 'line' | 'area' | 'bar'; y: Numeric<Row> })
  | (SeriesBase<Row> & { type: 'band'; y: Numeric<Row>; lower: Numeric<Row>; upper: Numeric<Row> })
  | (SeriesBase<Row> & {
      type: 'scatter';
      y: Numeric<Row>;
      colorBy?: ColorEncoding<Row>;
      sizeBy?: SizeEncoding<Row>;
      tooltipFields?: readonly TooltipField<Row>[];
    })
  | (SeriesBase<Row> & { type: 'histogram'; id: string; data: HistogramBins });

export interface ReferenceLine {
  axis: string;
  value: AxisValue;
  label?: string;
  color?: string;
  dash?: number[];
  lineWidth?: number;
}
export interface ReferenceRegion {
  axis: string;
  from: AxisValue;
  to: AxisValue;
  label?: string;
  fill?: string;
  opacity?: number;
  edges?: boolean;
  edgeColor?: string;
  edgeDash?: number[];
}

export interface ChartPoint<Row = Record<string, unknown>> {
  seriesId: string;
  label: string;
  row?: Row;
  rowIndex: number;
  rowId?: RowId;
  x: number | string;
  /** Histogram bin interval, in numeric axis units. */
  xRange?: ScaleRange;
  y: number;
  radius?: number;
  fields?: readonly { label: string; value: number | string; formatted: string }[];
  formattedX: string;
  formattedY: string;
  color: string;
  meta?: unknown;
}
export interface CursorSnapshot<Row = Record<string, unknown>> {
  x: number | string | null;
  formattedX: string;
  points: readonly ChartPoint<Row>[];
  source: 'cursor' | 'latest' | 'first' | 'none';
  activeSeriesId: string | null;
}
export interface LegendItem {
  id: string;
  label: string;
  type: EngineSeries['type'];
  color: string;
  fill: string | null;
  visible: boolean;
  lineDash: number[];
  opacity: number;
  meta?: unknown;
}
export interface ChartState<Row = Record<string, unknown>> {
  viewport: Viewport;
  selection: SelectionRange | null;
  hiddenSeries: readonly string[];
  highlightedSeries: string | null;
  following: boolean;
  cursor: CursorSnapshot<Row>;
}
export interface SelectionResult<Row = Record<string, unknown>> extends SelectionRange {
  points?: readonly ChartPoint<Row>[];
}
export interface ChartEvents<Row = Record<string, unknown>> {
  'state:change': ChartState<Row>;
  'cursor:change': CursorSnapshot<Row>;
  'viewport:change': Viewport;
  'selection:change': SelectionRange | null;
  'visibility:change': readonly string[];
  'highlight:change': string | null;
  'follow:change': boolean;
  'point:click': ChartPoint<Row>;
  select: SelectionResult<Row>;
  'data:update': undefined;
  'options:update': ChartOptions<Row>;
  'theme:update': ThemeConfig;
  resize: { width: number; height: number };
}
export interface ChartPlugin<Row = Record<string, unknown>> {
  id: string;
  install?(chart: ChartHandle<Row>): void;
  destroy?(chart: ChartHandle<Row>): void;
  beforeDraw?(chart: ChartHandle<Row>): boolean | void;
  afterDrawGrid?(chart: ChartHandle<Row>, context: CanvasRenderingContext2D): void;
  afterDrawData?(chart: ChartHandle<Row>, context: CanvasRenderingContext2D): void;
  afterDrawOverlay?(chart: ChartHandle<Row>, context: CanvasRenderingContext2D): void;
  onDataUpdate?(chart: ChartHandle<Row>): void;
  onOptionsUpdate?(chart: ChartHandle<Row>): void;
}
export interface ChartOptions<Row = Record<string, unknown>>
  extends Omit<
    EngineConfig,
    | 'series'
    | 'axes'
    | 'streaming'
    | 'plugins'
    | 'highlight'
    | 'selection'
    | 'tooltip'
    | 'cursor'
    | 'zoom'
  > {
  data?: DataSource<Row>;
  x?: Accessor<Row, AxisValue>;
  rowId?: Accessor<Row, RowId>;
  series: readonly SeriesOptions<Row>[];
  axes?: Record<string, AxisOptions>;
  streaming?: { maxPoints?: number; followWindow?: number };
  referenceLines?: readonly ReferenceLine[];
  referenceRegions?: readonly ReferenceRegion[];
  plugins?: readonly ChartPlugin<Row>[];
  group?: ChartGroup;
  cursor?: CursorConfig;
  zoom?: ZoomConfig;
  highlight?: HighlightConfig;
  selection?: Omit<NonNullable<EngineConfig['selection']>, 'onSelect' | 'onBrush'>;
  tooltip?: Omit<
    NonNullable<EngineConfig['tooltip']>,
    'yFormat' | 'rangeFormat' | 'render' | 'xFormat'
  > & {
    xFormat?(value: number | string): string;
    /** Strings are rendered as HTML; use a DOM node with textContent for untrusted values. */
    render?: (points: readonly ChartPoint<Row>[]) => string | HTMLElement;
    yFormat?: (value: number, seriesId: string) => string;
    rangeFormat?: (min: number, max: number, seriesId: string) => string;
  };
  /** Accessible name; no visual chart title is added. */
  ariaLabel?: string;
  onPointClick?: (point: ChartPoint<Row>) => void;
  onSelect?: (selection: SelectionResult<Row>) => void;
}
type OptionPatch<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? T
    : T extends object
      ? { [K in keyof T]?: OptionPatch<T[K]> | undefined }
      : T;
export type ChartPatch<Row> = {
  [K in keyof ChartOptions<Row>]?: K extends 'data' | 'series' | 'plugins' | 'group'
    ? ChartOptions<Row>[K]
    : OptionPatch<ChartOptions<Row>[K]>;
};
export interface AppendOptions {
  seriesId?: string;
  updateLast?: boolean;
}
export interface ChartHandle<Row = Record<string, unknown>> {
  readonly container: HTMLElement;
  update(patch: ChartPatch<Row>): void;
  appendData(data: DataSource<Row>, options?: AppendOptions): void;
  getOptions(): Readonly<ChartOptions<Row>>;
  getState(): ChartState<Row>;
  subscribe(listener: () => void): () => void;
  on<K extends keyof ChartEvents<Row>>(
    event: K,
    listener: (value: ChartEvents<Row>[K]) => void,
  ): () => void;
  setViewport(viewport: Viewport): void;
  resetViewport(): void;
  resumeFollow(): void;
  setSelection(selection: SelectionRange | null): void;
  setSeriesVisible(id: string, visible: boolean): void;
  setHighlight(id: string | null): void;
  setCursor(x: number | string | null): void;
  getCursorSnapshot(options?: CursorSnapshotOptions): CursorSnapshot<Row>;
  getLegendItems(): LegendItem[];
  getTheme(): ThemeConfig;
  getLayout(): Layout;
  getStats(): ChartStats;
  getAxis(key: string): Readonly<ScaleRange & { type: string }> | undefined;
  refreshTheme(): void;
  resize(width: number, height: number): void;
  redraw(): void;
  destroy(): void;
}
export interface ChartGroupOptions {
  cursor?: boolean;
  highlight?: boolean;
  viewport?: boolean;
  yRange?: boolean;
  yAxis?: string;
  alignPlots?: boolean;
}
export interface ChartGroup {
  readonly options: Readonly<ChartGroupOptions>;
  setCursor(value: number | string | null): void;
  setHighlight(id: string | null): void;
  destroy(): void;
}
