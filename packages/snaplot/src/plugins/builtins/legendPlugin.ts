import type { Plugin, ChartInstance } from '../../types';

/**
 * Built-in DOM legend plugin.
 * Creates a clickable legend above or below the chart.
 * Click a series name to toggle its visibility.
 *
 * Styling lives in `snaplot/legend-table.css`, import that stylesheet
 * once in your app entry to pick up the default look (rounded pill on
 * hover, subtle dimmed state for hidden series, touch-friendly tap
 * targets). Every element carries a `snaplot-legend-*` class for
 * consumers that want to override individual bits without fighting
 * specificity.
 */
interface LegendState {
  container: HTMLDivElement;
  // Inline styles we overwrite on install and must restore on destroy so
  // removing the plugin (setOptions rebuilds plugins) doesn't leave the host
  // container permanently flexed.
  styledParent: HTMLElement;
  styledCanvas: HTMLElement | null;
  prevParentDisplay: string;
  prevParentFlexDirection: string;
  prevCanvasFlex: string;
  prevCanvasMinHeight: string;
  offTheme: () => void;
}

export function createLegendPlugin(options?: {
  position?: 'top' | 'bottom';
}): Plugin {
  // State is keyed per chart so a single plugin object spread across several
  // charts doesn't overwrite the first chart's DOM refs on the second install.
  const states = new Map<ChartInstance, LegendState>();

  return {
    id: 'builtin:legend',

    install(chart: ChartInstance) {
      const parent = chart.container;
      if (!parent) return;

      // Make the parent a flex column so legend and canvas share space
      const prevParentDisplay = parent.style.display;
      const prevParentFlexDirection = parent.style.flexDirection;
      parent.style.display = 'flex';
      parent.style.flexDirection = 'column';

      // The CanvasManager's container (first child) should fill remaining space
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
      container.className = 'snaplot-legend-root';

      const pos = options?.position ?? 'bottom';
      if (pos === 'top') {
        parent.insertBefore(container, parent.firstChild);
      } else {
        parent.appendChild(container);
      }

      const state: LegendState = {
        container,
        styledParent: parent,
        styledCanvas: canvasContainer,
        prevParentDisplay,
        prevParentFlexDirection,
        prevCanvasFlex,
        prevCanvasMinHeight,
        offTheme: () => {},
      };
      state.offTheme = chart.on('theme:update', () => renderItems(chart, container));
      states.set(chart, state);

      renderItems(chart, container);
    },

    // Only rebuild the legend when config actually changes (series
    // added/removed/renamed/toggled). Rebuilding on every `setData`
    // meant a 10 Hz stream would wipe the button under the cursor
    // before a click could register.
    onSetOptions(chart: ChartInstance) {
      const state = states.get(chart);
      if (state) renderItems(chart, state.container);
    },

    destroy(chart: ChartInstance) {
      const state = states.get(chart);
      if (!state) return;
      state.offTheme();
      state.container.remove();
      state.styledParent.style.display = state.prevParentDisplay;
      state.styledParent.style.flexDirection = state.prevParentFlexDirection;
      if (state.styledCanvas) {
        state.styledCanvas.style.flex = state.prevCanvasFlex;
        state.styledCanvas.style.minHeight = state.prevCanvasMinHeight;
      }
      states.delete(chart);
    },
  };
}

const FALLBACK_PALETTE = [
  '#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7',
];

function renderItems(chart: ChartInstance, container: HTMLDivElement): void {
  const config = chart.getOptions();
  // Match the canvas: it colors series from the *resolved* theme palette
  // (light/dark defaults, CSS-var overrides), not the raw config theme. Using
  // the raw config here left swatches on the 7-color Okabe-Ito fallback while
  // the lines used the 8-color resolved palette, so every dot was wrong.
  const theme = chart.getTheme();
  const palette = theme.categoricalPalette ?? theme.palette ?? FALLBACK_PALETTE;

  // Wiping innerHTML detaches the old <button> items and their click
  // handlers from the DOM; both become GC-eligible when this function
  // returns.
  container.innerHTML = '';

  chart.getLegendItems().forEach((legendItem, idx) => {
    const series = config.series[idx];
    const color = legendItem.color ?? palette[idx % palette.length];
    const hidden = !legendItem.visible;

    // <button> (not <div>) so the toggle is keyboard-reachable and
    // screen-reader-announced. Styling comes from legend-table.css.
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'snaplot-legend-item';
    if (hidden) item.dataset.hidden = 'true';
    item.setAttribute(
      'aria-label',
      `Toggle ${series.label} ${hidden ? 'on' : 'off'}`,
    );

    const dot = document.createElement('span');
    dot.className = 'snaplot-legend-dot';
    dot.dataset.mark = legendItem.type;
    dot.style.color = color;
    dot.style.opacity = String(legendItem.opacity);
    dot.style.borderColor = color;
    if (legendItem.fill) dot.style.backgroundColor = legendItem.fill;
    if (legendItem.lineDash.length > 0) dot.dataset.dashed = 'true';

    const label = document.createElement('span');
    label.className = 'snaplot-legend-label';
    label.textContent = series.label;

    item.appendChild(dot);
    item.appendChild(label);

    item.addEventListener('click', () => {
      // Re-read the latest config inside the handler, the series array
      // may have been replaced since this item was rendered. The
      // subsequent `onSetOptions` hook is what re-renders the legend,
      // so we don't need to call renderItems() here.
      const cfg = chart.getOptions();
      const currentlyVisible = cfg.series[idx]?.visible !== false;
      chart.setOptions({
        series: cfg.series.map((s, i) =>
          i === idx ? { ...s, visible: !currentlyVisible } : s,
        ),
      });
    });

    container.appendChild(item);
  });
}
