/**
 * The interim legends (plan §12 M8, D6, D27): the built-in list legend that `legend: 'auto'`
 * shows, and `createLegendTable`, both as thin views over the 0.12 legend DOM and its
 * stylesheet, injected once per document. M12b replaces the internals behind the same options.
 */
import css from '../styles/legendTable.css?inline';
import { fail } from '../engine/errors';
import { type Companion, companions } from './companion';
import type { ChartHandle, ChartPoint, SeriesState } from './types';

// ─── Styles ──────────────────────────────────────────────────────────

const styled = new WeakMap<Node, HTMLStyleElement>();

/** Add the legend stylesheet to the document (or shadow root) that holds `element`, once. */
export function injectStyles(element: Element): void {
  const root = element.getRootNode();
  if (styled.get(root)?.isConnected) return;
  const shadow = typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot;
  const parent = shadow ? root : element.ownerDocument.head;
  if (!parent) return;
  const style = element.ownerDocument.createElement('style');
  style.dataset.snaplotStyles = '';
  style.textContent = css;
  parent.append(style);
  styled.set(root, style);
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
 * Mount the built-in legend in the chart's container, above or below `plot` (the engine's
 * root): one `<button aria-pressed>` per series; a click toggles the series and a hover or focus
 * highlights it. Returns the unmount function.
 */
export function mountLegend<Row>(
  chart: ChartHandle<Row>,
  plot: HTMLElement,
  placement: LegendPlacement,
): () => void {
  const parent = chart.container;
  injectStyles(parent);
  const root = document.createElement('div');
  root.className = 'snaplot-legend-root';
  root.dataset.snaplotLegend = '';
  const restore = {
    display: parent.style.display,
    direction: parent.style.flexDirection,
    flex: plot.style.flex,
    minHeight: plot.style.minHeight,
  };
  parent.style.display = 'flex';
  parent.style.flexDirection = 'column';
  plot.style.flex = '1';
  plot.style.minHeight = '0';
  if (placement.position === 'top') parent.insertBefore(root, plot);
  else plot.after(root);

  const control = companion(chart);
  /** Each series' button and what it last showed: a commit that changes no series writes nothing. */
  const buttons = new Map<
    string,
    { button: HTMLButtonElement; dot: HTMLElement; label: HTMLElement; shows?: string }
  >();
  const refresh = () => {
    const list = control.series();
    const ids = new Set(list.map((item) => item.id));
    for (const [id, entry] of buttons)
      if (!ids.has(id)) {
        entry.button.remove();
        buttons.delete(id);
      }
    list.forEach((item, index) => {
      let entry = buttons.get(item.id);
      if (!entry) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'snaplot-legend-item';
        button.dataset.seriesId = item.id;
        const dot = document.createElement('span');
        dot.className = 'snaplot-legend-dot';
        const label = document.createElement('span');
        label.className = 'snaplot-legend-label';
        button.append(dot, label);
        button.addEventListener('click', () => control.toggle(item.id));
        button.addEventListener('mouseenter', () => control.highlight(item.id));
        button.addEventListener('mouseleave', () => control.highlight(null));
        button.addEventListener('focus', () => control.highlight(item.id));
        button.addEventListener('blur', () => control.highlight(null));
        entry = { button, dot, label };
        buttons.set(item.id, entry);
      }
      const { button, dot, label } = entry;
      if (root.children[index] !== button) root.insertBefore(button, root.children[index] ?? null);
      const shows = [
        item.visible,
        item.label,
        item.color,
        item.fill ?? '',
        item.opacity,
        item.type ?? 'line',
        item.dash.length > 0,
      ].join('\u0000');
      if (entry.shows === shows) return;
      entry.shows = shows;
      setFlag(button, 'hidden', !item.visible);
      button.setAttribute('aria-label', `Toggle ${item.label} ${item.visible ? 'off' : 'on'}`);
      button.setAttribute('aria-pressed', String(item.visible));
      dot.dataset.mark = item.type ?? 'line';
      dot.style.color = item.color;
      dot.style.borderColor = item.color;
      dot.style.backgroundColor = item.fill ?? '';
      dot.style.opacity = String(item.opacity);
      setFlag(dot, 'dashed', item.dash.length > 0);
      if (label.textContent !== item.label) label.textContent = item.label;
    });
  };
  refresh();
  const unobserve = control.observe(refresh);
  return () => {
    unobserve();
    root.remove();
    buttons.clear();
    parent.style.display = restore.display;
    parent.style.flexDirection = restore.direction;
    plot.style.flex = restore.flex;
    plot.style.minHeight = restore.minHeight;
  };
}

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
      /** The cell text of one series: `point` is its value at the cursor (or the fallback). */
      value(point: ChartPoint<Row> | undefined, series: SeriesState): string;
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

function checkColumns(columns: unknown): void {
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
  checkColumns(current.columns);
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

  type Line = { row: HTMLTableRowElement; cells: HTMLTableCellElement[]; columns: unknown };
  const rows = new Map<string, Line>();
  let unbind = () => {};

  const header = () => {
    const tr = document.createElement('tr');
    for (const column of current.columns) {
      const th = document.createElement('th');
      th.className = 'snaplot-legend-header';
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
    const text =
      column === 'name'
        ? series.label
        : column === 'value'
          ? (point?.formattedY ?? '')
          : column.value(point, series);
    if (td.textContent !== text) td.textContent = text;
  };

  const refresh = () => {
    const chart = current.chart;
    const control = companion(chart);
    const cursor = control.cursor(current.fallback);
    root.hidden = current.fallback === 'hide' && cursor.source === 'none';
    const x = cursor.points.length ? cursor.formattedX : '';
    step.textContent = [control.xTitle(), x].filter(Boolean).join(' ');
    step.hidden = !step.textContent;
    const list = control.series();
    const ids = new Set(list.map((item) => item.id));
    for (const [id, entry] of rows)
      if (!ids.has(id) || entry.columns !== current.columns) {
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
        entry = { row, cells, columns: current.columns };
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
      checkColumns(columns);
      companion(chart);
      const rebind = chart !== current.chart;
      const reheader = columns !== current.columns;
      current = { chart, columns, fallback: next.fallback ?? current.fallback };
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
