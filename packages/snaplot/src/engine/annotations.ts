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

      // Labels after every line, so none is crossed by a later line, each on a halo of the
      // surface. A vertical line's label sits at the top, right of the line (left of it at the
      // right edge), on the first row free of the labels before it; a horizontal line's sits at
      // the right edge, pushed down clear of the one above it.
      ctx.font = `11px ${theme.fontFamily}`;
      ctx.setLineDash([]);
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = theme.surfaceColor ?? theme.backgroundColor;
      const ROW = 13;
      const rowEnds: number[] = [];
      let lastY = -Infinity;
      const vertical = labels.filter(({ line }) => line.axis !== 'y').sort((p, q) => p.px - q.px);
      const horizontal = labels.filter(({ line }) => line.axis === 'y').sort((p, q) => p.px - q.px);
      const draw = (text: string, x: number, y: number, color: string) => {
        ctx.globalAlpha = 1;
        ctx.strokeText(text, x, y);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.9;
        ctx.fillText(text, x, y);
      };
      for (const { line, px, color } of vertical) {
        const text = line.label!;
        const textWidth = ctx.measureText(text).width;
        const x = px + 4 + textWidth > left + width ? px - 4 - textWidth : px + 4;
        let row = rowEnds.findIndex((end) => end + 4 <= x);
        if (row < 0) row = rowEnds.length;
        rowEnds[row] = x + textWidth;
        draw(text, x, top + 12 + row * ROW, color);
      }
      for (const { line, px, color } of horizontal) {
        const text = line.label!;
        const textWidth = ctx.measureText(text).width;
        const y = Math.max(lastY + ROW, Math.max(top + 12, Math.min(top + height - 4, px - 4)));
        lastY = y;
        draw(text, left + width - textWidth - 6, y, color);
      }

      ctx.restore();
    },
  };
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
    const a = scale.dataToPixel(region.from);
    const b = scale.dataToPixel(region.to);
    if (region.axis === 'x') {
      const start = Math.max(left, Math.min(a, b));
      const end = Math.min(left + width, Math.max(a, b));
      return end > start ? { x: start, y: top, width: end - start, height, a, b } : null;
    }
    const start = Math.max(top, Math.min(a, b));
    const end = Math.min(top + height, Math.max(a, b));
    return end > start ? { x: left, y: start, width, height: end - start, a, b } : null;
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
    afterDrawData(chart, ctx) {
      const theme = chart.getTheme();
      ctx.save();
      ctx.font = `11px ${theme.fontFamily}`;
      ctx.textBaseline = 'top';
      ctx.fillStyle = theme.tickColor;
      for (const region of regions) {
        if (!region.label) continue;
        const geometry = visibleGeometry(chart, region);
        if (!geometry) continue;
        const textWidth = ctx.measureText(region.label).width;
        if (region.axis === 'x') {
          if (textWidth + 8 <= geometry.width) {
            ctx.textAlign = 'center';
            ctx.fillText(region.label, geometry.x + geometry.width / 2, geometry.y + 6);
          }
        } else if (textWidth + 8 <= geometry.width) {
          ctx.textAlign = 'right';
          ctx.fillText(region.label, geometry.x + geometry.width - 6, geometry.y + 6);
        }
      }
      ctx.restore();
    },
  };
}
