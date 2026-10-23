import type { ChartPoint, SeriesOptions, ChartHandle, ChartPlugin, LegendItem } from './types';

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
 * Generic in `Row` so `application rows remain typed in cell renderers.
 */
export interface LegendTableColumn<Row = Record<string, any>> {
  /** Stable key, used for keying the row's cells. */
  key: string;
  /** Header text. Pass empty string for unlabeled columns (e.g. swatch). */
  header: string;
  /** Cell renderer. Receives the snapshot row + the series config. */
  cell: (point: ChartPoint<Row>, series: SeriesOptions<Row>) => LegendCellContent;
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
export function swatchColumn<Row = Record<string, any>>(
  opts: { size?: number; shape?: 'dot' | 'bar' } = {},
): LegendTableColumn<Row> {
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
export function nameColumn<Row = Record<string, any>>(
  opts: { swatch?: boolean; truncate?: number } = {},
): LegendTableColumn<Row> {
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
export function valueColumn<Row = Record<string, any>>(
  opts: {
    format?: (value: number, point: ChartPoint<Row>) => string;
    placeholder?: string;
    align?: 'left' | 'right' | 'center';
    header?: string;
  } = {},
): LegendTableColumn<Row> {
  const fmt = opts.format;
  const placeholder = opts.placeholder ?? '\u2014';

  return {
    key: 'value',
    header: opts.header ?? 'Value',
    align: opts.align ?? 'right',
    cell: (p) => {
      if (p.y !== p.y || p.formattedY === '') return placeholder;
      const span = document.createElement('span');
      span.style.fontVariantNumeric = 'tabular-nums';
      span.textContent = fmt ? fmt(p.y, p) : p.formattedY;
      return span;
    },
  };
}

/**
 * A "Metric" column, for ML dashboards where every series shows the
 * same metric (e.g. "eval/accuracy"), or each series carries its own
 * metric key in `meta`. Caller supplies the resolver.
 */
export function metricColumn<Row = Record<string, any>>(
  resolve: (point: ChartPoint<Row>, series: SeriesOptions<Row>) => string,
  opts: { header?: string; truncate?: number } = {},
): LegendTableColumn<Row> {
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
export function column<Row = Record<string, any>>(
  spec: LegendTableColumn<Row>,
): LegendTableColumn<Row> {
  return spec;
}

/** Where a legend plugin mounts. */
export interface LegendPluginOptions {
  /** Above or below the chart. @defaultValue `'bottom'` */
  position?: 'top' | 'bottom';
  /** Mount outside the chart without changing its layout. */
  container?: HTMLElement;
}

/** Options of {@link createLegendTablePlugin}. */
export interface LegendTableOptions<Row = Record<string, any>> extends LegendPluginOptions {
  /** What the rows show when the cursor is not over the chart. @defaultValue `'series-only'` */
  fallback?: 'hide' | 'latest' | 'first' | 'series-only';
  /** Show the X value above the rows. @defaultValue `true` */
  showStepHeader?: boolean;
  /** How the X value in the header is written. @defaultValue the X axis format */
  formatStep?: (value: number | string) => string;
  /** The columns. @defaultValue name and value */
  columns?: readonly LegendTableColumn<Row>[];
  /** Highlight a series while its row is hovered. @defaultValue `true` */
  highlightOnHover?: boolean;
  /** Show or hide a series when its row is clicked. @defaultValue `true` */
  toggleVisibilityOnClick?: boolean;
  /** A CSS max-height; the table scrolls beyond it. @defaultValue no limit */
  maxHeight?: string;
  /** Extra class names on the table root. @defaultValue none */
  className?: string;
}

interface MountStyle {
  users: number;
  display: string;
  direction: string;
  canvas: HTMLElement | null;
  flex: string;
  minHeight: string;
}
const mounts = new WeakMap<HTMLElement, MountStyle>();

function mount<Row>(
  chart: ChartHandle<Row>,
  root: HTMLElement,
  options: LegendPluginOptions,
): () => void {
  const parent = options.container ?? chart.container;
  if (!options.container) {
    let state = mounts.get(parent);
    if (!state) {
      const canvas = parent.firstElementChild as HTMLElement | null;
      state = {
        users: 0,
        display: parent.style.display,
        direction: parent.style.flexDirection,
        canvas,
        flex: canvas?.style.flex ?? '',
        minHeight: canvas?.style.minHeight ?? '',
      };
      mounts.set(parent, state);
      parent.style.display = 'flex';
      parent.style.flexDirection = 'column';
      if (canvas) {
        canvas.style.flex = '1';
        canvas.style.minHeight = '0';
      }
    }
    state.users++;
  }
  if (options.position === 'top') parent.insertBefore(root, parent.firstChild);
  else parent.appendChild(root);
  return () => {
    root.remove();
    if (options.container) return;
    const state = mounts.get(parent);
    if (!state || --state.users > 0) return;
    parent.style.display = state.display;
    parent.style.flexDirection = state.direction;
    if (state.canvas) {
      state.canvas.style.flex = state.flex;
      state.canvas.style.minHeight = state.minHeight;
    }
    mounts.delete(parent);
  };
}

function setFlag(element: HTMLElement, flag: string, enabled: boolean): void {
  if (enabled) element.setAttribute(`data-${flag}`, 'true');
  else element.removeAttribute(`data-${flag}`);
}

/** Accessible, ID-based toggles using the same legend classes as the framework companions. */
export function createLegendPlugin<Row = Record<string, any>>(
  options: LegendPluginOptions = {},
): ChartPlugin<Row> {
  const states = new Map<ChartHandle<Row>, () => void>();
  return {
    id: 'builtin:legend',
    install(chart) {
      states.get(chart)?.();
      const root = document.createElement('div');
      root.className = 'snaplot-legend-root';
      const unmount = mount(chart, root, options);
      const buttons = new Map<
        string,
        { button: HTMLButtonElement; dot: HTMLElement; label: HTMLElement }
      >();
      const refresh = () => {
        const items = chart.getLegendItems();
        const ids = new Set(items.map((item) => item.id));
        for (const [id, entry] of buttons)
          if (!ids.has(id)) {
            entry.button.remove();
            buttons.delete(id);
          }
        items.forEach((item, index) => {
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
            button.addEventListener('click', () => {
              const current = chart.getLegendItems().find((candidate) => candidate.id === item.id);
              if (current) chart.setSeriesVisible(item.id, !current.visible);
            });
            entry = { button, dot, label };
            buttons.set(item.id, entry);
          }
          const { button, dot, label } = entry;
          if (root.children[index] !== button)
            root.insertBefore(button, root.children[index] ?? null);
          setFlag(button, 'hidden', !item.visible);
          button.setAttribute('aria-label', `Toggle ${item.label} ${item.visible ? 'off' : 'on'}`);
          button.setAttribute('aria-pressed', String(item.visible));
          dot.dataset.mark = item.type ?? 'line';
          dot.style.color = item.color;
          dot.style.borderColor = item.color;
          dot.style.backgroundColor = item.fill ?? '';
          dot.style.opacity = String(item.opacity);
          setFlag(dot, 'dashed', item.lineDash.length > 0);
          if (label.textContent !== item.label) label.textContent = item.label;
        });
      };
      refresh();
      const unsubscribe = chart.subscribe(refresh);
      const offTheme = chart.on('theme:update', refresh);
      states.set(chart, () => {
        unsubscribe();
        offTheme();
        unmount();
        buttons.clear();
      });
    },
    destroy(chart) {
      states.get(chart)?.();
      states.delete(chart);
    },
  };
}

function placeContent(cell: HTMLElement, content: LegendCellContent): void {
  if (typeof content === 'string') {
    if (cell.childElementCount || cell.textContent !== content) cell.textContent = content;
    return;
  }
  if (cell.firstChild === content && cell.childNodes.length === 1) return;
  const existing = cell.firstElementChild;
  // Built-in static name and swatch nodes need no replacement on cursor moves.
  if (
    content instanceof Element &&
    existing &&
    cell.childNodes.length === 1 &&
    existing.isEqualNode(content)
  )
    return;
  if (
    content instanceof HTMLElement &&
    existing instanceof HTMLElement &&
    cell.childNodes.length === 1 &&
    content.childElementCount === 0 &&
    existing.childElementCount === 0 &&
    content.tagName === existing.tagName &&
    content.getAttribute('style') === existing.getAttribute('style')
  ) {
    existing.textContent = content.textContent;
    return;
  }
  cell.replaceChildren(content);
}

function emptyPoint<Row>(item: LegendItem): ChartPoint<Row> {
  return {
    seriesId: item.id,
    label: item.label,
    rowIndex: -1,
    x: 0,
    y: Number.NaN,
    formattedX: '',
    formattedY: '',
    color: item.color,
    meta: item.meta,
  };
}

/** Cursor-synchronised table with stable ID-keyed DOM rows and text-safe custom cells. */
export function createLegendTablePlugin<Row = Record<string, any>>(
  options: LegendTableOptions<Row> = {},
): ChartPlugin<Row> {
  const states = new Map<ChartHandle<Row>, () => void>();
  const columns = options.columns ?? [nameColumn<Row>(), valueColumn<Row>()];
  if (new Set(columns.map((item) => item.key)).size !== columns.length)
    throw new Error('Snaplot: legend table column keys must be unique.');
  const fallback = options.fallback ?? 'series-only';
  return {
    id: 'builtin:legend-table',
    install(chart) {
      states.get(chart)?.();
      const root = document.createElement('div');
      root.className = `snaplot-legend-table-root${options.className ? ` ${options.className}` : ''}`;
      root.style.cssText = 'flex-shrink:0;padding:8px 12px;font-size:12px;line-height:1.4;';
      if (options.maxHeight) {
        root.style.maxHeight = options.maxHeight;
        root.style.overflow = 'auto';
      }
      const stepLabel = document.createElement('div');
      stepLabel.className = 'snaplot-legend-step';
      stepLabel.style.cssText = 'margin-bottom:6px;font-size:11px;opacity:0.75;min-height:16px;';
      const step = document.createElement('span');
      step.style.cssText = 'font-weight:600;font-variant-numeric:tabular-nums;';
      stepLabel.append('Step: ', step);
      root.append(stepLabel);
      const table = document.createElement('table');
      table.className = 'snaplot-legend-table';
      table.style.cssText = 'width:100%;border-collapse:collapse;';
      const head = document.createElement('thead');
      const header = document.createElement('tr');
      columns.forEach((col) => {
        const th = document.createElement('th');
        th.textContent = col.header;
        th.className = `snaplot-legend-header snaplot-legend-header--${col.key}`;
        th.style.cssText = `font-weight:400;font-size:11px;opacity:0.6;text-align:${col.align ?? 'left'};padding:0 8px 4px 0;`;
        if (col.width) th.style.width = col.width;
        if (col.title) th.title = col.title;
        header.append(th);
      });
      head.append(header);
      const body = document.createElement('tbody');
      table.append(head, body);
      root.append(table);
      const unmount = mount(chart, root, options);
      const rows = new Map<string, { row: HTMLTableRowElement; cells: HTMLTableCellElement[] }>();
      const refresh = () => {
        const snapshot = chart.getCursorSnapshot({
          fallback: fallback === 'series-only' ? 'latest' : fallback,
        });
        root.style.display = fallback === 'hide' && snapshot.source === 'none' ? 'none' : '';
        stepLabel.style.display = options.showStepHeader === false ? 'none' : '';
        const hasStep = snapshot.source === 'cursor' && snapshot.x !== null;
        step.style.visibility = hasStep ? 'visible' : 'hidden';
        step.textContent = hasStep
          ? (options.formatStep?.(snapshot.x!) ?? snapshot.formattedX)
          : '\u00a0';
        const items = chart.getLegendItems();
        const ids = new Set(items.map((item) => item.id));
        const points = new Map(snapshot.points.map((point) => [point.seriesId, point]));
        const highlighted = chart.getState().highlightedSeries;
        const specs = chart.getOptions().series;
        for (const [id, entry] of rows)
          if (!ids.has(id)) {
            entry.row.remove();
            rows.delete(id);
          }
        items.forEach((item, index) => {
          let entry = rows.get(item.id);
          if (!entry) {
            const row = document.createElement('tr');
            row.className = 'snaplot-legend-row';
            row.dataset.seriesId = item.id;
            const cells = columns.map((col) => {
              const td = document.createElement('td');
              td.className = `snaplot-legend-cell snaplot-legend-cell--${col.key}`;
              if (col.align) td.style.textAlign = col.align;
              if (col.width) td.style.width = col.width;
              row.append(td);
              return td;
            });
            if (options.highlightOnHover !== false) {
              row.addEventListener('mouseenter', () => chart.setHighlight(item.id));
              row.addEventListener('mouseleave', () => chart.setHighlight(null));
              row.addEventListener('focus', () => chart.setHighlight(item.id));
              row.addEventListener('blur', () => chart.setHighlight(null));
            }
            if (options.toggleVisibilityOnClick) {
              row.tabIndex = 0;
              row.setAttribute('role', 'button');
              row.style.cursor = 'pointer';
              const toggle = () => {
                const current = chart
                  .getLegendItems()
                  .find((candidate) => candidate.id === item.id);
                if (current) chart.setSeriesVisible(item.id, !current.visible);
              };
              row.addEventListener('click', toggle);
              row.addEventListener('keydown', (event) => {
                if (event.key === ' ' || event.key === 'Enter') {
                  event.preventDefault();
                  toggle();
                }
              });
            }
            entry = { row, cells };
            rows.set(item.id, entry);
          }
          if (body.children[index] !== entry.row)
            body.insertBefore(entry.row, body.children[index] ?? null);
          entry.row.style.display = item.visible ? '' : 'none';
          if (options.toggleVisibilityOnClick)
            entry.row.setAttribute(
              'aria-label',
              `Toggle ${item.label} ${item.visible ? 'off' : 'on'}`,
            );
          setFlag(entry.row, 'highlighted', highlighted === item.id);
          setFlag(entry.row, 'dimmed', highlighted !== null && highlighted !== item.id);
          const point = points.get(item.id) ?? emptyPoint<Row>(item);
          columns.forEach((col, ci) => {
            const blank =
              col.key === 'value' && fallback === 'series-only' && snapshot.source !== 'cursor';
            placeContent(entry!.cells[ci], blank ? '' : col.cell(point, specs[index]));
          });
        });
      };
      refresh();
      const unsubscribe = chart.subscribe(refresh);
      const offTheme = chart.on('theme:update', refresh);
      states.set(chart, () => {
        unsubscribe();
        offTheme();
        unmount();
        rows.clear();
      });
    },
    destroy(chart) {
      states.get(chart)?.();
      states.delete(chart);
    },
  };
}
