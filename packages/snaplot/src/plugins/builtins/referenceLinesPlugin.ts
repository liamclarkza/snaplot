import type { Plugin, ChartInstance } from '../../types';

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
  let chartRef: ChartInstance | null = null;

  return {
    id: 'builtin:reference-lines',

    install(chart: ChartInstance) {
      chartRef = chart;
    },

    /** Update lines dynamically after creation. Triggers a redraw. */
    setLines(newLines: ReferenceLine[]) {
      lines = newLines;
      chartRef?.redraw();
    },

    afterDrawData(chart: ChartInstance, ctx: CanvasRenderingContext2D) {
      const layout = chart.getLayout();
      const { left, top, width, height } = layout.plot;

      ctx.save();
      ctx.beginPath();
      ctx.rect(left, top, width, height);
      ctx.clip();

      for (const line of lines) {
        const axisKey = line.axisKey ?? line.axis;
        const scale = chart.getAxis(axisKey);
        if (!scale) continue;

        const px = scale.dataToPixel(line.value);
        const color = line.color ?? '#888';
        const lw = line.lineWidth ?? 1;

        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.setLineDash(line.dash ?? []);
        ctx.globalAlpha = 1;

        ctx.beginPath();
        if (line.axis === 'y') {
          // Horizontal line at Y value
          if (px < top || px > top + height) continue; // off-screen
          ctx.moveTo(left, px);
          ctx.lineTo(left + width, px);
        } else {
          // Vertical line at X value
          if (px < left || px > left + width) continue; // off-screen
          ctx.moveTo(px, top);
          ctx.lineTo(px, top + height);
        }
        ctx.stroke();

        // Label
        if (line.label) {
          ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.9;

          if (line.axis === 'y') {
            // Label at the right edge of the plot area
            const textWidth = ctx.measureText(line.label).width;
            const labelX = left + width - textWidth - 6;
            const labelY = px - 4;
            // Clamp label within plot area
            const clampedY = Math.max(top + 12, Math.min(top + height - 4, labelY));
            ctx.fillText(line.label, labelX, clampedY);
          } else {
            // Label at the top of the plot area, rotated or horizontal
            const labelX = px + 4;
            const labelY = top + 12;
            ctx.fillText(line.label, labelX, labelY);
          }
        }
      }

      ctx.restore();
    },
  };
}
