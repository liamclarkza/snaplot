import type { Layout, CursorConfig } from '../spec';
import { prefersReducedMotion } from '../../utils/motion';
import type { ChartCore } from '../Engine';
import { brushPixelRange } from '../selection';
import { DirtyFlag } from '../spec';
import { isDarkColor } from '../../utils/color';
import { seriesYColumn } from '../marks/scatterEncoding';
import { categoryWidthFromData, barRectForCategory } from '../marks/barGeometry';
import { isDensityScatterSeries } from '../marks/scatter';

/**
 * Renders crosshair and selection box on the overlay canvas.
 * This layer redraws at 60fps on mouse move, keep it cheap.
 */

export function renderCrosshair(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  layout: Layout,
  config: CursorConfig,
  color: string,
): void {
  const { plot } = layout;

  // Only draw if cursor is within the plot area
  if (x < plot.left || x > plot.left + plot.width) return;
  if (y < plot.top || y > plot.top + plot.height) return;

  ctx.save();
  // Clip to plot area so crosshair lines don't poke into corners.
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.width, plot.height);
  ctx.clip();

  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash(config.dash ?? [4, 4]);
  ctx.globalAlpha = 0.7;

  ctx.beginPath();

  // Vertical crosshair line
  if (config.xLine !== false) {
    const px = Math.round(x) + (layout.dpr === 1 ? 0.5 : 0);
    ctx.moveTo(px, plot.top);
    ctx.lineTo(px, plot.top + plot.height);
  }

  // Horizontal crosshair line
  if (config.yLine) {
    const py = Math.round(y) + (layout.dpr === 1 ? 0.5 : 0);
    ctx.moveTo(plot.left, py);
    ctx.lineTo(plot.left + plot.width, py);
  }

  ctx.stroke();
  ctx.restore();
}

/**
 * Draw a short-lived ring at the tap point so touch users get feedback that
 * the chart registered their gesture. The caller supplies `progress` in [0, 1]
 * so this renderer stays stateless.
 */
export function renderTapRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  progress: number,
  color: string,
): void {
  const minRadius = 8;
  const maxRadius = 26;
  let radius: number;
  if (prefersReducedMotion()) {
    // Reduced motion: no expanding-ring animation. Hold a fixed radius and
    // let only the opacity fade out, an opacity crossfade is the accessible
    // stand-in the WCAG reduced-motion guidance recommends over movement.
    radius = maxRadius;
  } else {
    // Ease-out cubic, rapid initial growth, soft settle.
    const eased = 1 - (1 - progress) ** 3;
    radius = minRadius + (maxRadius - minRadius) * eased;
  }
  const alpha = 0.45 * (1 - progress);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function renderSelectionBox(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  layout: Layout,
): void {
  const { plot } = layout;

  // Clamp to plot area
  const x1 = Math.max(plot.left, Math.min(startX, endX));
  const x2 = Math.min(plot.left + plot.width, Math.max(startX, endX));
  const y1 = Math.max(plot.top, Math.min(startY, endY));
  const y2 = Math.min(plot.top + plot.height, Math.max(startY, endY));

  // Snap to the pixel grid so the 1px outline stays crisp during the drag.
  const offset = layout.dpr === 1 ? 0.5 : 0;
  const rx = Math.round(x1);
  const ry = Math.round(y1);
  const rw = Math.round(x2) - rx;
  const rh = Math.round(y2) - ry;

  ctx.save();
  // A mid-blue accent reads as a light tint on dark surfaces and a light
  // wash on light ones, so a single hue works across every theme; the higher
  // stroke alpha gives the edge definition the soft fill lacks.
  ctx.fillStyle = 'rgba(99, 148, 255, 0.16)';
  ctx.fillRect(rx, ry, rw, rh);
  ctx.strokeStyle = 'rgba(99, 148, 255, 0.9)';
  ctx.lineWidth = 1;
  ctx.strokeRect(rx + offset, ry + offset, rw, rh);
  ctx.restore();
}

/**
 * Persistent brush selection: a full-height X-range band with two vertical
 * edge handles. Unlike the transient selection box, this is drawn from
 * data-space bounds every overlay frame, so it stays anchored to the data as
 * the viewport pans and zooms. Edges are clamped to the plot so a band that
 * scrolls partly off-screen still reads.
 */
export function renderBrushSelection(
  ctx: CanvasRenderingContext2D,
  pxMin: number,
  pxMax: number,
  layout: Layout,
  color: string,
): void {
  const { plot } = layout;
  const left = Math.max(plot.left, Math.min(pxMin, pxMax));
  const right = Math.min(plot.left + plot.width, Math.max(pxMin, pxMax));
  if (right < plot.left || left > plot.left + plot.width) return;

  const offset = layout.dpr === 1 ? 0.5 : 0;
  const rx = Math.round(left);
  const rw = Math.round(right) - rx;

  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.width, plot.height);
  ctx.clip();

  ctx.fillStyle = 'rgba(99, 148, 255, 0.14)';
  ctx.fillRect(rx, plot.top, rw, plot.height);

  // Edge handles, only for edges that fall inside the plot (a band scrolled
  // off one side shows just the visible edge).
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (pxMin >= plot.left && pxMin <= plot.left + plot.width) {
    const x = Math.round(Math.min(pxMin, pxMax)) + offset;
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.top + plot.height);
  }
  if (pxMax >= plot.left && pxMax <= plot.left + plot.width) {
    const x = Math.round(Math.max(pxMin, pxMax)) + offset;
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.top + plot.height);
  }
  ctx.stroke();
  ctx.restore();
}

// ─── The overlay pass ─────────────────────────────────────────
// What the overlay layer shows each frame: crosshair, point indicators, the tooltip, the brush
// band, the box being dragged and the tap ring.

export function renderOverlay(engine: ChartCore): void {
  const ctx = engine.canvasManager.overlayCtx;
  const cursorEnabled = engine.config.cursor?.show !== false;
  const isSelecting = engine.selectionBox !== null;

  // During active selection, hide crosshair/tooltip/dots, only show the selection box
  if (!isSelecting && cursorEnabled && engine.cursorX !== null && engine.cursorY !== null) {
    // Draw crosshair, skip for scatter-only charts
    const isScatterOnly = engine.config.series.every(
      (s) => s.visible === false || s.type === 'scatter',
    );
    if (!isScatterOnly) {
      const visibleSeries = engine.config.series.filter((s) => s.visible !== false);
      const hasOnlyDiscreteMarks =
        visibleSeries.length > 0 &&
        visibleSeries.every((s) => s.type === 'bar' || s.type === 'histogram');
      const cursorCfg = {
        ...engine.config.cursor,
        // A vertical line reads as an extra mark on grouped bars. The
        // highlighted group already supplies a stronger positional cue.
        xLine: engine.config.cursor?.xLine ?? !hasOnlyDiscreteMarks,
      };
      renderCrosshair(
        ctx,
        engine.cursorX,
        engine.cursorY,
        engine.layout,
        cursorCfg,
        // `cursor.color` overrides the theme's crosshair colour when set,          // useful for matching a brand accent on one chart without changing
        // the whole theme.
        cursorCfg.color ?? engine.theme.crosshairColor,
      );
    }

    // Draw data point indicators (dot + ring per hit-tested point).
    // Skip when the caller has opted out, typically because a legend
    // table already shows the values and the extra glyphs would be noise.
    if (engine.config.cursor?.indicators !== false) {
      drawPointIndicators(engine, ctx);
    }
  }

  // Show tooltip, hide during selection or when cursor is disabled
  if (
    !isSelecting &&
    cursorEnabled &&
    engine.cursorIsLocal &&
    engine.config.tooltip?.show !== false &&
    engine.tooltipPoints.length > 0 &&
    engine.mouseX !== null
  ) {
    const rect = engine.canvasManager.container.getBoundingClientRect();
    engine.tooltipManager.show(
      engine.tooltipPoints,
      rect.left + engine.mouseX,
      rect.top + (engine.mouseY ?? 0),
      engine.config.tooltip,
      engine.lastPointerType,
    );
  } else {
    engine.tooltipManager.hide();
  }

  // Draw the persistent brush selection band (anchored in data space, so it
  // stays put as the viewport pans/zooms), then edge handles.
  if (engine.selection) {
    const rect = brushPixelRange(engine);
    if (rect) {
      renderBrushSelection(ctx, rect.min, rect.max, engine.layout, engine.theme.crosshairColor);
    }
  }

  // Draw selection box
  if (engine.selectionBox) {
    renderSelectionBox(
      ctx,
      engine.selectionBox.x1,
      engine.selectionBox.y1,
      engine.selectionBox.x2,
      engine.selectionBox.y2,
      engine.layout,
    );
  }

  // Tap feedback, 220ms ring animation. Schedule another overlay frame
  // until the lifetime runs out, then clear state.
  if (engine.tapFeedback) {
    const TAP_RING_MS = 220;
    const elapsed = performance.now() - engine.tapFeedback.startTime;
    const progress = elapsed / TAP_RING_MS;
    if (progress >= 1) {
      engine.tapFeedback = null;
    } else {
      renderTapRing(
        ctx,
        engine.tapFeedback.x,
        engine.tapFeedback.y,
        progress,
        engine.theme.crosshairColor,
      );
      engine.scheduler.markDirty(DirtyFlag.OVERLAY);
    }
  }
}

export function drawPointIndicators(engine: ChartCore, ctx: CanvasRenderingContext2D): void {
  // Clip all indicators to the plot area
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(
    engine.layout.plot.left,
    engine.layout.plot.top,
    engine.layout.plot.width,
    engine.layout.plot.height,
    4,
  );
  ctx.clip();

  // Ring around cursor dots: white works on both light and dark backgrounds.
  // On dark themes it reads as a subtle glow; on light themes it separates
  // the vibrant fill from the white canvas. Alpha varies by luminance so
  // the ring is visible but never harsh.
  const bg = engine.theme.backgroundColor;
  // Default unparseable backgrounds to dark, matching the previous behavior
  // of this ring's luminance check. isDarkColor correctly handles 3-digit
  // hex and named colors, which the old hand-rolled parser did not.
  const isDark = isDarkColor(bg, true);
  const ringAlpha = isDark ? 0.15 : 0.08;

  // When a series is highlighted, only draw the indicator on that series,    // the others just get the crosshair line (matches Neptune/W&B behavior).
  const hlActive = engine.highlightedSeries !== null && engine.config.highlight?.enabled !== false;

  for (const point of engine.tooltipPoints) {
    if (hlActive && point.seriesIndex !== engine.highlightedSeries) continue;

    const store = engine.storeForSeries(point.seriesIndex);
    const sc = engine.config.series[point.seriesIndex];
    if (!sc) continue;

    const xScale = engine.scales.get(sc.xAxis ?? 'x');
    const yScale = engine.scales.get(sc.yAxis ?? 'y');
    if (!xScale || !yScale) continue;

    if (sc.type === 'histogram') {
      // Highlight hovered bin, edges from X data, counts from Y data
      const colIdx = seriesYColumn(sc);
      const binIdx = point.dataIndex;
      if (colIdx >= 1 && colIdx <= store.seriesCount && binIdx < store.length - 1) {
        const x1 = xScale.dataToPixel(store.xAt(binIdx));
        const x2 = xScale.dataToPixel(store.xAt(binIdx + 1));
        const yTop = yScale.dataToPixel(store.yAt(colIdx - 1, binIdx));
        const yBase = yScale.dataToPixel(0);
        ctx.fillStyle = `rgba(255, 255, 255, ${ringAlpha})`;
        ctx.fillRect(x1, Math.min(yTop, yBase), x2 - x1, Math.abs(yTop - yBase));
        ctx.strokeStyle = `rgba(255, 255, 255, ${ringAlpha * 2})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(x1, Math.min(yTop, yBase), x2 - x1, Math.abs(yTop - yBase));
      }
      continue;
    }

    if (sc.type === 'bar') {
      const idx = point.dataIndex;
      const barSeries = engine.config.series.filter((s) => s.visible !== false && s.type === 'bar');
      const barIdx = barSeries.indexOf(sc);
      const totalBars = barSeries.length;
      if (barIdx >= 0 && idx < store.length) {
        const centerX = xScale.dataToPixel(store.xAt(idx));
        const categoryWidth = categoryWidthFromData(
          (dataIndex) => xScale.dataToPixel(store.xAt(dataIndex)),
          idx,
          store.length,
          engine.layout.plot.width * 0.5,
        );
        const rect = barRectForCategory({
          centerX,
          categoryWidth,
          series: sc,
          barSeriesIndex: barIdx,
          totalBarSeries: totalBars,
        });
        const barTop = yScale.dataToPixel(point.y);
        const baselineY = yScale.dataToPixel(0);
        if (!Number.isFinite(centerX) || !Number.isFinite(barTop) || !Number.isFinite(baselineY))
          continue;
        const rectY = Math.min(barTop, baselineY);
        const rectH = Math.abs(barTop - baselineY);
        ctx.fillStyle = `rgba(255, 255, 255, ${ringAlpha})`;
        ctx.fillRect(rect.left, rectY, rect.width, rectH);
        ctx.strokeStyle = `rgba(255, 255, 255, ${ringAlpha * 2})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(rect.left, rectY, rect.width, rectH);
      }
      continue;
    }

    // Density scatter represents aggregate bins, not a single datum. A
    // nearest-point dot is misleading, so only point-rendered scatter gets
    // the unified indicator style.
    if (sc.type === 'scatter' && isDensityScatterSeries(sc, store.length)) continue;

    const px = xScale.dataToPixel(point.x);
    const py = yScale.dataToPixel(point.y);
    const r = sc.type === 'scatter' ? (point.radius ?? sc.pointRadius ?? 3) : 4;

    // On light backgrounds, a subtle drop-shadow gives the dot depth
    // without needing a dark ring stroke.
    if (!isDark) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 1;
    }

    // White ring slightly larger than the fill, acts as a clean halo.
    ctx.beginPath();
    ctx.arc(px, py, r + 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Clear shadow for the inner fill so it's crisp.
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Filled center with the series color
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = point.color;
    ctx.fill();
  }

  ctx.restore();
}
