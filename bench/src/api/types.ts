// The bench's own chart vocabulary. Scenarios describe a chart once, as a `ChartSpec`, and drive
// it through `BenchChart`; each API adapter (v012, v1, v2) translates both into its snaplot
// version's public API. This keeps one set of scenarios comparable across releases, and keeps the
// scenarios independent of the library's types, which the overhaul changes (M7, M8).

import type { Columns, Row } from '../data';

export type { Columns, Row };
export type ApiVersion = 'v012' | 'v1' | 'v2';

/** Thrown when an API cannot express a scenario; the result reports it as n/a. */
export class Unsupported extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'Unsupported';
  }
}

export interface SeriesSpec {
  /** Series id; also its label. */
  id: string;
  type: 'line' | 'scatter';
  /** Y field. */
  y: string;
  /** X field when it differs from the chart's X (off-axis scatter). */
  x?: string;
  colorBy?: string;
  sizeBy?: string;
  /** Density (heatmap) rendering for scatter. */
  density?: boolean;
  /** An independent source for this series (multi-source charts). */
  data?: Columns;
}

export interface ChartSpec {
  /** Typed columns, or rows for the row-ingest scenarios. */
  data: Columns | Row[];
  /** X field. */
  x: string;
  xType: 'time' | 'linear';
  series: SeriesSpec[];
  /** Ring-buffer window for streaming. */
  maxPoints?: number;
  yTitle?: string;
  /** A pinned Y range. */
  yRange?: [number, number];
  /** An add-on that changes the streaming path: a no-op plugin, the list legend or the legend table. */
  addon?: 'noop' | 'legend' | 'legendtable';
  group?: BenchGroup;
  /** One-finger drag pans (touch). */
  touchPan?: boolean;
  onPointClick?: () => unknown;
}

export interface PatchSpec {
  yTitle?: string;
  onPointClick?: () => unknown;
}

export interface PlotRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Renders {
  grid: number;
  data: number;
  overlay: number;
}

/** The D31 debug symbol's counters (`ovh-m1-done` and later). */
export interface DebugCounts {
  ingestCount: number;
  materializeCount: number;
  drawnPoints: number;
  inViewPoints: number;
  renderCount: Renders;
  /** The plot rectangle from the canvases' top-left corner (1.0's debug symbol). */
  plot?: PlotRect;
}

export interface BenchChart {
  readonly el: HTMLElement;
  /** The version's own chart object. */
  readonly raw: unknown;
  setX(min: number, max: number): void;
  xRange(): { min: number; max: number } | null;
  /** The plot rectangle in CSS pixels, relative to the chart container. */
  plot(): PlotRect;
  /** Appends typed columns to the chart (or to one series' source). */
  append(columns: Columns, seriesId?: string): void;
  highlight(seriesId: string | null): void;
  redraw(): void;
  update(patch: PatchSpec): void;
  /** Rows retained after streaming, when the version can tell. */
  retained(): number | null;
  renders(): Renders;
  /** Full data ingests so far, or `null` when the version does not count them. */
  ingests(): number | null;
  /** Ring materializations so far, or `null` when not counted. */
  materializations(): number | null;
  /** Debug counters, or `null` for versions without the debug symbol. */
  debug(): DebugCounts | null;
  destroy(): void;
}

export interface BenchGroup {
  readonly raw: unknown;
  destroy(): void;
}

export interface ReactSpec {
  rows: Row[];
  x: string;
  xType: 'time' | 'linear';
  series: { id: string; y: string }[];
  /**
   * `stable`: memoised props. `inline`: a fresh series literal, axes literal and `onPointClick`
   * closure on every render, as most React code writes them (plan §4.2: "inline is fine").
   */
  variant: 'stable' | 'inline';
  height: number;
}

export interface ReactHarness {
  /** Re-renders the parent synchronously (flushSync). */
  rerender(tick: number): void;
  chart(): BenchChart;
  unmount(): void;
}

export interface BenchApi {
  readonly version: ApiVersion;
  mount(el: HTMLElement, spec: ChartSpec): BenchChart;
  group(options: { alignPlots?: boolean }): BenchGroup;
  /** Mounts the version's React component, when it has one. */
  react(host: HTMLElement, spec: ReactSpec): Promise<ReactHarness>;
}
