import type { CursorSeriesPoint, SeriesConfig } from '../../types';

/**
 * Cell content returned by a column. The plugin treats `string` as
 * text (set as `textContent` for safety + perf), and `HTMLElement` /
 * `Node` as DOM to insert. The Solid `<LegendTable>` accepts JSX too.
 */
export type LegendCellContent = string | Node;

/**
 * One column in the legend table. The plugin renders the header from
 * `header`, the cell from `cell(point, series)`. `align` controls
 * `text-align`; `width` is forwarded to the `<td>` style.
 *
 * Generic in `TMeta` so `point.meta` and `series.meta` are typed when
 * the chart was constructed with a `ChartConfig<TMeta>`.
 */
export interface LegendTableColumn<TMeta = unknown> {
  /** Stable key, used for keying the row's cells. */
  key: string;
  /** Header text. Pass empty string for unlabeled columns (e.g. swatch). */
  header: string;
  /** Cell renderer. Receives the snapshot row + the series config. */
  cell: (
    point: CursorSeriesPoint<TMeta>,
    series: SeriesConfig<TMeta>,
  ) => LegendCellContent;
  /** Optional text alignment. Defaults to `'left'`. */
  align?: 'left' | 'right' | 'center';
  /** Optional fixed/min width (CSS string). */
  width?: string;
  /** Header `title` tooltip. */
  title?: string;
}

// ─── Pre-built column factories ─────────────────────────────────

/**
 * A small color swatch matching the series color. Useful when paired
 * with a `nameColumn` that should not include its own dot.
 */
export function swatchColumn<TMeta = unknown>(
  opts: { size?: number; shape?: 'dot' | 'bar' } = {},
): LegendTableColumn<TMeta> {
  const size = opts.size ?? 10;
  const shape = opts.shape ?? 'dot';

  return {
    key: 'swatch',
    header: '',
    width: `${size + 4}px`,
    cell: (p) => {
      const span = document.createElement('span');
      span.className = 'snaplot-legend-swatch';
      span.style.cssText = `
        display: inline-block;
        width: ${size}px;
        height: ${shape === 'dot' ? size : Math.max(2, Math.round(size * 0.4))}px;
        ${shape === 'dot' ? 'border-radius: 50%;' : 'border-radius: 1px;'}
        background: ${p.color};
        flex-shrink: 0;
      `;
      return span;
    },
  };
}

/**
 * Series name. By default includes a leading swatch dot (matches the
 * typical ML-dashboard look), so you usually want this OR `swatchColumn`, not both.
 */
export function nameColumn<TMeta = unknown>(
  opts: { swatch?: boolean; truncate?: number } = {},
): LegendTableColumn<TMeta> {
  const showSwatch = opts.swatch ?? true;
  const truncate = opts.truncate ?? 160;

  return {
    key: 'name',
    header: 'Name',
    cell: (p) => {
      const wrap = document.createElement('span');
      wrap.style.cssText = `display:inline-flex;align-items:center;gap:6px;max-width:${truncate}px;`;
      if (showSwatch) {
        const dot = document.createElement('span');
        dot.className = 'snaplot-legend-swatch';
        dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${p.color};flex-shrink:0;`;
        wrap.appendChild(dot);
      }
      const label = document.createElement('span');
      label.textContent = p.label;
      label.title = p.label;
      label.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      wrap.appendChild(label);
      return wrap;
    },
  };
}

/**
 * The current value at the cursor. Right-aligned and tabular-numeric
 * by default. Pass a custom `format` for precision/units; pass
 * `placeholder` for what to show when the snapshot is in `series-only`
 * fallback (default: `'—'`).
 */
export function valueColumn<TMeta = unknown>(
  opts: {
    format?: (value: number, point: CursorSeriesPoint<TMeta>) => string;
    placeholder?: string;
    align?: 'left' | 'right' | 'center';
    header?: string;
  } = {},
): LegendTableColumn<TMeta> {
  const fmt = opts.format;
  const placeholder = opts.placeholder ?? '\u2014';

  return {
    key: 'value',
    header: opts.header ?? 'Value',
    align: opts.align ?? 'right',
    cell: (p) => {
      if (p.value !== p.value || p.formattedValue === '') return placeholder;
      const span = document.createElement('span');
      span.style.fontVariantNumeric = 'tabular-nums';
      span.textContent = fmt ? fmt(p.value, p) : p.formattedValue;
      return span;
    },
  };
}

/**
 * A "Metric" column, for ML dashboards where every series shows the
 * same metric (e.g. "eval/accuracy"), or each series carries its own
 * metric key in `meta`. Caller supplies the resolver.
 */
export function metricColumn<TMeta = unknown>(
  resolve: (point: CursorSeriesPoint<TMeta>, series: SeriesConfig<TMeta>) => string,
  opts: { header?: string; truncate?: number } = {},
): LegendTableColumn<TMeta> {
  const truncate = opts.truncate ?? 160;
  return {
    key: 'metric',
    header: opts.header ?? 'Metric',
    cell: (p, s) => {
      const span = document.createElement('span');
      span.style.cssText = `display:inline-block;max-width:${truncate}px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
      const text = resolve(p, s);
      span.textContent = text;
      span.title = text;
      return span;
    },
  };
}

/**
 * Generic escape hatch for one-off columns. Mostly here to give the
 * `import { column } from 'snaplot'` ergonomic an obvious entry point.
 */
export function column<TMeta = unknown>(
  spec: LegendTableColumn<TMeta>,
): LegendTableColumn<TMeta> {
  return spec;
}
