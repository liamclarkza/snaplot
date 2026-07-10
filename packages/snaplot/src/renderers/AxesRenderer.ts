import type { AxisConfig, Layout, Scale, ThemeConfig, AxisPosition, ChartConfig } from '../types';
import { DEFAULT_TICK_COUNT, EDGE_MARGIN, LABEL_MIN_GAP } from '../constants';
import { inferPosition } from '../core/Layout';

/**
 * Renders gridlines on the static (grid) canvas and returns label
 * positions for DOM rendering (P2: hybrid, canvas marks, DOM text).
 *
 * 0.5px offset trick: for 1px gridlines on non-retina (dpr===1),
 * offset coordinates by 0.5 to avoid blurry sub-pixel rendering.
 */

/**
 * Fraction of `theme.gridOpacity` used for the now-solid gridlines. A solid
 * 1px line carries roughly 4x the ink of the old half-width 50%-duty dash, so
 * scaling the alpha down keeps the grid quiet and preserves the frame-over-grid
 * hierarchy without retuning every theme's `gridOpacity`.
 */
const GRID_SOLID_ALPHA_SCALE = 0.55;

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

/**
 * Tick values for an axis: explicit `ac.ticks` (clamped to the visible
 * domain) beat generated ticks at the `ac.tickCount` density. Shared by
 * the renderer and layout measurement so gutters match the labels drawn.
 */
export function axisTickValues(scale: Scale, ac: AxisConfig): number[] {
  if (ac.ticks && ac.ticks.length > 0) {
    const lo = Math.min(scale.min, scale.max);
    const hi = Math.max(scale.min, scale.max);
    return ac.ticks.filter((t) => Number.isFinite(t) && t >= lo && t <= hi);
  }
  return scale.ticks(ac.tickCount ?? DEFAULT_TICK_COUNT);
}

/**
 * Evenly thin a category tick list to at most `maxCount` entries. Bar and
 * histogram charts tick every category by default, which smears into an
 * unreadable band once categories outnumber the pixels available for
 * labels (a year of daily bars). Keeps the first entry and every nth after.
 */
export function thinTicks(values: number[], maxCount: number): number[] {
  const max = Math.max(2, Math.floor(maxCount));
  if (values.length <= max) return values;
  const step = Math.ceil(values.length / max);
  return values.filter((_, i) => i % step === 0);
}

/** Resolve an axis's grid config to concrete draw values, or null when hidden. */
function resolveGrid(
  ac: AxisConfig,
  theme: ThemeConfig,
): { color: string; opacity: number; dash: number[] } | null {
  const grid = ac.grid;
  if (grid === false) return null;
  const cfg = typeof grid === 'object' ? grid : {};
  if (cfg.show === false) return null;
  return {
    color: cfg.color ?? theme.gridColor,
    // The default derives from the theme with the solid-hairline scale (see
    // GRID_SOLID_ALPHA_SCALE); an explicit opacity is used as given.
    opacity: cfg.opacity ?? theme.gridOpacity * GRID_SOLID_ALPHA_SCALE,
    dash: cfg.dash ?? [],
  };
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

    // Tick precedence: explicit ac.ticks -> bar/histogram category ticks ->
    // generated at the ac.tickCount density.
    const isHorizontal = pos === 'bottom' || pos === 'top';
    const hasExplicitTicks = !!ac.ticks && ac.ticks.length > 0;
    const useCustomTicks = isHorizontal && customXTicks && !hasExplicitTicks;
    let ticks = useCustomTicks ? customXTicks!.values : axisTickValues(scale, ac);
    // Formatter precedence: custom-tick formatter (bar/histogram path) ->
    // user's axes.x.tickFormat -> the scale's built-in tickFormat.
    const formatTick = useCustomTicks && customXTicks!.format
      ? customXTicks!.format
      : ac.tickFormat ?? ((v: number) => scale.tickFormat(v));

    // Width fit pass: generated tick counts are density targets that know
    // nothing about the rendered strings, so measure the actual labels and
    // thin until the widest fits the spacing. Thinning every nth entry
    // preserves calendar/nice alignment (every second Monday is still a
    // Monday). Explicit ac.ticks are the user's exact choice and are
    // exempt. Canvas measureText matches the DOM labels' font closely
    // enough for spacing and forces no reflow.
    ctx.font = `${theme.fontSize}px ${theme.fontFamily}`;
    let widestLabel = 0;
    if (isHorizontal && ticks.length > 1) {
      for (const t of ticks) {
        const w = ctx.measureText(formatTick(t)).width;
        if (w > widestLabel) widestLabel = w;
      }
      const spacing = plot.width / (ticks.length - 1);
      if (!hasExplicitTicks && widestLabel + LABEL_MIN_GAP > spacing) {
        ticks = thinTicks(
          ticks,
          Math.max(2, Math.floor(plot.width / (widestLabel + LABEL_MIN_GAP)) + 1),
        );
      }
    } else if (!isHorizontal && !hasExplicitTicks && ticks.length > 1) {
      // Vertical labels collide when tick spacing drops below a line height.
      const minSpacing = theme.fontSize * 1.4;
      const spacing = plot.height / (ticks.length - 1);
      if (spacing < minSpacing) {
        ticks = thinTicks(ticks, Math.max(2, Math.floor(plot.height / minSpacing) + 1));
      }
    }

    // The first axis at each position decides that position's gridlines
    // (draw styled by its grid config, or hide them entirely); later axes
    // at the same position never add a second grid on top.
    const grid = resolveGrid(ac, theme);
    const shouldDrawGrid = !gridDrawn.has(pos);
    if (shouldDrawGrid) gridDrawn.add(pos);
    if (shouldDrawGrid && grid !== null) {
      ctx.strokeStyle = grid.color;
      // Default is a solid 1px hairline rather than the old 0.5px [4,4]
      // dash: the dash phase is anchored in device space, so panning slid
      // the pattern along each line and made the whole grid shimmer, and a
      // 0.5px stroke straddles a physical pixel so it read as a blurry
      // grey even at rest. Solid carries far more ink than a half-width
      // 50%-duty dash, so the default alpha is scaled well below the
      // theme's grid opacity (GRID_SOLID_ALPHA_SCALE) to keep the grid
      // receding beneath the solid, full-opacity plot frame. An explicit
      // ac.grid.dash opts back into dashes for design languages built on
      // them.
      ctx.globalAlpha = grid.opacity;
      ctx.lineWidth = 1;
      if (grid.dash.length > 0) ctx.setLineDash(grid.dash);
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
      if (grid.dash.length > 0) ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // Generate tick labels based on position
    switch (pos) {
      case 'left':
        for (const t of ticks) {
          const py = scale.dataToPixel(t);
          if (py >= plot.top - 10 && py <= plot.top + plot.height + 10) {
            labels.push({ text: formatTick(t), x: plot.left - 6, y: py, anchor: 'end' });
          }
        }
        break;
      case 'right':
        for (const t of ticks) {
          const py = scale.dataToPixel(t);
          if (py >= plot.top - 10 && py <= plot.top + plot.height + 10) {
            labels.push({ text: formatTick(t), x: plot.left + plot.width + 6, y: py, anchor: 'start' });
          }
        }
        break;
      case 'bottom':
      case 'top': {
        // Centered labels near the plot edges overhang: the last one can
        // spill past the container (clipped by the host card) and the first
        // into the left gutter. Clamp the label center so the text box stays
        // inside the container; only the edge labels ever shift, and by at
        // most half their own width.
        const labelY = pos === 'bottom' ? plot.top + plot.height + 4 : plot.top - 4;
        for (const t of ticks) {
          const px = scale.dataToPixel(t);
          if (px >= plot.left - 10 && px <= plot.left + plot.width + 10) {
            const text = formatTick(t);
            const half = ctx.measureText(text).width / 2;
            const x = Math.max(half + 2, Math.min(layout.width - half - 2, px));
            labels.push({ text, x, y: labelY, anchor: 'middle' });
          }
        }
        break;
      }
    }

    if (ac.label) {
      const area = layout.axes[key]?.area;
      if (area) {
        // Center of the title glyph sits EDGE_MARGIN + half a line in from
        // the outer edge, mirroring the titleStrip Layout reserves, so the
        // glyph never touches the canvas edge (or the host's card border).
        const inset = EDGE_MARGIN + theme.fontSize / 2;
        switch (pos) {
          case 'left':
            labels.push({ text: ac.label, x: area.left + inset, y: plot.top + plot.height / 2, anchor: 'middle', kind: 'title' });
            break;
          case 'right':
            labels.push({ text: ac.label, x: area.left + area.width - inset, y: plot.top + plot.height / 2, anchor: 'middle', kind: 'title' });
            break;
          case 'bottom':
            labels.push({ text: ac.label, x: plot.left + plot.width / 2, y: area.top + area.height - inset, anchor: 'middle', kind: 'title' });
            break;
          case 'top':
            labels.push({ text: ac.label, x: plot.left + plot.width / 2, y: area.top + inset, anchor: 'middle', kind: 'title' });
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
  // Round all four edges independently, then derive width/height from the
  // snapped corners. Rounding only the origin and adding an unrounded
  // (possibly fractional) plot.width/height left the right and bottom strokes
  // off the pixel grid, so they blurred at dpr 1 while the top/left stayed
  // crisp. `offset` is the standard half-pixel nudge for 1px strokes at dpr 1.
  const bx = Math.round(plot.left) + offset;
  const by = Math.round(plot.top) + offset;
  const bRight = Math.round(plot.left + plot.width) + offset;
  const bBottom = Math.round(plot.top + plot.height) + offset;
  const r = 4; // corner radius in CSS pixels
  ctx.beginPath();
  ctx.roundRect(bx, by, bRight - bx, bBottom - by, r);
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
