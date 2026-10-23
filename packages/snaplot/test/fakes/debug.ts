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
  /** Axis labels of the last grid paint, in paint order. */
  labelBoxes(): DebugLabelBox[];
}

export const DEBUG_SYMBOL = Symbol.for('snaplot.debug');

export function debug(chart: object): DebugSnapshot {
  const snapshot = (chart as Record<symbol, DebugSnapshot | undefined>)[DEBUG_SYMBOL];
  if (!snapshot) throw new Error('debug(): this chart exposes no Symbol.for("snaplot.debug")');
  return snapshot;
}
