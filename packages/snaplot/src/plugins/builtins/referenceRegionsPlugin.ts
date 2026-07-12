import type { ChartInstance, Plugin } from '../../types';
import { withAlpha } from '../../utils/color';

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
  const charts = new Set<ChartInstance>();

  const visibleGeometry = (chart: ChartInstance, region: ReferenceRegion) => {
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
    install(chart) { charts.add(chart); },
    destroy(chart) { charts.delete(chart); },
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
        const color = region.fill ?? theme.textColor;
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
