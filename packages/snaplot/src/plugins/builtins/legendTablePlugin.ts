import type {
  Plugin,
  ChartInstance,
  CursorSnapshot,
  CursorSeriesPoint,
} from '../../types';
import {
  type LegendTableColumn,
  nameColumn,
  valueColumn,
} from './legendTableColumns';

export type { LegendTableColumn } from './legendTableColumns';

/**
 * Behavior when the cursor is not over the chart.
 * - `hide`         → table is hidden entirely
 * - `latest`       → show snapshot at the last X value
 * - `first`        → show snapshot at the first X value
 * - `series-only`  → show name/swatch rows but blank value cells and hide the step header
 *
 * `series-only` is the sensible default for dashboards, the table stays
 * in place (no layout shift) but does not show stale numbers.
 */
export type LegendTableFallback = 'hide' | 'latest' | 'first' | 'series-only';

export interface LegendTableOptions {
  /** `'top'` or `'bottom'`. Defaults to `'bottom'`. */
  position?: 'top' | 'bottom';
  /** What to show when there is no cursor. Defaults to `'series-only'`. */
  fallback?: LegendTableFallback;
  /** Show the "Step: N" header. Defaults to `true`. Hidden in `series-only` mode. */
  showStepHeader?: boolean;
  /** Format the X header value. Defaults to the X-axis tick format. */
  formatStep?: (dataX: number) => string;
  /** Columns to render. Defaults to `[nameColumn(), valueColumn()]`. */
  columns?: LegendTableColumn[];
  /** Hovering a row sets `chart.setHighlight(seriesIndex)`. Defaults to `true`. */
  highlightOnHover?: boolean;
  /** Clicking a row toggles `series.visible`. Defaults to `false`. */
  toggleVisibilityOnClick?: boolean;
  /** Optional max-height (CSS string), useful for many series. */
  maxHeight?: string;
  /** Extra class added to the root container. */
  className?: string;
}

interface RowEntry {
  tr: HTMLTableRowElement;
  cells: HTMLTableCellElement[];
}

/**
 * Per-chart state. Keying by chart lets one plugin object be spread across
 * several charts without the second install clobbering the first chart's DOM
 * refs and event handlers.
 */
interface TableState {
  chart: ChartInstance;
  container: HTMLDivElement;
  stepEl: HTMLSpanElement;
  stepLabelEl: HTMLDivElement;
  tbody: HTMLTableSectionElement;
  // Per-row cache keyed by the *series* index from config (not visible-only)
  // so cells can be shown/hidden when visibility changes.
  rowCache: Map<number, RowEntry>;
  snapshot: CursorSnapshot;
  offHandlers: Array<() => void>;
  // Inline styles we overwrite on install and restore on destroy so removing
  // the plugin doesn't leave the host container permanently flexed.
  styledParent: HTMLElement;
  styledCanvas: HTMLElement | null;
  prevParentDisplay: string;
  prevParentFlexDirection: string;
  prevCanvasFlex: string;
  prevCanvasMinHeight: string;
}

// Update a cell in place, keeping the promise that cursor:move only swaps
// text and never rewrites subtrees when the cell shape is unchanged:
//  - string content swaps textContent (value placeholder, plain columns).
//  - a single childless element (the value column's <span>) has its text
//    swapped in place when the tag matches, so no node is replaced.
//  - richer content (name/swatch cell) is only re-appended when its
//    serialized markup actually differs from what is already mounted, so a
//    steady-state cursor move touches nothing.
function placeContent(td: HTMLTableCellElement, content: string | Node) {
  if (typeof content === 'string') {
    if (td.childElementCount > 0 || td.textContent !== content) {
      td.textContent = content;
    }
    return;
  }

  const existing = td.firstElementChild;
  if (
    content instanceof HTMLElement &&
    content.childElementCount === 0 &&
    existing instanceof HTMLElement &&
    td.childNodes.length === 1 &&
    existing.tagName === content.tagName &&
    existing.childElementCount === 0 &&
    existing.getAttribute('style') === content.getAttribute('style')
  ) {
    if (existing.textContent !== content.textContent) {
      existing.textContent = content.textContent;
    }
    return;
  }

  if (
    content instanceof Element &&
    existing instanceof Element &&
    td.childNodes.length === 1 &&
    existing.outerHTML === content.outerHTML
  ) {
    return;
  }

  td.textContent = '';
  td.appendChild(content);
}

/**
 * Cursor-synchronised legend table plugin.
 *
 * Performance:
 * - Rows are built once per `data:update` (cached `<tr>` + `<td>` refs).
 * - `cursor:move` only swaps `textContent` on value cells and the step
 *   header, no `innerHTML` rewrites in the hot path.
 * - The snapshot is read into a single reused buffer.
 */
export function createLegendTablePlugin(options: LegendTableOptions = {}): Plugin {
  const fallbackMode = options.fallback ?? 'series-only';
  const position = options.position ?? 'bottom';
  const showStepHeader = options.showStepHeader ?? true;
  const highlightOnHover = options.highlightOnHover ?? true;
  const toggleOnClick = options.toggleVisibilityOnClick ?? false;
  const columns = options.columns ?? [nameColumn(), valueColumn()];

  // Snapshot fallback for the actual buffer fill, `series-only`
  // resolves to `latest` so we still get series rows, but we'll
  // blank value cells in render.
  const bufferFallback: 'hide' | 'latest' | 'first' =
    fallbackMode === 'series-only' ? 'latest' : fallbackMode;

  const states = new Map<ChartInstance, TableState>();

  function rebuildRows(state: TableState) {
    const { chart, tbody, rowCache } = state;
    const series = chart.getOptions().series;

    // Drop cached rows that no longer correspond to a series.
    for (const key of Array.from(rowCache.keys())) {
      if (key >= series.length) {
        rowCache.get(key)?.tr.remove();
        rowCache.delete(key);
      }
    }
    tbody.textContent = '';

    series.forEach((s, si) => {
      if (s.visible === false) return;

      // Listeners are attached exactly once, inside this `if (!entry)` branch.
      // On every subsequent rebuild the cached <tr> is reused, so we do NOT
      // re-add hover/click handlers, avoiding listener accumulation on
      // repeated `data:update` emissions.
      let entry = rowCache.get(si);
      if (!entry) {
        const tr = document.createElement('tr');
        tr.className = 'snaplot-legend-row';
        tr.dataset.seriesIndex = String(si);

        const cells = columns.map((col) => {
          const td = document.createElement('td');
          td.className = `snaplot-legend-cell snaplot-legend-cell--${col.key}`;
          if (col.align) td.style.textAlign = col.align;
          if (col.width) td.style.width = col.width;
          tr.appendChild(td);
          return td;
        });

        if (highlightOnHover) {
          tr.addEventListener('mouseenter', () => chart.setHighlight(si));
          tr.addEventListener('mouseleave', () => chart.setHighlight(null));
        }
        if (toggleOnClick) {
          tr.style.cursor = 'pointer';
          tr.addEventListener('click', () => {
            const cfg = chart.getOptions();
            const visible = cfg.series[si].visible !== false;
            chart.setOptions({
              series: cfg.series.map((sc, i) =>
                i === si ? { ...sc, visible: !visible } : sc,
              ),
            });
            // setOptions does not emit data:update, so refresh the table by hand.
            rebuildRows(state);
            refreshCells(state);
          });
        }

        entry = { tr, cells };
        rowCache.set(si, entry);
      }

      tbody.appendChild(entry.tr);
    });

    // Apply current highlight (e.g. coming back after a re-mount)
    applyHighlightAttr(state, chart.getHighlight());
  }

  function applyHighlightAttr(state: TableState, highlightedIdx: number | null) {
    state.rowCache.forEach((entry, si) => {
      if (highlightedIdx === null) {
        entry.tr.removeAttribute('data-highlighted');
        entry.tr.removeAttribute('data-dimmed');
      } else if (si === highlightedIdx) {
        entry.tr.setAttribute('data-highlighted', 'true');
        entry.tr.removeAttribute('data-dimmed');
      } else {
        entry.tr.removeAttribute('data-highlighted');
        entry.tr.setAttribute('data-dimmed', 'true');
      }
    });
  }

  function refreshCells(state: TableState) {
    const { chart, container, snapshot, rowCache, stepEl, stepLabelEl } = state;

    chart.getCursorSnapshotInto(snapshot, { fallback: bufferFallback });
    const isCursor = snapshot.source === 'cursor';
    const seriesOnly = !isCursor && fallbackMode === 'series-only';

    // Hide entirely if fallback is 'hide' and source is 'none'
    if (snapshot.source === 'none' && fallbackMode === 'hide') {
      container.style.display = 'none';
      return;
    }
    container.style.display = '';

    // Step header, the slot is always reserved when `showStepHeader` is
    // true so cursor enter/leave doesn't jolt the chart layout. Only the
    // value's visibility flips, keeping the row height constant.
    const hasValue = snapshot.source === 'cursor' && snapshot.dataX !== null;
    stepLabelEl.style.display = showStepHeader ? '' : 'none';
    if (hasValue) {
      stepEl.style.visibility = 'visible';
      stepEl.textContent = options.formatStep
        ? options.formatStep(snapshot.dataX!)
        : snapshot.formattedX;
    } else {
      // Non-breaking space keeps the line-height stable across states.
      stepEl.style.visibility = 'hidden';
      stepEl.textContent = '\u00a0';
    }

    // Index points by series index for O(1) lookup per row.
    const pointBySeries = new Map<number, CursorSeriesPoint>();
    for (const p of snapshot.points) pointBySeries.set(p.seriesIndex, p);

    const seriesList = chart.getOptions().series;
    rowCache.forEach((entry, si) => {
      const series = seriesList[si];
      if (!series) return;
      const point = pointBySeries.get(si);
      if (!point) {
        // Snapshot has no row for this series (e.g. data cleared → source
        // 'none'). Blank the value cells so stale numbers don't linger; leave
        // static columns (name/swatch) as last rendered.
        columns.forEach((col, ci) => {
          if (col.key === 'value') entry.cells[ci].textContent = '';
        });
        return;
      }

      columns.forEach((col, ci) => {
        const td = entry.cells[ci];
        // In series-only mode, blank the value column.
        if (seriesOnly && col.key === 'value') {
          td.textContent = '';
          return;
        }
        placeContent(td, col.cell(point, series));
      });
    });
  }

  return {
    id: 'builtin:legend-table',

    install(chart: ChartInstance) {
      const parent = chart.container;
      if (!parent) return;

      // Make the parent a flex column so legend and canvas share space.
      const prevParentDisplay = parent.style.display;
      const prevParentFlexDirection = parent.style.flexDirection;
      parent.style.display = 'flex';
      parent.style.flexDirection = 'column';
      const canvasContainer = parent.firstElementChild as HTMLElement | null;
      let prevCanvasFlex = '';
      let prevCanvasMinHeight = '';
      if (canvasContainer) {
        prevCanvasFlex = canvasContainer.style.flex;
        prevCanvasMinHeight = canvasContainer.style.minHeight;
        canvasContainer.style.flex = '1';
        canvasContainer.style.minHeight = '0';
      }

      const container = document.createElement('div');
      container.className = 'snaplot-legend-table-root';
      if (options.className) container.className += ' ' + options.className;
      container.style.cssText = `
        flex-shrink: 0;
        padding: 8px 12px;
        font-size: 12px;
        line-height: 1.4;
        ${options.maxHeight ? `max-height:${options.maxHeight};overflow:auto;` : ''}
      `;

      // Step header row. `min-height` reserves space for the line so the
      // chart doesn't reflow when the cursor leaves and the value blanks.
      const stepLabelEl = document.createElement('div');
      stepLabelEl.className = 'snaplot-legend-step';
      stepLabelEl.style.cssText = 'margin-bottom:6px;font-size:11px;opacity:0.75;min-height:16px;';
      const stepLabelText = document.createElement('span');
      stepLabelText.textContent = 'Step: ';
      const stepEl = document.createElement('span');
      stepEl.style.fontWeight = '600';
      stepEl.style.fontVariantNumeric = 'tabular-nums';
      stepLabelEl.appendChild(stepLabelText);
      stepLabelEl.appendChild(stepEl);
      container.appendChild(stepLabelEl);

      // Table
      const table = document.createElement('table');
      table.className = 'snaplot-legend-table';
      table.style.cssText = 'width:100%;border-collapse:collapse;';

      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      columns.forEach((col) => {
        const th = document.createElement('th');
        th.textContent = col.header;
        th.className = `snaplot-legend-header snaplot-legend-header--${col.key}`;
        th.style.cssText = `
          font-weight: 400;
          font-size: 11px;
          opacity: 0.6;
          text-align: ${col.align ?? 'left'};
          padding: 0 8px 4px 0;
        `;
        if (col.title) th.title = col.title;
        if (col.width) th.style.width = col.width;
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);

      const tbody = document.createElement('tbody');
      table.appendChild(thead);
      table.appendChild(tbody);
      container.appendChild(table);

      if (position === 'top') parent.insertBefore(container, parent.firstChild);
      else parent.appendChild(container);

      const state: TableState = {
        chart,
        container,
        stepEl,
        stepLabelEl,
        tbody,
        rowCache: new Map(),
        snapshot: {
          dataIndex: null,
          dataX: null,
          formattedX: '',
          points: [],
          source: 'none',
          activeSeriesIndex: null,
        },
        offHandlers: [],
        styledParent: parent,
        styledCanvas: canvasContainer,
        prevParentDisplay,
        prevParentFlexDirection,
        prevCanvasFlex,
        prevCanvasMinHeight,
      };
      states.set(chart, state);

      rebuildRows(state);
      refreshCells(state);

      // Subscribe to events.
      state.offHandlers.push(chart.on('cursor:move', () => refreshCells(state)));
      // Data updates only change values, refresh cells, don't rebuild
      // the row list. Rebuilding wipes <tr>s under the cursor/mouse at
      // streaming tick rates, which swallows clicks and hovers.
      state.offHandlers.push(chart.on('data:update', () => refreshCells(state)));
      state.offHandlers.push(
        chart.on('highlight:change', (idx) => applyHighlightAttr(state, idx)),
      );
    },

    // Series added/removed/visibility flipped, rebuild row list, then
    // reflow values.
    onSetOptions(chart: ChartInstance) {
      const state = states.get(chart);
      if (!state) return;
      rebuildRows(state);
      refreshCells(state);
    },

    destroy(chart: ChartInstance) {
      const state = states.get(chart);
      if (!state) return;
      for (const off of state.offHandlers) off();
      state.offHandlers.length = 0;
      state.container.remove();
      state.styledParent.style.display = state.prevParentDisplay;
      state.styledParent.style.flexDirection = state.prevParentFlexDirection;
      if (state.styledCanvas) {
        state.styledCanvas.style.flex = state.prevCanvasFlex;
        state.styledCanvas.style.minHeight = state.prevCanvasMinHeight;
      }
      state.rowCache.clear();
      states.delete(chart);
    },
  };
}
