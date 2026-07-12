import type { TooltipPoint, TooltipConfig, ThemeConfig } from '../types';
import { TOOLTIP_OFFSET } from '../constants';
import { isDarkColor } from '../utils/color';
import { prefersReducedMotion } from '../utils/motion';

/**
 * Cap on rows in the default multi-series tooltip. Beyond this the list is
 * truncated to a "+N more" row so a chart with dozens of series does not
 * produce a tooltip taller than the viewport. The cap is on the default
 * renderer only; a caller's `render` override is free to show every row.
 */
const MAX_TOOLTIP_ROWS = 12;
const TOOLTIP_VIEWPORT_MARGIN = 8;

interface TooltipPositionInput {
  clientX: number;
  clientY: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  offset: number;
  pointerType?: 'mouse' | 'touch' | 'pen';
}

/** Pure placement helper kept exported for deterministic edge-collision tests. */
export function computeTooltipPosition(input: TooltipPositionInput): { left: number; top: number } {
  const {
    clientX, clientY, width, height, viewportWidth, viewportHeight, offset, pointerType,
  } = input;
  const margin = TOOLTIP_VIEWPORT_MARGIN;
  const maxLeft = Math.max(margin, viewportWidth - width - margin);
  const maxTop = Math.max(margin, viewportHeight - height - margin);
  const clampLeft = (value: number) => Math.max(margin, Math.min(maxLeft, value));
  const clampTop = (value: number) => Math.max(margin, Math.min(maxTop, value));

  if (pointerType === 'touch' || pointerType === 'pen') {
    const clearance = Math.max(offset, 72);
    const above = clientY - height - clearance;
    const below = clientY + clearance;
    const top = above >= margin || below + height > viewportHeight - margin ? above : below;
    return { left: clampLeft(clientX - width / 2), top: clampTop(top) };
  }

  const right = clientX + offset;
  const left = right + width <= viewportWidth - margin
    ? right
    : clientX - offset - width;
  const below = clientY + offset;
  const top = below + height <= viewportHeight - margin
    ? below
    : clientY - offset - height;
  return { left: clampLeft(left), top: clampTop(top) };
}

/** Structural width key: changing numeric values of the same width is layout-stable. */
export function tooltipMeasurementKey(points: TooltipPoint[]): string {
  const widths = (value: string) => value.length;
  return points.map(point => [
    point.xRange ? 'range' : 'point',
    widths(point.label),
    widths(point.formattedX),
    widths(point.formattedY),
    ...(point.fields ?? []).flatMap(field => [widths(field.label), widths(field.formatted)]),
  ].join(':')).join('|');
}

/** Escape the five characters that matter for HTML attribute + text contexts. */
function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * DOM-based tooltip using position:fixed.
 * Shown only when cursor is near data points (proximity gated by HitTester).
 * No flip logic needed, tooltip can overflow chart bounds freely.
 */
export class TooltipManager {
  private el: HTMLDivElement;
  private visible = false;
  // Last HTML string written and the dimensions it measured to. Lets a
  // repeated show() with identical content skip the innerHTML write and the
  // offsetWidth/offsetHeight reads (which force a synchronous layout).
  private lastHtml: string | null = null;
  private lastWidth = 0;
  private lastHeight = 0;
  private lastMeasurementKey: string | null = null;

  constructor(theme: ThemeConfig) {
    this.el = document.createElement('div');
    // Reduced motion: drop the fade so the tooltip appears instantly rather
    // than transitioning opacity. Read once at construction from the cached
    // query, never per show().
    const transition = prefersReducedMotion() ? 'none' : 'opacity 0.1s ease';
    this.el.style.cssText = `
      position: fixed;
      left: 0;
      top: 0;
      z-index: 10000;
      pointer-events: none;
      opacity: 0;
      transition: ${transition};
      padding: 7px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      line-height: 1.45;
      max-width: 280px;
      white-space: nowrap;
      contain: layout style paint;
      will-change: transform;
    `;
    this.applyTheme(theme);
    document.body.appendChild(this.el);
  }

  applyTheme(theme: ThemeConfig): void {
    this.el.style.backgroundColor = theme.tooltipBackground;
    this.el.style.color = theme.tooltipTextColor;
    this.el.style.border = `1px solid ${theme.tooltipBorderColor}`;
    this.el.style.fontFamily = theme.fontFamily;
    this.lastWidth = 0;
    this.lastHeight = 0;
    this.lastMeasurementKey = null;
    // Elevation is a two-layer shadow (ambient + contact) whose strength is
    // derived from the background darkness: a dark surface needs a deeper cast
    // to separate from a dark page, a light surface only a soft lift.
    const isDark = this.isBackgroundDark(theme.tooltipBackground);
    this.el.style.boxShadow = isDark
      ? '0 6px 16px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.4)'
      : '0 4px 12px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08)';
  }

  private isBackgroundDark(bg: string): boolean {
    // Unparseable backgrounds keep the previous default: assume dark so a
    // deep glow shadow is used.
    return isDarkColor(bg, true);
  }

  show(
    points: TooltipPoint[],
    clientX: number,
    clientY: number,
    config?: TooltipConfig,
    pointerType?: 'mouse' | 'touch' | 'pen',
  ): void {
    if (points.length === 0) {
      this.hide();
      return;
    }

    // Render content. When the caller returns a string it is treated as
    // trusted HTML (fast path, matches ChartConfig.tooltip.render's documented
    // contract). Callers rendering user-controlled data should return a DOM
    // node or pre-escape their string. The default renderer already escapes.
    //
    // A string identical to the last one written is a no-op: streaming ticks
    // and cursor moves along a flat run repeatedly produce the same markup,
    // and re-assigning innerHTML would re-parse the subtree and invalidate
    // the cached measurement below.
    let contentChanged = true;
    let measurementKey: string | null = null;
    if (config?.render) {
      const content = config.render(points);
      if (typeof content === 'string') {
        if (content === this.lastHtml) {
          contentChanged = false;
        } else {
          this.el.innerHTML = content;
          this.lastHtml = content;
        }
      } else {
        this.el.innerHTML = '';
        this.el.appendChild(content);
        this.lastHtml = null;
      }
    } else {
      measurementKey = tooltipMeasurementKey(points);
      const html = this.defaultRender(points);
      if (html === this.lastHtml) {
        contentChanged = false;
      } else {
        this.el.innerHTML = html;
        this.lastHtml = html;
      }
    }

    this.el.style.opacity = '1';
    this.visible = true;

    const offset = config?.offset ?? TOOLTIP_OFFSET;
    // Reading offset* forces layout; reuse the last measurement when the
    // content (and therefore the box size) has not changed.
    const geometryChanged = measurementKey === null || measurementKey !== this.lastMeasurementKey;
    if (
      this.lastWidth === 0 ||
      this.lastHeight === 0 ||
      (contentChanged && geometryChanged)
    ) {
      this.lastWidth = this.el.offsetWidth;
      this.lastHeight = this.el.offsetHeight;
      this.lastMeasurementKey = measurementKey;
    }
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || this.lastWidth + TOOLTIP_VIEWPORT_MARGIN * 2;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || this.lastHeight + TOOLTIP_VIEWPORT_MARGIN * 2;
    const position = computeTooltipPosition({
      clientX,
      clientY,
      width: this.lastWidth,
      height: this.lastHeight,
      viewportWidth,
      viewportHeight,
      offset,
      pointerType,
    });
    this.el.style.transform = `translate3d(${position.left}px, ${position.top}px, 0)`;
  }

  hide(): void {
    if (!this.visible) return;
    this.el.style.opacity = '0';
    this.visible = false;
  }

  destroy(): void {
    this.el.remove();
  }

  /**
   * Build the default tooltip DOM. All dynamic strings (labels, formatted
   * values, colours) are HTML-escaped so a series name like
   * `<img src=x onerror=alert(1)>` cannot execute.
   *
   * Colour strings are also escaped, they land in a `style` attribute, so
   * a crafted colour could otherwise break out of the attribute context.
   */
  private defaultRender(points: TooltipPoint[]): string {
    const dot = (color: string) =>
      `<span style="display:inline-block;flex-shrink:0;width:8px;height:8px;border-radius:50%;background:${escapeHtml(color)};margin-right:6px;vertical-align:middle"></span>`;

    // A histogram point represents an interval, not an arbitrary coordinate.
    if (points.length === 1 && points[0].xRange) {
      const p = points[0];
      return `<div style="display:flex;align-items:center;margin-bottom:5px">${dot(p.color)}<span style="font-weight:600">${escapeHtml(p.label)}</span></div>
        <div style="display:grid;grid-template-columns:auto auto;gap:2px 12px;font-variant-numeric:tabular-nums">
          <span style="opacity:0.7">Range</span><span style="font-weight:600;text-align:right">${escapeHtml(p.formattedX)}</span>
          <span style="opacity:0.7">Count</span><span style="font-weight:600;text-align:right">${escapeHtml(p.formattedY)}</span>
        </div>`;
    }

    // Single point (nearest mode, e.g. scatter): show x, y as coordinate pair
    if (points.length === 1) {
      const p = points[0];
      const fields = p.fields && p.fields.length > 0
        ? `<div style="display:grid;grid-template-columns:auto auto;gap:2px 12px;margin-top:6px;font-variant-numeric:tabular-nums">${p.fields.map((field) => `
          <span style="opacity:0.7">${escapeHtml(field.label)}</span>
          <span style="font-weight:600;text-align:right">${escapeHtml(field.formatted)}</span>
        `).join('')}</div>`
        : '';
      return `<div style="display:flex;align-items:center;gap:8px">${dot(p.color)}<span style="font-variant-numeric:tabular-nums"><b>x</b> ${escapeHtml(p.formattedX)}&nbsp;&nbsp;<b>y</b> ${escapeHtml(p.formattedY)}</span></div>${fields}`;
    }

    // Multiple points (index mode, e.g. time series): header + rows
    const header = `<div style="margin-bottom:4px;opacity:0.7;font-size:11px">${escapeHtml(points[0].formattedX)}</div>`;

    // Truncate long series lists so the box cannot outgrow the viewport. The
    // label ellipsizes (flex child with min-width:0) while the value stays
    // pinned right and never shrinks.
    const shown = points.length > MAX_TOOLTIP_ROWS ? MAX_TOOLTIP_ROWS - 1 : points.length;
    let rows = '';
    for (let i = 0; i < shown; i++) {
      const p = points[i];
      rows += `<div style="display:flex;align-items:center;gap:12px">
        <span style="display:flex;align-items:center;min-width:0;flex:1">${dot(p.color)}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(p.label)}</span></span>
        <span style="font-weight:600;flex-shrink:0">${escapeHtml(p.formattedY)}</span>
      </div>`;
    }
    if (points.length > shown) {
      rows += `<div style="opacity:0.6;font-size:11px;margin-top:2px">+${points.length - shown} more</div>`;
    }

    return header + rows;
  }
}
