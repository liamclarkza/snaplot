import type { Plugin, ChartInstance } from '../../types';

/**
 * Built-in DOM legend plugin.
 * Creates a clickable legend above or below the chart.
 * Click a series name to toggle its visibility.
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
      container.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 6px 16px;
        padding: 8px 12px;
        font-size: 12px;
        justify-content: center;
        pointer-events: auto;
        flex-shrink: 0;
      `;

      const pos = options?.position ?? 'bottom';
      if (pos === 'top') {
        parent.insertBefore(container, parent.firstChild);
      } else {
        parent.appendChild(container);
      }

      renderItems(chart, container);
    },

    onSetData(chart: ChartInstance) {
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
  const palette = config.theme?.palette ?? FALLBACK_PALETTE;

  // Wiping innerHTML detaches the old <div> items and their click handlers
  // from the DOM; both become GC-eligible when this function returns.
  container.innerHTML = '';

  config.series.forEach((series, idx) => {
    const color = series.stroke ?? palette[idx % palette.length];
    const hidden = series.visible === false;

    const item = document.createElement('div');
    item.style.cssText = `
      display: flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      user-select: none;
      opacity: ${hidden ? '0.35' : '1'};
      transition: opacity 0.15s;
    `;

    const dot = document.createElement('span');
    dot.style.cssText = `
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: ${color};
      flex-shrink: 0;
    `;

    const label = document.createElement('span');
    label.textContent = series.label;
    label.style.color = '#ccc';

    item.appendChild(dot);
    item.appendChild(label);

    item.addEventListener('click', () => {
      // Re-read the latest config inside the handler — the series array
      // may have been replaced since this item was rendered.
      const cfg = chart.getOptions();
      const currentlyVisible = cfg.series[idx]?.visible !== false;
      chart.setOptions({
        series: cfg.series.map((s, i) =>
          i === idx ? { ...s, visible: !currentlyVisible } : s,
        ),
      });
      renderItems(chart, container);
    });

    container.appendChild(item);
  });
}
