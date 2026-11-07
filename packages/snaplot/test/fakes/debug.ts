/**
 * Reads the untyped debug symbol (plan D31) off a public chart handle. The
 * type lives here, on the test side, because the symbol is not public API.
 * Each call is a point-in-time snapshot: read again after acting.
 */

export interface DebugLabelBox {
  axis: string;
  kind: 'tick' | 'title';
  text: string;
  /** Anchor point in CSS pixels (not a measured box until M10). */
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
}

export interface DebugSnapshot {
  /** Full data ingests: the initial data and every data replacement. Appends do not count. */
  readonly ingestCount: number;
  /** Per-layer paint counts. */
  readonly renderCount: { grid: number; data: number; overlay: number };
  /** The canvas layers. */
  readonly layers: { grid: HTMLCanvasElement; data: HTMLCanvasElement; overlay: HTMLCanvasElement };
  /** Points the last data pass drew inside the viewport (after decimation or sampling). */
  readonly drawnPoints: number;
  /** Points inside the viewport in the last data pass. */
  readonly inViewPoints: number;
  /** Ring-store logical materializations. */
  readonly materializeCount: number;
  /** The plot rectangle in CSS pixels from the canvases' top-left corner (M8). */
  readonly plot: { left: number; top: number; width: number; height: number };
  /** The last layout: canvas size, plot and each axis' side (M8; replaces getLayout()). */
  readonly layout: {
    width: number;
    height: number;
    plot: { left: number; top: number; width: number; height: number };
    axes: Record<string, { position: 'top' | 'bottom' | 'left' | 'right' }>;
    dpr: number;
  };
  /** The resolved theme roles (M8; replaces getTheme()). */
  readonly theme: Readonly<Record<string, unknown>> & {
    backgroundColor: string;
    textColor: string;
  };
  /** Axis labels of the last grid paint, in paint order. */
  labelBoxes(): DebugLabelBox[];
  /** Heatmap bitmaps drawn from the data. */
  readonly heatmapRasters: number;
}

export const DEBUG_SYMBOL = Symbol.for('snaplot.debug');

export function debug(chart: object): DebugSnapshot {
  const snapshot = (chart as Record<symbol, DebugSnapshot | undefined>)[DEBUG_SYMBOL];
  if (!snapshot) throw new Error('debug(): this chart exposes no Symbol.for("snaplot.debug")');
  return snapshot;
}
