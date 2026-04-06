import type { Layout, Scale, ThemeConfig } from '../types';
import { DEFAULT_TICK_COUNT } from '../constants';

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
  xLabels: AxisLabel[];
  yLabels: AxisLabel[];
  y2Labels: AxisLabel[];
}

export function renderAxes(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  scales: Map<string, Scale>,
  theme: ThemeConfig,
  /** Override X-axis ticks with explicit values (e.g. bin edges, category values) */
  customXTicks?: { values: number[]; format?: (v: number) => string },
): AxesRenderResult {
  const { plot, dpr } = layout;
  const offset = dpr === 1 ? 0.5 : 0;

  const result: AxesRenderResult = {
    xLabels: [],
    yLabels: [],
    y2Labels: [],
  };

  // Fill background on grid canvas (opaque — alpha:false)
  ctx.fillStyle = theme.backgroundColor;
  ctx.fillRect(0, 0, layout.width, layout.height);

  // ─── Y-axis gridlines (horizontal lines across plot area) ─────
  const yScale = scales.get('y');
  if (yScale) {
    const ticks = yScale.ticks(DEFAULT_TICK_COUNT);

    ctx.strokeStyle = theme.gridColor;
    ctx.globalAlpha = theme.gridOpacity;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();

    for (const t of ticks) {
      const py = Math.round(yScale.dataToPixel(t)) + offset;
      ctx.moveTo(plot.left, py);
      ctx.lineTo(plot.left + plot.width, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Y-axis tick labels → DOM positions
    for (const t of ticks) {
      const py = yScale.dataToPixel(t);
      result.yLabels.push({
        text: yScale.tickFormat(t),
        x: plot.left - 6,
        y: py,
        anchor: 'end',
      });
    }
  }

  // ─── Y2-axis gridlines (skip gridlines, just labels) ─────────
  const y2Scale = scales.get('y2');
  if (y2Scale) {
    const ticks = y2Scale.ticks(DEFAULT_TICK_COUNT);
    for (const t of ticks) {
      const py = y2Scale.dataToPixel(t);
      result.y2Labels.push({
        text: y2Scale.tickFormat(t),
        x: plot.left + plot.width + 6,
        y: py,
        anchor: 'start',
      });
    }
  }

  // ─── X-axis gridlines (vertical lines across plot area) ───────
  const xScale = scales.get('x');
  if (xScale) {
    const ticks = customXTicks ? customXTicks.values : xScale.ticks(DEFAULT_TICK_COUNT);
    const formatTick = customXTicks?.format ?? ((v: number) => xScale.tickFormat(v));

    ctx.strokeStyle = theme.gridColor;
    ctx.globalAlpha = theme.gridOpacity;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();

    for (const t of ticks) {
      const px = Math.round(xScale.dataToPixel(t)) + offset;
      // Only draw grid line if it's within the plot area
      if (px >= plot.left && px <= plot.left + plot.width) {
        ctx.moveTo(px, plot.top);
        ctx.lineTo(px, plot.top + plot.height);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // X-axis tick labels → DOM positions
    for (const t of ticks) {
      const px = xScale.dataToPixel(t);
      // Only add label if within plot area (with small margin)
      if (px >= plot.left - 10 && px <= plot.left + plot.width + 10) {
        result.xLabels.push({
          text: formatTick(t),
          x: px,
          y: plot.top + plot.height + 4,
          anchor: 'middle',
        });
      }
    }
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
): void {
  // Clear existing labels
  domLayer.innerHTML = '';

  const style = `position:absolute;font-family:${theme.fontFamily};font-size:${theme.fontSize}px;color:${theme.textColor};white-space:nowrap;pointer-events:none;`;

  // Y labels (right-aligned, left of plot)
  for (const label of axesResult.yLabels) {
    const el = document.createElement('span');
    el.style.cssText = style + `right:auto;transform:translateY(-50%);`;
    el.style.left = label.x + 'px';
    el.style.top = label.y + 'px';
    el.style.textAlign = 'right';
    el.style.transform = 'translate(-100%, -50%)';
    el.textContent = label.text;
    domLayer.appendChild(el);
  }

  // Y2 labels (left-aligned, right of plot)
  for (const label of axesResult.y2Labels) {
    const el = document.createElement('span');
    el.style.cssText = style + `transform:translateY(-50%);`;
    el.style.left = label.x + 'px';
    el.style.top = label.y + 'px';
    el.textContent = label.text;
    domLayer.appendChild(el);
  }

  // X labels (centered below plot)
  for (const label of axesResult.xLabels) {
    const el = document.createElement('span');
    el.style.cssText = style + `transform:translateX(-50%);`;
    el.style.left = label.x + 'px';
    el.style.top = label.y + 'px';
    el.textContent = label.text;
    domLayer.appendChild(el);
  }
}
