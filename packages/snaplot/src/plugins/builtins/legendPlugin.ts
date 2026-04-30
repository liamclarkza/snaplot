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
export function createLegendPlugin(options?: {
  position?: 'top' | 'bottom';
}): Plugin {
  let container: HTMLDivElement | null = null;

  return {
    id: 'builtin:legend',

    install(chart: ChartInstance) {
      const parent = chart.container;
      if (!parent) return;

      // Make the parent a flex column so legend and canvas share space
      parent.style.display = 'flex';
      parent.style.flexDirection = 'column';

      // The CanvasManager's container (first child) should fill remaining space
      const canvasContainer = parent.firstElementChild as HTMLElement;
      if (canvasContainer) {
        canvasContainer.style.flex = '1';
        canvasContainer.style.minHeight = '0';
      }

      container = document.createElement('div');
      container.className = 'snaplot-legend-root';

      const pos = options?.position ?? 'bottom';
      if (pos === 'top') {
        parent.insertBefore(container, parent.firstChild);
      } else {
        parent.appendChild(container);
      }

      renderItems(chart, container);
    },

    // Only rebuild the legend when config actually changes (series
    // added/removed/renamed/toggled). Rebuilding on every `setData`
    // meant a 10 Hz stream would wipe the button under the cursor
    // before a click could register.
    onSetOptions(chart: ChartInstance) {
      if (container) renderItems(chart, container);
    },

    destroy() {
      container?.remove();
      container = null;
    },
  };
}

const FALLBACK_PALETTE = [
  '#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7',
];

function renderItems(chart: ChartInstance, container: HTMLDivElement): void {
  const config = chart.getOptions();
  const palette = config.theme?.categoricalPalette ?? config.theme?.palette ?? FALLBACK_PALETTE;

  // Wiping innerHTML detaches the old <button> items and their click
  // handlers from the DOM; both become GC-eligible when this function
  // returns.
  container.innerHTML = '';

  config.series.forEach((series, idx) => {
    const color = series.stroke ?? palette[idx % palette.length];
    const hidden = series.visible === false;

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
    dot.style.background = color;

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
