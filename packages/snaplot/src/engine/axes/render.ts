import type { AxisSpec, Layout, Scale, ThemeConfig, AxisPosition, ChartSpec } from '../spec';
import {
  AXIS_LABEL_GAP,
  AXIS_TICK_LENGTH,
  DEFAULT_TICK_COUNT,
  EDGE_MARGIN,
  LABEL_MIN_GAP,
} from '../../constants';
import { inferPosition, measureLabel } from '../layout';
import { opaqueColorOnBackground } from '../theme/color';
import { type AxesRenderResult, type LabelBox, resolveAxisCornerCollisions } from './labels';
import { axisTickValues, fitTicks } from './ticks';
import { type FormatContext, formatTick } from '../format';
import { crisp } from '../render/crisp';

/**
 * Renders gridlines on the static (grid) canvas and returns label
 * positions for DOM rendering (P2: hybrid, canvas marks, DOM text).
 *
 * Every 1 px stroke (gridlines, tick marks, the plot frame) is snapped by
 * render/crisp.ts, so it stays sharp at the canvas' device pixel ratio.
 */

/** `text`, cut with an ellipsis to at most `max` pixels wide. */
function truncate(text: string, max: number, measure: (text: string) => number): string {
  if (measure(text) <= max) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(`${text.slice(0, mid).trimEnd()}…`) <= max) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? '' : `${text.slice(0, lo).trimEnd()}…`;
}

/** Resolve an axis's grid config to concrete draw values, or null when hidden. */
function resolveGrid(
  ac: AxisSpec,
  theme: ThemeConfig,
): { color: string; opacity: number; dash: number[] } | null {
  const grid = ac.grid;
  if (grid === false) return null;
  const cfg = typeof grid === 'object' ? grid : {};
  if (cfg.show === false) return null;
  return {
    color: cfg.color ?? theme.gridColor,
    opacity: cfg.opacity ?? theme.gridOpacity,
    dash: cfg.dash ?? [],
  };
}

export function renderAxes(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  scales: Map<string, Scale>,
  theme: ThemeConfig,
  config: ChartSpec,
  /** Override X-axis ticks with explicit values (e.g. bin edges, category values) */
  customXTicks?: { values: number[]; format?: (v: number) => string; gridValues?: number[] },
): AxesRenderResult {
  const { plot, dpr } = layout;
  const formats: FormatContext = { config, scales };

  const result: AxesRenderResult = {
    labels: [],
  };
  const tickMarks: Array<{
    position: AxisPosition;
    pixels: number[];
    length: number;
    direction: 'out' | 'in' | 'both';
    color: string;
    opacity: number;
  }> = [];

  // The plot is transparent by default (plan D5; the engine clears the layer first); an explicit
  // surface paints a panel.
  if (theme.backgroundColor !== 'transparent') {
    ctx.fillStyle = theme.backgroundColor;
    ctx.fillRect(0, 0, layout.width, layout.height);
  }

  // Square plot corners keep endpoint ticks connected to the frame.
  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.width, plot.height);
  ctx.clip();

  // Track which positions have already drawn gridlines (only first axis per position draws them)
  const gridDrawn = new Set<AxisPosition>();

  const axisConfigs = config.axes ?? {};

  for (const [key, ac] of Object.entries(axisConfigs)) {
    const scale = scales.get(key);
    if (!scale) continue;

    const pos = inferPosition(key, ac.position);
    const labels: LabelBox[] = result.labels;

    // Tick precedence: explicit ac.ticks -> bar/histogram category ticks ->
    // generated at the ac.tickCount density.
    const isHorizontal = pos === 'bottom' || pos === 'top';
    const hasExplicitTicks = !!ac.ticks && ac.ticks.length > 0;
    const useCustomTicks = isHorizontal && customXTicks && !hasExplicitTicks;
    let ticks = useCustomTicks ? customXTicks!.values : axisTickValues(scale, ac);
    const edgeTolerance = Math.abs(scale.max - scale.min) * 1e-9;
    const alignedEnds = (values: number[]) =>
      !useCustomTicks &&
      scale.type === 'linear' &&
      values.length > 1 &&
      Math.abs(values[0] - scale.min) <= edgeTolerance &&
      Math.abs(values[values.length - 1] - scale.max) <= edgeTolerance;
    // Bar labels name slot centers; their grid spans the slot boundaries.
    // Keep that full grid when label fitting skips crowded center labels.
    const customGridValues = useCustomTicks ? customXTicks?.gridValues : undefined;
    // Formatter precedence: custom-tick formatter (bar/histogram path) ->
    // engine/format.ts (the axis format, else the scale's tick format).
    const tickLabel: (v: number) => string =
      useCustomTicks && customXTicks!.format
        ? customXTicks!.format
        : (v: number) => formatTick(formats, key, v);

    // Fit pass: generated tick counts are density targets that know nothing about the rendered
    // strings, so measure the labels as they will be placed (edge labels clamped into the
    // container) and keep every nth tick at the smallest stride where neighbours keep a gap and
    // never read the same. Generated ticks first ask the scale for that many, so the step (and the
    // labels' precision) follows; every nth of the last set keeps calendar and nice alignment
    // (every second Monday is still a Monday). Explicit ac.ticks are the user's exact choice and
    // are exempt.
    const measure = (text: string) => measureLabel(text, theme.fontFamily, theme.fontSize);
    if ((!hasExplicitTicks || ac.thinTicks) && ticks.length > 1) {
      const half = theme.fontSize * 0.6;
      const fitLabels = (values: number[]) => {
        const texts = values.map(tickLabel);
        return fitTicks(
          values.length,
          isHorizontal
            ? (i) => {
                const w = measure(texts[i]) / 2;
                const px = scale.dataToPixel(values[i]);
                const x = Math.max(w + 2, Math.min(layout.width - w - 2, px));
                return [x - w, x + w];
              }
            : (i) => {
                const y = scale.dataToPixel(values[i]);
                return [y - half, y + half];
              },
          (i) => texts[i],
          // Vertical labels keep about two and a half lines between centres: closer, a short
          // axis reads as a column of numbers.
          isHorizontal ? LABEL_MIN_GAP : theme.fontSize * 1.4,
          alignedEnds(values),
        );
      };
      let kept = fitLabels(ticks);
      if (!useCustomTicks && !hasExplicitTicks) {
        let count = ac.tickCount ?? DEFAULT_TICK_COUNT;
        for (let attempt = 0; attempt < 4 && kept.length < ticks.length && count > 2; attempt++) {
          const next = scale.ticks(Math.max(2, Math.min(count - 1, kept.length)));
          // A linear set with a rounder step reads better even with a label fewer (0 50 100 over
          // 0 40 80 120). A log or time set with fewer labels does not: a log axis under a decade
          // asked for 3 can come back with 2, and every other month (Jul Sep) reads worse than
          // every month (Jul Aug Sep).
          const nextKept = next.length >= ticks.length || next.length < 2 ? [] : fitLabels(next);
          if (!nextKept.length || (scale.type !== 'linear' && nextKept.length < kept.length)) {
            scale.ticks(count); // the scale formats by its last step: restore it
            break;
          }
          count = Math.max(2, Math.min(count - 1, kept.length));
          ticks = next;
          kept = nextKept;
        }
      }
      if (kept.length < ticks.length) ticks = kept.map((i) => ticks[i]);
    }

    if (ac.tickMarks !== false) {
      const mark = typeof ac.tickMarks === 'object' ? ac.tickMarks : undefined;
      tickMarks.push({
        position: pos,
        pixels: (customGridValues ?? ticks).map((tick) => scale.dataToPixel(tick)),
        length: Math.max(0, mark?.length ?? AXIS_TICK_LENGTH),
        direction: mark?.direction ?? 'out',
        color: mark?.color ?? theme.axisLineColor,
        opacity: mark?.color !== undefined ? 1 : theme.gridOpacity,
      });
    }

    // The first axis at each position decides that position's gridlines
    // (draw styled by its grid config, or hide them entirely); later axes
    // at the same position never add a second grid on top.
    const grid = resolveGrid(ac, theme);
    const shouldDrawGrid = !gridDrawn.has(pos);
    if (shouldDrawGrid) gridDrawn.add(pos);
    if (shouldDrawGrid && grid !== null) {
      ctx.strokeStyle = opaqueColorOnBackground(
        grid.color,
        grid.opacity,
        theme.surfaceColor ?? theme.backgroundColor,
      );
      // Solid hairlines stay stable while panning; explicit dashes remain supported.
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
      if (grid.dash.length > 0) ctx.setLineDash(grid.dash);
      ctx.beginPath();

      if (isHorizontal) {
        // Vertical gridlines across plot area
        for (const t of customGridValues ?? ticks) {
          const px = crisp(scale.dataToPixel(t), dpr);
          if (px >= plot.left && px <= plot.left + plot.width) {
            ctx.moveTo(px, plot.top);
            ctx.lineTo(px, plot.top + plot.height);
          }
        }
      } else {
        // Horizontal gridlines across plot area
        for (const t of ticks) {
          const py = crisp(scale.dataToPixel(t), dpr);
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
            labels.push({
              axis: key,
              kind: 'tick',
              text: tickLabel(t),
              x: plot.left - AXIS_TICK_LENGTH - AXIS_LABEL_GAP,
              y: py,
              anchor: 'end',
            });
          }
        }
        break;
      case 'right':
        for (const t of ticks) {
          const py = scale.dataToPixel(t);
          if (py >= plot.top - 10 && py <= plot.top + plot.height + 10) {
            labels.push({
              axis: key,
              kind: 'tick',
              text: tickLabel(t),
              x: plot.left + plot.width + AXIS_TICK_LENGTH + AXIS_LABEL_GAP,
              y: py,
              anchor: 'start',
            });
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
        const labelY =
          pos === 'bottom'
            ? plot.top + plot.height + AXIS_TICK_LENGTH + AXIS_LABEL_GAP
            : plot.top - AXIS_TICK_LENGTH - AXIS_LABEL_GAP;
        for (const t of ticks) {
          const px = scale.dataToPixel(t);
          if (px >= plot.left - 10 && px <= plot.left + plot.width + 10) {
            const text = tickLabel(t);
            const half = measure(text) / 2;
            const x = Math.max(half + 2, Math.min(layout.width - half - 2, px));
            labels.push({ axis: key, kind: 'tick', text, x, y: labelY, anchor: 'middle' });
          }
        }
        break;
      }
    }

    if (ac.title) {
      const area = layout.axes[key]?.area;
      if (area) {
        // A title runs along its plot edge and is cut to it with an ellipsis.
        const title = truncate(ac.title, isHorizontal ? plot.width : plot.height, measure);
        // Center of the title glyph sits EDGE_MARGIN + half a line in from
        // the outer edge, mirroring the titleStrip Layout reserves, so the
        // glyph never touches the canvas edge (or the host's card border).
        const inset = EDGE_MARGIN + theme.fontSize / 2;
        switch (pos) {
          case 'left':
            labels.push({
              axis: key,
              kind: 'title',
              text: title,
              x: area.left + inset,
              y: plot.top + plot.height / 2,
              anchor: 'middle',
            });
            break;
          case 'right':
            labels.push({
              axis: key,
              kind: 'title',
              text: title,
              x: area.left + area.width - inset,
              y: plot.top + plot.height / 2,
              anchor: 'middle',
            });
            break;
          case 'bottom':
            labels.push({
              axis: key,
              kind: 'title',
              text: title,
              x: plot.left + plot.width / 2,
              y: area.top + area.height - inset,
              anchor: 'middle',
            });
            break;
          case 'top':
            labels.push({
              axis: key,
              kind: 'title',
              text: title,
              x: plot.left + plot.width / 2,
              y: area.top + inset,
              anchor: 'middle',
            });
            break;
        }
      }
    }
  }

  // Release the plot clip used for gridlines.
  ctx.restore();

  resolveAxisCornerCollisions(result, layout, theme);

  // Tick marks deliberately paint outside the plot clip. Bar marks follow
  // slot boundaries; other axes share the final label tick set.
  ctx.lineWidth = 1;
  ctx.globalAlpha = 1;
  for (const marks of tickMarks) {
    if (marks.length <= 0 || marks.pixels.length === 0) continue;
    ctx.strokeStyle = opaqueColorOnBackground(
      marks.color,
      marks.opacity,
      theme.surfaceColor ?? theme.backgroundColor,
    );
    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (const pixel of marks.pixels) {
      const p = crisp(pixel, dpr);
      const inward = marks.direction === 'in' || marks.direction === 'both';
      const outward = marks.direction === 'out' || marks.direction === 'both';
      switch (marks.position) {
        case 'bottom': {
          const edge = crisp(plot.top + plot.height, dpr);
          ctx.moveTo(p, edge - (inward ? marks.length : 0));
          ctx.lineTo(p, edge + (outward ? marks.length : 0));
          break;
        }
        case 'top': {
          const edge = crisp(plot.top, dpr);
          ctx.moveTo(p, edge + (inward ? marks.length : 0));
          ctx.lineTo(p, edge - (outward ? marks.length : 0));
          break;
        }
        case 'left': {
          const edge = crisp(plot.left, dpr);
          ctx.moveTo(edge + (inward ? marks.length : 0), p);
          ctx.lineTo(edge - (outward ? marks.length : 0), p);
          break;
        }
        case 'right': {
          const edge = crisp(plot.left + plot.width, dpr);
          ctx.moveTo(edge - (inward ? marks.length : 0), p);
          ctx.lineTo(edge + (outward ? marks.length : 0), p);
          break;
        }
      }
    }
    ctx.stroke();
  }

  // ─── Plot area border ────────────────────────────────────────
  // `borderColor` / `borderOpacity` are their own knobs so the frame
  // can sit one visual step above the grid while sharing its hue.
  // Falls back to `axisLineColor` / `gridOpacity` for themes that
  // pre-date the split.
  ctx.strokeStyle = opaqueColorOnBackground(
    theme.borderColor ?? theme.axisLineColor,
    theme.borderOpacity ?? theme.gridOpacity,
    theme.surfaceColor ?? theme.backgroundColor,
  );
  ctx.lineWidth = 1;
  ctx.globalAlpha = 1;
  // Snap all four edges independently, then derive width/height from the
  // snapped corners. Snapping only the origin and adding an unrounded
  // (possibly fractional) plot.width/height left the right and bottom strokes
  // off the pixel grid, so they blurred at dpr 1 while the top/left stayed
  // crisp.
  const bx = crisp(plot.left, dpr);
  const by = crisp(plot.top, dpr);
  const bRight = crisp(plot.left + plot.width, dpr);
  const bBottom = crisp(plot.top + plot.height, dpr);
  ctx.beginPath();
  ctx.rect(bx, by, bRight - bx, bBottom - by);
  ctx.stroke();
  ctx.globalAlpha = 1;

  return result;
}
