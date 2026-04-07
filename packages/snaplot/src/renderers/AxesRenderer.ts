import type { Layout, Scale, ThemeConfig, AxisPosition, ChartConfig } from '../types';
import { DEFAULT_TICK_COUNT } from '../constants';
import { inferPosition } from '../core/Layout';

/**
 * Renders gridlines on the static (grid) canvas and returns label
 * positions for DOM rendering (P2: hybrid — canvas marks, DOM text).
 *
 * 0.5px offset trick: for 1px gridlines on non-retina (dpr===1),
 * offset coordinates by 0.5 to avoid blurry sub-pixel rendering.
 */

export interface AxisLabel {
  text: string;
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
}

export interface AxesRenderResult {
  /** Labels keyed by axis config key */
  labels: Map<string, AxisLabel[]>;
}

export function renderAxes(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  scales: Map<string, Scale>,
  theme: ThemeConfig,
  config: ChartConfig,
  /** Override X-axis ticks with explicit values (e.g. bin edges, category values) */
  customXTicks?: { values: number[]; format?: (v: number) => string },
): AxesRenderResult {
  const { plot, dpr } = layout;
  const offset = dpr === 1 ? 0.5 : 0;

  const result: AxesRenderResult = {
    labels: new Map(),
  };

  // Fill background on grid canvas (opaque — alpha:false)
  ctx.fillStyle = theme.backgroundColor;
  ctx.fillRect(0, 0, layout.width, layout.height);

  // Track which positions have already drawn gridlines (only first axis per position draws them)
  const gridDrawn = new Set<AxisPosition>();

  const axisConfigs = config.axes ?? {};

  for (const [key, ac] of Object.entries(axisConfigs)) {
    const scale = scales.get(key);
    if (!scale) continue;

    const pos = inferPosition(key, ac.position);
    const labels: AxisLabel[] = [];

    // Determine if this axis uses custom ticks (only for bottom/top X-like axes)
    const isHorizontal = pos === 'bottom' || pos === 'top';
    const useCustomTicks = isHorizontal && customXTicks;
    const ticks = useCustomTicks ? customXTicks!.values : scale.ticks(DEFAULT_TICK_COUNT);
    const formatTick = useCustomTicks && customXTicks!.format
      ? customXTicks!.format
      : (v: number) => scale.tickFormat(v);

    // Draw gridlines only for the first axis at each position
    const shouldDrawGrid = !gridDrawn.has(pos);
    if (shouldDrawGrid) {
      gridDrawn.add(pos);

      ctx.strokeStyle = theme.gridColor;
      ctx.globalAlpha = theme.gridOpacity;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();

      if (isHorizontal) {
        // Vertical gridlines across plot area
        for (const t of ticks) {
          const px = Math.round(scale.dataToPixel(t)) + offset;
          if (px >= plot.left && px <= plot.left + plot.width) {
            ctx.moveTo(px, plot.top);
            ctx.lineTo(px, plot.top + plot.height);
          }
        }
      } else {
        // Horizontal gridlines across plot area
        for (const t of ticks) {
          const py = Math.round(scale.dataToPixel(t)) + offset;
          ctx.moveTo(plot.left, py);
          ctx.lineTo(plot.left + plot.width, py);
        }
      }

      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // Generate tick labels based on position
    switch (pos) {
      case 'left':
        for (const t of ticks) {
          const py = scale.dataToPixel(t);
          labels.push({ text: formatTick(t), x: plot.left - 6, y: py, anchor: 'end' });
        }
        break;
      case 'right':
        for (const t of ticks) {
          const py = scale.dataToPixel(t);
          labels.push({ text: formatTick(t), x: plot.left + plot.width + 6, y: py, anchor: 'start' });
        }
        break;
      case 'bottom':
        for (const t of ticks) {
          const px = scale.dataToPixel(t);
          if (px >= plot.left - 10 && px <= plot.left + plot.width + 10) {
            labels.push({ text: formatTick(t), x: px, y: plot.top + plot.height + 4, anchor: 'middle' });
          }
        }
        break;
      case 'top':
        for (const t of ticks) {
          const px = scale.dataToPixel(t);
          if (px >= plot.left - 10 && px <= plot.left + plot.width + 10) {
            labels.push({ text: formatTick(t), x: px, y: plot.top - 4, anchor: 'middle' });
          }
        }
        break;
    }

    result.labels.set(key, labels);
  }

  // ─── Plot area border ─────────────────────────────────────────
  ctx.strokeStyle = theme.axisLineColor;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 1;
  ctx.strokeRect(
    Math.round(plot.left) + offset,
    Math.round(plot.top) + offset,
    plot.width,
    plot.height,
  );

  return result;
}

/**
 * Update DOM labels from AxesRenderResult.
 * Creates/recycles positioned span elements in the DOM overlay.
 */
export function updateDOMLabels(
  domLayer: HTMLDivElement,
  axesResult: AxesRenderResult,
  theme: ThemeConfig,
  layout: Layout,
): void {
  // Clear existing labels
  domLayer.innerHTML = '';

  const style = `position:absolute;font-family:${theme.fontFamily};font-size:${theme.fontSize}px;color:${theme.textColor};white-space:nowrap;pointer-events:none;`;

  for (const [key, labels] of axesResult.labels) {
    const axisInfo = layout.axes[key];
    if (!axisInfo) continue;

    const pos = axisInfo.position;

    for (const label of labels) {
      const el = document.createElement('span');

      switch (pos) {
        case 'left':
          el.style.cssText = style + `right:auto;transform:translateY(-50%);`;
          el.style.left = label.x + 'px';
          el.style.top = label.y + 'px';
          el.style.textAlign = 'right';
          el.style.transform = 'translate(-100%, -50%)';
          break;
        case 'right':
          el.style.cssText = style + `transform:translateY(-50%);`;
          el.style.left = label.x + 'px';
          el.style.top = label.y + 'px';
          break;
        case 'bottom':
          el.style.cssText = style + `transform:translateX(-50%);`;
          el.style.left = label.x + 'px';
          el.style.top = label.y + 'px';
          break;
        case 'top':
          el.style.cssText = style + `transform:translateX(-50%);`;
          el.style.left = label.x + 'px';
          el.style.top = label.y + 'px';
          el.style.textAlign = 'center';
          break;
      }

      el.textContent = label.text;
      domLayer.appendChild(el);
    }
  }
}
