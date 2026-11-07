/**
 * The shape `normalize()` returns (split from normalize.ts, which re-exports it): options checked,
 * defaulted and split into engine options, series, axes, annotations, state and callbacks.
 */
import type { AxisSpec, ChartSpec, HeatmapSpec, SelectionRange, SeriesSpec } from '../engine/spec';
import type { AXIS_TYPES, CallbackKey } from './option-keys';
import type {
  ChartGroup,
  ChartOptions,
  ChartPlugin,
  ChartPoint,
  DataSource,
  SeriesType,
} from './types';

/** A field read by a function or by name, as series and encodings give it. */
export type AccessorLike = string | ((row: any, index: number) => unknown);

/** A colour, size or tooltip encoding: its field and the engine options it carries. */
export interface NormalizedEncoding {
  field: AccessorLike;
  options: Record<string, unknown>;
}

/** One series, validated, with its style already in engine terms. */
export interface NormalizedSeries {
  index: number;
  id: string;
  label: string;
  type: SeriesType;
  /** The series' own data, by reference. */
  data?: DataSource<unknown>;
  x?: AccessorLike;
  y?: AccessorLike;
  lower?: AccessorLike;
  upper?: AccessorLike;
  rowId?: AccessorLike;
  xAxis: string;
  yAxis: string;
  /** Engine style fields: colour, dash, widths, opacity, interpolation, fill, render mode. */
  spec: Partial<SeriesSpec>;
  /** A colour per bar or point, from its value, row and original row index. */
  pointColor?: (value: number, row: unknown, index: number) => string;
  /** The series readout format. */
  format?: (value: number, point?: ChartPoint<any>) => string;
  colorBy?: NormalizedEncoding;
  sizeBy?: NormalizedEncoding;
  tooltipFields?: NormalizedEncoding[];
  /** A heatmap's values field, grid and colours. */
  heatmap?: NormalizedHeatmap;
}

/** Cells along one axis, checked: their spans, positions, and whether they were given as Dates. */
export interface NormalizedBins {
  lo: Float64Array;
  hi: Float64Array;
  mid: Float64Array;
  dates: boolean;
}

/** A heatmap series' own options, checked. */
export interface NormalizedHeatmap {
  /** The axis its rows run along (a grid's run along X). */
  rows: 'x' | 'y';
  /** Each row's values (rows form). */
  values?: AccessorLike;
  /** The cells across each row (rows form). */
  bins?: NormalizedBins;
  /** A grid's cells and values (grid form). */
  grid?: { x: NormalizedBins; y: NormalizedBins; values: ArrayLike<number | null> };
  colors: HeatmapSpec['colors'];
  domain?: readonly [number, number];
  clamp: boolean;
  emptyColor?: string;
  colorScale: HeatmapSpec['colorScale'];
}

/** One axis: the kind the caller asked for, its categories and its engine fields. */
export interface NormalizedAxis {
  type?: (typeof AXIS_TYPES)[number];
  categories?: string[];
  /** The engine fields; ingest adds the type and the category geometry. */
  spec: AxisSpec;
}

/** A reference line or region with engine field names (values resolved by ingest). */
export interface NormalizedLine {
  axis: string;
  value: unknown;
  label?: string;
  color?: string;
  dash?: number[];
  lineWidth?: number;
}
export interface NormalizedRegion {
  axis: string;
  from: unknown;
  to: unknown;
  label?: string;
  fill?: string;
  opacity?: number;
  edges?: boolean;
  edgeColor?: string;
  edgeDash?: number[];
}

/** The state options an options object names (plan D3). */
export interface NormalizedState {
  viewport?: Record<string, { min: number; max: number }>;
  selection?: SelectionRange | null;
  hiddenSeries?: string[];
  highlight?: string | null;
}

/** normalize()'s result. */
export interface NormalizedOptions<Row> {
  /** The intake copy of the options, as the caller wrote them. */
  options: ChartOptions<Row>;
  data?: DataSource<Row>;
  x?: AccessorLike;
  rowId?: AccessorLike;
  series: NormalizedSeries[];
  axes: Record<string, NormalizedAxis>;
  /** Engine options other than series, axes and plugins. */
  engine: Omit<ChartSpec, 'series' | 'axes' | 'plugins'>;
  tooltip: {
    render?: (points: readonly ChartPoint<Row>[]) => string | Node;
  };
  referenceLines: NormalizedLine[];
  referenceRegions: NormalizedRegion[];
  plugins: ChartPlugin<Row>[];
  group?: ChartGroup;
  ariaLabel?: string;
  state: NormalizedState;
  callbacks: Partial<Record<CallbackKey, (value: never) => void>>;
}
