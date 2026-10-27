/**
 * The interim legends (plan §12 M8, D6, D27): the built-in list legend that `legend: 'auto'`
 * shows, and `createLegendTable`, both as thin views over the 0.12 legend DOM and its
 * stylesheet, injected once per document. M12b replaces the internals behind the same options.
 */
import css from '../styles/legendTable.css?inline';
import { adoptStyles, styleRootOf } from '../dom/styles';
import { fail } from '../engine/errors';
import { observeSize } from '../engine/render/surface';
import { type Companion, companions } from './companion';
import type { ChartHandle, ChartPoint, SeriesState } from './types';

// ─── Styles ──────────────────────────────────────────────────────────

/** Add the legend stylesheet to the document (or shadow root) that holds `element`, once. */
export function injectStyles(element: Element): void {
  adoptStyles(styleRootOf(element), 'legend', css);
}

// ─── Shared ──────────────────────────────────────────────────────────

/** The chart's companion: the toggle and highlight its legends drive. */
function companion(chart: ChartHandle<any>): Companion {
  const found = companions.get(chart);
  if (!found) fail('chart must be a chart created by createChart() that is not destroyed.');
  return found;
}

function setFlag(element: HTMLElement, flag: string, enabled: boolean): void {
  if (enabled) element.setAttribute(`data-${flag}`, 'true');
  else element.removeAttribute(`data-${flag}`);
}

// ─── The built-in legend ─────────────────────────────────────────────

/** Where the built-in legend sits. */
export interface LegendPlacement {
  position: 'top' | 'bottom';
}

/**
 * Mount the built-in legend (plan §5.6) at the top or bottom of the chart's root, in space the
 * layout reserves for it, so the host's own style is never touched: one `<button aria-pressed>`
 * per series, named by its label, that toggles the series and highlights it on hover or focus;
 * or, for a series coloured by category, one static item per category. Returns the unmount.
 */
export function mountLegend<Row>(
  chart: ChartHandle<Row>,
  plot: HTMLElement,
  placement: LegendPlacement,
): () => void {
  injectStyles(plot);
  const control = companion(chart);
  const root = document.createElement('div');
  root.className = 'snaplot-legend-root';
  root.dataset.snaplotLegend = '';
  root.dataset.position = placement.position;
  plot.append(root);

  // The space the legend takes: its height and a gap, kept current as it wraps.
  let reserved = -1;
  const reserve = () => {
    const height = root.getBoundingClientRect().height;
    const px = height > 0 ? Math.ceil(height + LEGEND_GAP) : 0;
    if (px === reserved) return;
    reserved = px;
    control.reserve(placement.position, px);
  };
  const unobserveSize = observeSize(root, reserve);

  /** Each item and what it last showed: a commit that changes no series writes nothing. */
  const items = new Map<
    string,
    { item: HTMLElement; dot: HTMLElement; label: HTMLElement; shows?: string }
  >();
  const item = (key: string, interactive: boolean) => {
    let entry = items.get(key);
    if (entry) return entry;
    const element = document.createElement(interactive ? 'button' : 'span');
    element.className = 'snaplot-legend-item';
    const dot = document.createElement('span');
    dot.className = 'snaplot-legend-dot';
    const label = document.createElement('span');
    label.className = 'snaplot-legend-label';
    element.append(dot, label);
    if (interactive && element instanceof HTMLButtonElement) {
      element.type = 'button';
      element.dataset.seriesId = key;
      element.addEventListener('click', () => control.toggle(key));
      element.addEventListener('mouseenter', () => control.highlight(key));
      element.addEventListener('mouseleave', () => control.highlight(null));
      element.addEventListener('focus', () => control.highlight(key));
      element.addEventListener('blur', () => control.highlight(null));
    } else element.dataset.static = '';
    entry = { item: element, dot, label };
    items.set(key, entry);
    return entry;
  };
  const show = (
    entry: { item: HTMLElement; dot: HTMLElement; label: HTMLElement; shows?: string },
    index: number,
    look: { label: string; color: string; fill?: string; mark: string; dashed: boolean },
    visible?: boolean,
  ) => {
    if (root.children[index] !== entry.item)
      root.insertBefore(entry.item, root.children[index] ?? null);
    const shows = [visible, look.label, look.color, look.fill, look.mark, look.dashed].join(
      '\u0000',
    );
    if (entry.shows === shows) return;
    entry.shows = shows;
    if (visible !== undefined) {
      // The name is the label alone; aria-pressed says whether the series shows (interact-21).
      entry.item.setAttribute('aria-pressed', String(visible));
      setFlag(entry.item, 'hidden', !visible);
    }
    entry.dot.dataset.mark = look.mark;
    entry.dot.style.color = look.color;
    entry.dot.style.borderColor = look.color;
    entry.dot.style.backgroundColor = look.fill ?? '';
    setFlag(entry.dot, 'dashed', look.dashed);
    if (entry.label.textContent !== look.label) entry.label.textContent = look.label;
  };

  const refresh = () => {
    const list = control.series();
    const categories = list.length === 1 ? control.categories() : [];
    const keys = new Set(
      categories.length > 0
        ? categories.map((category) => `category:${category.label}`)
        : list.map((series) => series.id),
    );
    for (const [key, entry] of items)
      if (!keys.has(key)) {
        entry.item.remove();
        items.delete(key);
      }
    if (categories.length > 0) {
      const mark = list[0]?.type ?? 'scatter';
      for (const [index, category] of categories.entries()) {
        show(item(`category:${category.label}`, false), index, {
          label: category.label,
          color: category.color,
          mark,
          dashed: false,
        });
      }
    } else {
      for (const [index, series] of list.entries()) {
        show(
          item(series.id, true),
          index,
          {
            label: series.label,
            color: series.color,
            fill: series.fill ?? undefined,
            mark: series.type ?? 'line',
            dashed: series.dash.length > 0,
          },
          series.visible,
        );
      }
    }
    reserve();
  };
  refresh();
  const unobserve = control.observe(refresh);
  return () => {
    unobserve();
    unobserveSize();
    root.remove();
    items.clear();
    control.reserve(placement.position, 0);
  };
}

/** The space between the legend and the plot's axis area, in CSS pixels. */
const LEGEND_GAP = 4;

// ─── The legend table ────────────────────────────────────────────────

/**
 * One column of a legend table: the series' swatch, its name, its value at the cursor, or your
 * own text from the point and the series.
 *
 * @example
 * ```ts
 * columns: ['swatch', 'name', 'value', { header: 'LR', value: (point) => String(point?.row?.lr ?? '') }]
 * ```
 */
export type LegendTableColumn<Row = Record<string, any>> =
  | 'swatch'
  | 'name'
  | 'value'
  | {
      /** The header text. */
      header: string;
      /**
       * The cell of one series: `point` is its value at the cursor (or the fallback). Text, or a
       * node (a button, a link); a node equal to the one shown is kept, so focus inside it stays.
       */
      value(point: ChartPoint<Row> | undefined, series: SeriesState): string | Node;
      /** Text alignment. @defaultValue `'left'` */
      align?: 'left' | 'right' | 'center';
    };

/** Options of {@link createLegendTable}. */
export interface LegendTableOptions<Row = Record<string, any>> {
  /** The chart the table reads. */
  chart: ChartHandle<Row>;
  /** The columns, in order. @defaultValue `['swatch', 'name', 'value']` */
  columns?: readonly LegendTableColumn<Row>[];
  /**
   * What the values show when the cursor is not over the chart: the latest or first data, or
   * nothing (the table is then hidden).
   * @defaultValue `'latest'`
   */
  fallback?: 'latest' | 'first' | 'hide';
}

/** What {@link createLegendTable} returns. */
export interface LegendTableHandle<Row = Record<string, any>> {
  /** Change the columns, the fallback or the chart. */
  update(options: Partial<LegendTableOptions<Row>>): void;
  /** Remove the table. */
  destroy(): void;
}

const DEFAULT_COLUMNS = ['swatch', 'name', 'value'] as const;

/** The companion tokens a chart sets on its host (`--snaplot-theme-*`, theme/resolve.ts). */
const THEME_VARS = [
  '--snaplot-theme-text',
  '--snaplot-theme-muted',
  '--snaplot-theme-border',
  '--snaplot-theme-hover',
  '--snaplot-theme-highlight',
  '--snaplot-theme-font-family',
  '--snaplot-theme-accent',
] as const;

/** Check the table's options as they will apply: its columns and its fallback. */
function check({ columns, fallback }: Omit<LegendTableOptions<any>, 'chart'>): void {
  if (!['latest', 'first', 'hide'].includes(fallback as string))
    fail("createLegendTable() fallback must be 'latest', 'first' or 'hide'.");
  if (!Array.isArray(columns)) fail('createLegendTable() columns must be an array.');
  columns.forEach((column, i) => {
    if (column === 'swatch' || column === 'name' || column === 'value') return;
    if (
      !column ||
      typeof column !== 'object' ||
      typeof column.header !== 'string' ||
      typeof column.value !== 'function'
    )
      fail(
        `createLegendTable() columns[${i}] must be 'swatch', 'name', 'value' or { header, value(point, series) }.`,
      );
  });
}

const HEADERS = { swatch: '', name: 'Series', value: 'Value' } as const;

/** What a column set looks like: equal shapes keep the header and the rows (an inline array). */
function shape(columns: readonly LegendTableColumn<any>[]): string {
  return columns
    .map((column) =>
      typeof column === 'string' ? column : `${column.header}|${column.align ?? ''}`,
    )
    .join('\u0000');
}

function align(column: LegendTableColumn<any>): string {
  return column === 'value' ? 'right' : typeof column === 'object' ? (column.align ?? '') : '';
}

/**
 * A table of each series' value at the cursor, in `element`: one row per series, keyed by its
 * id, refreshed on every data, option and state commit and on every cursor move. Hovering a
 * row highlights its series.
 *
 * @example
 * ```ts
 * const table = createLegendTable(document.getElementById('runs')!, {
 *   chart,
 *   columns: ['swatch', 'name', 'value'],
 * });
 * ```
 */
export function createLegendTable<Row = Record<string, any>>(
  element: HTMLElement,
  options: LegendTableOptions<Row>,
): LegendTableHandle<Row> {
  if (!element || typeof element !== 'object' || element.nodeType !== 1)
    fail('createLegendTable() needs an element to render into.');
  let current: Required<LegendTableOptions<Row>> = {
    chart: options.chart,
    columns: options.columns ?? DEFAULT_COLUMNS,
    fallback: options.fallback ?? 'latest',
  };
  check(current);
  companion(current.chart);
  injectStyles(element);

  const root = document.createElement('div');
  root.className = 'snaplot-legend-table-root';
  const step = document.createElement('div');
  step.className = 'snaplot-legend-step';
  const table = document.createElement('table');
  table.className = 'snaplot-legend-table';
  const head = document.createElement('thead');
  const body = document.createElement('tbody');
  table.append(head, body);
  root.append(step, table);
  element.append(root);

  type Line = { row: HTMLTableRowElement; cells: HTMLTableCellElement[]; shape: string };
  const rows = new Map<string, Line>();
  let unbind = () => {};

  const header = () => {
    const tr = document.createElement('tr');
    for (const column of current.columns) {
      const th = document.createElement('th');
      // The cells' classes too, so a header lines up with its column's padding and width.
      th.className = `snaplot-legend-header snaplot-legend-cell snaplot-legend-cell--${typeof column === 'string' ? column : 'custom'}`;
      th.textContent = typeof column === 'string' ? HEADERS[column] : column.header;
      if (align(column)) th.style.textAlign = align(column);
      tr.append(th);
    }
    head.replaceChildren(tr);
  };

  const cell = (
    column: LegendTableColumn<Row>,
    td: HTMLTableCellElement,
    point: ChartPoint<Row> | undefined,
    series: SeriesState,
  ) => {
    if (column === 'swatch') {
      let swatch = td.firstElementChild as HTMLElement | null;
      if (!swatch) {
        swatch = document.createElement('span');
        swatch.className = 'snaplot-legend-swatch';
        td.append(swatch);
      }
      swatch.style.background = series.color;
      return;
    }
    const content =
      column === 'name'
        ? series.label
        : column === 'value'
          ? (point?.formattedY ?? '')
          : column.value(point, series);
    if (typeof content === 'string') {
      if (td.childElementCount > 0 || td.textContent !== content) td.textContent = content;
    } else if (!(td.childNodes.length === 1 && td.firstChild?.isEqualNode(content))) {
      td.replaceChildren(content);
    }
  };

  const refresh = () => {
    const chart = current.chart;
    const control = companion(chart);
    // The table usually sits outside the chart: it carries the chart's theme tokens, so its text
    // has the chart's muted colour (a contrast the theme checked), not a translucent default.
    for (const name of THEME_VARS) {
      const value = chart.container.style.getPropertyValue(name);
      if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
    }
    const cursor = control.cursor(current.fallback);
    root.hidden = current.fallback === 'hide' && cursor.source === 'none';
    const x = cursor.points.length ? cursor.formattedX : '';
    step.textContent = [control.xTitle(), x].filter(Boolean).join(' ');
    step.hidden = !step.textContent;
    const list = control.series();
    const ids = new Set(list.map((item) => item.id));
    for (const [id, entry] of rows)
      if (!ids.has(id) || entry.shape !== shape(current.columns)) {
        entry.row.remove();
        rows.delete(id);
      }
    const points = new Map(cursor.points.map((point) => [point.seriesId, point]));
    const highlight = control.highlighted();
    list.forEach((series, index) => {
      let entry = rows.get(series.id);
      if (!entry) {
        const row = document.createElement('tr');
        row.className = 'snaplot-legend-row';
        row.dataset.seriesId = series.id;
        const cells = current.columns.map((column) => {
          const td = document.createElement('td');
          const name = typeof column === 'string' ? column : 'custom';
          td.className = `snaplot-legend-cell snaplot-legend-cell--${name}`;
          if (align(column)) td.style.textAlign = align(column);
          row.append(td);
          return td;
        });
        row.addEventListener('mouseenter', () => companion(current.chart).highlight(series.id));
        row.addEventListener('mouseleave', () => companion(current.chart).highlight(null));
        entry = { row, cells, shape: shape(current.columns) };
        rows.set(series.id, entry);
      }
      if (body.children[index] !== entry.row)
        body.insertBefore(entry.row, body.children[index] ?? null);
      entry.row.hidden = !series.visible;
      setFlag(entry.row, 'highlighted', highlight === series.id);
      setFlag(entry.row, 'dimmed', highlight !== null && highlight !== series.id);
      const point = points.get(series.id);
      for (let ci = 0; ci < current.columns.length; ci++)
        cell(current.columns[ci], entry.cells[ci], point, series);
    });
  };

  const bind = () => {
    unbind();
    const chart = current.chart;
    const offs = [companion(chart).observe(refresh), chart.on('cursor:change', refresh)];
    unbind = () => {
      for (const off of offs) off();
    };
  };

  header();
  bind();
  refresh();
  return {
    update(next) {
      const chart = next.chart ?? current.chart;
      const columns = next.columns ?? current.columns;
      const fallback = next.fallback ?? current.fallback;
      check({ columns, fallback });
      companion(chart);
      const rebind = chart !== current.chart;
      // Columns compare by shape, so an inline array (a new one each render) rebuilds nothing;
      // the latest `value` functions are read on the next refresh.
      const reheader = shape(columns) !== shape(current.columns);
      current = { chart, columns, fallback };
      if (rebind) bind();
      if (reheader) header();
      refresh();
    },
    destroy() {
      unbind();
      root.remove();
      rows.clear();
    },
  };
}
