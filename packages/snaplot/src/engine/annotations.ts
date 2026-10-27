import type { EngineHost, Plugin } from './spec';
import { withAlpha } from './theme/color';

/**
 * Configuration for a single reference line, a horizontal or vertical
 * marker rendered on the data canvas at a fixed data-space value.
 *
 * Reference lines respond to zoom/pan and scale changes. They render
 * in the `afterDrawData` hook so they appear above series data but
 * below the overlay (crosshair, selection box).
 */
export interface ReferenceLine {
  /** Which axis the line is anchored to. `'y'` = horizontal line, `'x'` = vertical line. */
  axis: 'x' | 'y';
  /** Data-space value where the line is drawn. */
  value: number;
  /** Optional text label rendered at the line edge. */
  label?: string;
  /** Line color. Defaults to `'#888'`. */
  color?: string;
  /** Dash pattern (same as canvas `setLineDash`). Defaults to solid. */
  dash?: number[];
  /** Line width in CSS pixels. Defaults to `1`. */
  lineWidth?: number;
  /** Axis key to resolve the scale (e.g. `'y'`, `'y2'`). Defaults to `'x'` or `'y'` based on `axis`. */
  axisKey?: string;
}

/**
 * Built-in reference lines plugin.
 *
 * Renders horizontal and/or vertical marker lines at specified data values.
 * Ideal for thresholds, baselines, targets, or event markers.
 *
 * @example
 * ```ts
 * import { createReferenceLinesPlugin } from 'snaplot';
 *
 * const refLines = createReferenceLinesPlugin({
 *   lines: [
 *     { axis: 'y', value: 75, label: 'Target', color: '#e74c3c', dash: [6, 3] },
 *     { axis: 'y', value: 50, label: 'Baseline', color: '#888', lineWidth: 1 },
 *   ],
 * });
 *
 * <Chart config={{ plugins: [refLines], ... }} data={data} />
 * ```
 */
export function createReferenceLinesPlugin(options: {
  lines: ReferenceLine[];
  /** Label boxes already on the plot (the regions' labels), which these labels keep clear of. */
  avoid?: (chart: EngineHost, ctx: CanvasRenderingContext2D) => LabelRect[];
}): Plugin & { setLines(lines: ReferenceLine[]): void } {
  let lines = options.lines;
  let chartRef: EngineHost | null = null;

  return {
    id: 'builtin:reference-lines',

    install(chart: EngineHost) {
      chartRef = chart;
    },

    /** Update lines dynamically after creation. Triggers a redraw. */
    setLines(newLines: ReferenceLine[]) {
      lines = newLines;
      chartRef?.redraw();
    },

    afterDrawData(chart: EngineHost, ctx: CanvasRenderingContext2D) {
      const layout = chart.getLayout();
      const { left, top, width, height } = layout.plot;
      const theme = chart.getTheme();

      ctx.save();
      ctx.beginPath();
      ctx.rect(left, top, width, height);
      ctx.clip();

      const labels: Array<{ line: ReferenceLine; px: number; color: string }> = [];
      for (const line of lines) {
        const axisKey = line.axisKey ?? line.axis;
        const scale = chart.getAxis(axisKey);
        if (!scale) continue;

        const px = scale.dataToPixel(line.value);
        const color = chart.resolveColor(line.color ?? theme.tickColor);
        if (line.axis === 'y' ? px < top || px > top + height : px < left || px > left + width)
          continue; // off-screen

        ctx.strokeStyle = color;
        ctx.lineWidth = line.lineWidth ?? 1;
        ctx.setLineDash(line.dash ?? []);
        ctx.globalAlpha = 1;
        ctx.beginPath();
        if (line.axis === 'y') {
          ctx.moveTo(left, px);
          ctx.lineTo(left + width, px);
        } else {
          ctx.moveTo(px, top);
          ctx.lineTo(px, top + height);
        }
        ctx.stroke();
        if (line.label) labels.push({ line, px, color });
      }

      // Labels after every line, so none is crossed by a later line, each on a backing box of
      // the surface (it reads over dense data) and clear of every label placed before it. A
      // horizontal line's label marks a value, so it goes first: at the right edge just above its
      // line, moved a row down or up (nearest first) when that spot is taken. A vertical line's
      // sits at the top, on the side of its line that no other vertical line crosses (right
      // first), on the first free row.
      ctx.font = `11px ${theme.fontFamily}`;
      ctx.setLineDash([]);
      const surface = chart.resolveColor(theme.surfaceColor ?? theme.backgroundColor);
      const placed: LabelRect[] = options.avoid?.(chart, ctx) ?? [];
      const free = (x: number, y: number, w: number) =>
        !placed.some(
          ([x1, y1, x2, y2]) => x < x2 + 4 && x + w + 4 > x1 && y - 10 < y2 && y + 3 > y1,
        );
      const draw = (text: string, x: number, y: number, w: number, color: string) => {
        placed.push(rectOf(x, y, w));
        drawLabel(ctx, surface, text, x, y, w, color);
      };
      const byPixel = (p: { px: number }, q: { px: number }) => p.px - q.px;
      for (const { line, px, color } of labels
        .filter(({ line }) => line.axis === 'y')
        .sort(byPixel)) {
        const text = line.label!;
        const w = ctx.measureText(text).width;
        const x = left + width - w - 6;
        const home = Math.max(top + 12, Math.min(top + height - 4, px - 5));
        let y = home;
        for (let step = 1; !free(x, y, w) && step <= 8; step++) {
          const offset = Math.ceil(step / 2) * ROW * (step % 2 === 1 ? 1 : -1);
          const candidate = home + offset;
          if (candidate >= top + 12 && candidate <= top + height - 4) y = candidate;
        }
        draw(text, x, y, w, color);
      }
      const verticals = labels.filter(({ line }) => line.axis !== 'y').sort(byPixel);
      const crossings = verticals.map(({ px }) => px);
      for (const { line, px, color } of verticals) {
        const text = line.label!;
        const w = ctx.measureText(text).width;
        const right = px + 5;
        const leftSide = px - 5 - w;
        const fits = (x: number) => x - 3 >= left && x + w + 3 <= left + width;
        const clear = (x: number) =>
          crossings.every((other) => other === px || other < x - 3 || other > x + w + 3);
        const x =
          [right, leftSide].find((c) => fits(c) && clear(c)) ?? (fits(right) ? right : leftSide);
        let y = top + 12;
        while (!free(x, y, w) && y + ROW <= top + height - 4) y += ROW;
        draw(text, x, y, w, color);
      }

      ctx.restore();
    },
  };
}

/** A label's box on the plot: left, top, right, bottom in CSS pixels. */
type LabelRect = [number, number, number, number];

/** Rows of stacked annotation labels, baseline to baseline. */
const ROW = 14;

const rectOf = (x: number, y: number, w: number): LabelRect => [x, y - 10, x + w, y + 3];

/** An 11 px annotation label at baseline `y`, on a backing box of the surface (it reads over data). */
function drawLabel(
  ctx: CanvasRenderingContext2D,
  surface: string,
  text: string,
  x: number,
  y: number,
  w: number,
  color: string,
): void {
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = surface;
  ctx.fillRect(x - 3, y - 10, w + 6, ROW);
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** A labelled X or Y interval rendered beneath the series marks. */
export interface ReferenceRegion {
  axis: 'x' | 'y';
  from: number;
  to: number;
  axisKey?: string;
  label?: string;
  fill?: string;
  opacity?: number;
  /** Draw exact boundary lines around the interval. Default: `false`. */
  edges?: boolean;
  edgeColor?: string;
  edgeDash?: number[];
}

export interface ReferenceRegionsPlugin extends Plugin {
  setRegions(regions: ReferenceRegion[]): void;
  /** Where each visible region label sits (`ctx` carries the label font). */
  labelBoxes(chart: EngineHost, ctx: CanvasRenderingContext2D): LabelRect[];
}

/** Create theme-aware shaded intervals for tariffs, incidents, or targets. */
export function createReferenceRegionsPlugin(options: {
  regions: ReferenceRegion[];
}): ReferenceRegionsPlugin {
  let regions = options.regions;
  const charts = new Set<EngineHost>();

  const visibleGeometry = (chart: EngineHost, region: ReferenceRegion) => {
    const { left, top, width, height } = chart.getLayout().plot;
    const scale = chart.getAxis(region.axisKey ?? region.axis);
    if (!scale) return null;
    // A log axis has no 0: an end at or below it reaches the bottom of the domain.
    const floor = (v: number) =>
      scale.type === 'log' && v <= 0 ? Math.min(scale.min, scale.max) : v;
    const a = scale.dataToPixel(floor(region.from));
    const b = scale.dataToPixel(floor(region.to));
    if (region.axis === 'x') {
      const start = Math.max(left, Math.min(a, b));
      const end = Math.min(left + width, Math.max(a, b));
      return end > start ? { x: start, y: top, width: end - start, height, a, b } : null;
    }
    const start = Math.max(top, Math.min(a, b));
    const end = Math.min(top + height, Math.max(a, b));
    return end > start ? { x: left, y: start, width, height: end - start, a, b } : null;
  };

  // An X region's label sits centred over it on the first row at the top (wider than a narrow
  // region, it overhangs, kept inside the plot), a Y region's at the right of its top edge.
  const labelsOf = (chart: EngineHost, ctx: CanvasRenderingContext2D) => {
    const { left, width } = chart.getLayout().plot;
    ctx.font = `11px ${chart.getTheme().fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const labels: Array<{ text: string; x: number; y: number; w: number }> = [];
    for (const region of regions) {
      if (!region.label) continue;
      const geometry = visibleGeometry(chart, region);
      if (!geometry) continue;
      const w = ctx.measureText(region.label).width;
      const x =
        region.axis === 'x'
          ? Math.max(
              left + 3,
              Math.min(left + width - w - 3, geometry.x + (geometry.width - w) / 2),
            )
          : geometry.x + geometry.width - w - 6;
      labels.push({ text: region.label, x, y: geometry.y + 12, w });
    }
    return labels;
  };

  return {
    id: 'builtin:reference-regions',
    install(chart) {
      charts.add(chart);
    },
    destroy(chart) {
      charts.delete(chart);
    },
    setRegions(next) {
      regions = next;
      for (const chart of charts) chart.redraw();
    },
    afterDrawGrid(chart, ctx) {
      const theme = chart.getTheme();
      ctx.save();
      const plot = chart.getLayout().plot;
      ctx.beginPath();
      ctx.rect(plot.left, plot.top, plot.width, plot.height);
      ctx.clip();
      for (const region of regions) {
        const geometry = visibleGeometry(chart, region);
        if (!geometry) continue;
        const color = chart.resolveColor(region.fill ?? theme.textColor);
        ctx.fillStyle = withAlpha(color, region.opacity ?? 0.06);
        ctx.fillRect(geometry.x, geometry.y, geometry.width, geometry.height);
        if (region.edges) {
          ctx.strokeStyle = region.edgeColor ?? withAlpha(color, 0.35);
          ctx.setLineDash(region.edgeDash ?? []);
          ctx.beginPath();
          if (region.axis === 'x') {
            ctx.moveTo(geometry.a, geometry.y);
            ctx.lineTo(geometry.a, geometry.y + geometry.height);
            ctx.moveTo(geometry.b, geometry.y);
            ctx.lineTo(geometry.b, geometry.y + geometry.height);
          } else {
            ctx.moveTo(geometry.x, geometry.a);
            ctx.lineTo(geometry.x + geometry.width, geometry.a);
            ctx.moveTo(geometry.x, geometry.b);
            ctx.lineTo(geometry.x + geometry.width, geometry.b);
          }
          ctx.stroke();
        }
      }
      ctx.restore();
    },
    labelBoxes(chart, ctx) {
      return labelsOf(chart, ctx).map(({ x, y, w }) => rectOf(x, y, w));
    },
    afterDrawData(chart, ctx) {
      const theme = chart.getTheme();
      const surface = chart.resolveColor(theme.surfaceColor ?? theme.backgroundColor);
      ctx.save();
      for (const { text, x, y, w } of labelsOf(chart, ctx))
        drawLabel(ctx, surface, text, x, y, w, theme.tickColor);
      ctx.restore();
    },
  };
}
