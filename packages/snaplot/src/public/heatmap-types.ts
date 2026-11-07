/**
 * The public types of the heatmap series: its bins, its grid, its colours and its colour scale.
 * Like `./types.ts`, written by hand and never derived from the engine (plan §4, P4); `./types.ts`
 * re-exports them.
 */
import type { Accessor, AxisValue, NumberFormat, RowId } from './types';

/**
 * The cells along one axis of a heatmap: a regular step from the first cell's centre, the cells'
 * centres, or their edges. Dates are read as epoch milliseconds.
 *
 * Cells given by centres reach half way to their neighbours; a step more than 1.75 times the
 * steps beside it is a gap, drawn empty rather than bridged by stretched cells.
 *
 * @example
 * ```ts
 * { start: 2404, step: 1, count: 75 } // 2404, 2405, … 2478 MHz
 * { centers: [0.5, 1, 2, 4, 8] }       // irregular centres
 * { edges: [0, 10, 20, 50, 100] }      // four cells between five edges
 * ```
 */
export type HeatmapBins =
  | {
      /** The centre of the first cell. */
      start: number | Date;
      /** The distance between centres, which is each cell's width. */
      step: number;
      /** The number of cells. */
      count: number;
    }
  | {
      /** Each cell's centre, ascending. */
      centers: ArrayLike<number | Date>;
    }
  | {
      /** The cells' edges, ascending: one more than there are cells. */
      edges: ArrayLike<number | Date>;
    };

/**
 * A grid of values for a heatmap, as {@link histogram2d} returns it: the cells along X and Y and
 * one value per cell, row by row from the lowest Y. `null` and `NaN` are empty cells.
 */
export interface HeatmapGrid {
  /** The cells along X. */
  x: HeatmapBins;
  /** The cells along Y. */
  y: HeatmapBins;
  /** One value per cell: the cell in X column `i` and Y row `j` at `j × (X cells) + i`. */
  values: ArrayLike<number | null>;
}

/**
 * A heatmap's colours: a ramp of the theme (`'sequential'` for magnitudes, `'diverging'` for signed
 * values around zero, `'cyclic'` for phases and angles), or your own stops, low to high.
 */
export type ColorMap = 'sequential' | 'diverging' | 'cyclic' | readonly string[];

/** A heatmap's colour scale: a bar of its colours with ticks, beside the plot. */
export interface ColorScaleOptions {
  /** The title along the bar: a quantity or a unit. @defaultValue no title */
  title?: string;
  /** The tick values. @defaultValue round values across the domain */
  ticks?: readonly number[];
  /** How tick labels are written. @defaultValue the series `format`, else automatic */
  format?: NumberFormat;
}

/** Options every heatmap shares, however it reads its values. */
interface HeatmapCommon {
  /** The name shown in the tooltip. @defaultValue the `values` field name, else the id */
  label?: string;
  /** The key of the horizontal axis. @defaultValue `'x'` */
  xAxis?: string;
  /** The key of the vertical axis. @defaultValue `'y'` */
  yAxis?: string;
  /** The colours values map to. @defaultValue `'sequential'` */
  colors?: ColorMap;
  /**
   * The values at the low and high ends of the colours.
   * @defaultValue the extent of the values, symmetric about zero for `'diverging'`
   */
  domain?: readonly [number, number];
  /**
   * Values past the domain take the end colours; `false` leaves them undrawn. `'cyclic'` colours
   * wrap instead, as an angle does.
   * @defaultValue `true`
   */
  clamp?: boolean;
  /**
   * The colour of an empty cell: a `null`, `undefined` or `NaN` value, such as a channel that was
   * never measured. A cell that is not in the grid at all is not drawn.
   * @defaultValue a faint tint of the theme's muted colour
   */
  emptyColor?: string;
  /** The colour scale beside the plot: `false` hides it. @defaultValue `true` */
  colorScale?: boolean | ColorScaleOptions;
  /** Opacity from 0 to 1. @defaultValue `1` */
  opacity?: number;
  /** How values are written in the tooltip and the colour scale. @defaultValue automatic */
  format?: NumberFormat;
}

/**
 * A heatmap whose rows each hold a line of cells: a spectrogram, a waterfall. Each row's `values`
 * fill the cells across `bins`; the row's position runs along X (the chart's `x`, each row a column
 * of cells) or, with `y`, up the plot (each row a row of cells). `appendData` adds rows, and
 * `streaming.maxPoints` keeps the latest.
 *
 * @example
 * ```ts
 * // A waterfall: one row of 75 channels per procedure, newest at the top.
 * { type: 'heatmap', y: 'time', values: 'magnitude', bins: { start: 2404, step: 1, count: 75 } }
 * // A spectrogram: one column of frequency bins per frame.
 * { type: 'heatmap', values: 'power', bins: { start: 0, step: 43.07, count: 512 } }
 * ```
 */
export interface HeatmapSeriesOptions<Row> extends HeatmapCommon {
  /** The mark. */
  type: 'heatmap';
  /**
   * The series id. @defaultValue the `values` field name; required when `values` is a function
   */
  id?: string;
  /**
   * Each row's cells, in the order of `bins`: an array or typed array. `null`, `undefined` and
   * `NaN` are empty cells; a short array leaves its last cells empty.
   */
  values: Accessor<Row, ArrayLike<number | null | undefined> | null | undefined>;
  /** The cells across each row. */
  bins: HeatmapBins;
  /** Each row's horizontal position, when it differs from the chart's `x`. @defaultValue the chart's `x` */
  x?: Accessor<Row, AxisValue>;
  /**
   * Each row's vertical position: the rows run up the plot and the bins across it, as in a
   * waterfall. @defaultValue the rows run along X
   */
  y?: Accessor<Row, AxisValue>;
  /** This series' row id, when it differs from the chart's `rowId`. @defaultValue the chart's `rowId` */
  rowId?: Accessor<Row, RowId>;
}

/** A heatmap of a {@link HeatmapGrid}: a 2D histogram from {@link histogram2d}, or any matrix. */
export interface HeatmapGridSeriesOptions extends HeatmapCommon {
  /** The mark. */
  type: 'heatmap';
  /** The series id (a grid has no field to name it after). */
  id: string;
  /** The grid. */
  data: HeatmapGrid;
  /** A grid holds its own cells. */
  values?: undefined;
  /** A grid holds its own cells. */
  bins?: undefined;
}
