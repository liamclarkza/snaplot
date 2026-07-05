import type { Layout, Scale, ThemeConfig, AxisPosition, ChartConfig } from '../types';
import { DEFAULT_TICK_COUNT } from '../constants';
import { inferPosition } from '../core/Layout';

/**
 * Renders gridlines on the static (grid) canvas and returns label
 * positions for DOM rendering (P2: hybrid, canvas marks, DOM text).
 *
 * 0.5px offset trick: for 1px gridlines on non-retina (dpr===1),
 * offset coordinates by 0.5 to avoid blurry sub-pixel rendering.
 */

export interface AxisLabel {
  text: string;
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  /** Axis titles render in the reserved outer gutter strip, rotated on vertical axes. */
  kind?: 'tick' | 'title';
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

  // Fill background on grid canvas (opaque, alpha:false)
  ctx.fillStyle = theme.backgroundColor;
  ctx.fillRect(0, 0, layout.width, layout.height);

  // Clip gridlines to the rounded plot area so they don't bleed into the corners.
  const borderRadius = 4;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(plot.left, plot.top, plot.width, plot.height, borderRadius);
  ctx.clip();

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
    // Precedence: custom-tick formatter (bar/histogram path) → user's
    // axes.x.tickFormat → the scale's built-in tickFormat.
    const formatTick = useCustomTicks && customXTicks!.format
      ? customXTicks!.format
      : ac.tickFormat ?? ((v: number) => scale.tickFormat(v));

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

    if (ac.label) {
      const area = layout.axes[key]?.area;
      if (area) {
        const strip = (theme.fontSize + 8) / 2;
        switch (pos) {
          case 'left':
            labels.push({ text: ac.label, x: area.left + strip, y: plot.top + plot.height / 2, anchor: 'middle', kind: 'title' });
            break;
          case 'right':
            labels.push({ text: ac.label, x: area.left + area.width - strip, y: plot.top + plot.height / 2, anchor: 'middle', kind: 'title' });
            break;
          case 'bottom':
            labels.push({ text: ac.label, x: plot.left + plot.width / 2, y: area.top + area.height - strip, anchor: 'middle', kind: 'title' });
            break;
          case 'top':
            labels.push({ text: ac.label, x: plot.left + plot.width / 2, y: area.top + strip, anchor: 'middle', kind: 'title' });
            break;
        }
      }
    }

    result.labels.set(key, labels);
  }

  // Release the rounded clip used for gridlines.
  ctx.restore();

  // ─── Plot area border (rounded corners) ──────────────────────
  // `borderColor` / `borderOpacity` are their own knobs so the frame
  // can sit one visual step above the grid while sharing its hue.
  // Falls back to `axisLineColor` / `gridOpacity` for themes that
  // pre-date the split.
  ctx.strokeStyle = theme.borderColor ?? theme.axisLineColor;
  ctx.lineWidth = 1;
  ctx.globalAlpha = theme.borderOpacity ?? theme.gridOpacity;
  const bx = Math.round(plot.left) + offset;
  const by = Math.round(plot.top) + offset;
  const r = 4; // corner radius in CSS pixels
  ctx.beginPath();
  ctx.roundRect(bx, by, plot.width, plot.height, r);
  ctx.stroke();
  ctx.globalAlpha = 1;

  return result;
}

/**
 * Update DOM labels from AxesRenderResult.
 *
 * Spans are pooled and updated in place: the grid layer redraws on every
 * pan/zoom frame, and rebuilding all label nodes per frame (the previous
 * innerHTML approach) churned the DOM at gesture rate. The static style
 * (font, color, transform) is stamped only when its signature changes;
 * steady-state frames touch just left/top/textContent.
 */
export function updateDOMLabels(
  domLayer: HTMLDivElement,
  axesResult: AxesRenderResult,
  theme: ThemeConfig,
  layout: Layout,
): void {
  const baseStyle = `position:absolute;font-family:${theme.fontFamily};font-size:${theme.fontSize}px;font-variant-numeric:tabular-nums;color:${theme.textColor};white-space:nowrap;pointer-events:none;`;

  const pool = domLayer.children;
  let used = 0;

  for (const [key, labels] of axesResult.labels) {
    const axisInfo = layout.axes[key];
    if (!axisInfo) continue;

    const pos = axisInfo.position;
    let posStyle: string;
    switch (pos) {
      case 'left':
        posStyle = 'text-align:right;transform:translate(-100%, -50%);';
        break;
      case 'right':
        posStyle = 'transform:translateY(-50%);';
        break;
      case 'top':
        posStyle = 'text-align:center;transform:translateX(-50%);';
        break;
      default:
        posStyle = 'transform:translateX(-50%);';
        break;
    }
    // Titles center on their anchor point and rotate to read along
    // vertical axes; slightly muted so tick values stay the loudest text.
    const vertical = pos === 'left' || pos === 'right';
    const titleStyle =
      `opacity:0.75;letter-spacing:0.02em;transform:translate(-50%, -50%)` +
      (vertical ? ` rotate(${pos === 'left' ? -90 : 90}deg);` : ';');

    for (const label of labels) {
      let el = pool[used] as HTMLSpanElement | undefined;
      if (!el) {
        el = document.createElement('span');
        domLayer.appendChild(el);
      }
      used++;

      const styleSig = baseStyle + (label.kind === 'title' ? titleStyle : posStyle);
      if (el.dataset.labelStyle !== styleSig) {
        el.style.cssText = styleSig;
        el.dataset.labelStyle = styleSig;
      }
      el.style.left = label.x + 'px';
      el.style.top = label.y + 'px';
      if (el.textContent !== label.text) el.textContent = label.text;
    }
  }

  while (domLayer.children.length > used) {
    domLayer.lastChild?.remove();
  }
}
