import type { TooltipPoint, TooltipConfig, ThemeConfig } from '../engine/spec';
import { TOOLTIP_OFFSET } from '../constants';
import { isDarkColor } from '../engine/theme/color';
import { prefersReducedMotion } from '../utils/motion';
import { adoptStyles } from './styles';

/**
 * The tooltip's presentational styles, adopted once per document (dom/styles.ts). Its placement
 * (fixed at the origin, above the page, inert to the pointer), visibility, fade (off under reduced
 * motion), theme colours and position stay inline per element: they are its behaviour, and inline
 * styles set through the CSSOM survive a CSP that blocks the stylesheet.
 */
export const TOOLTIP_CSS = `.snaplot-tooltip{padding:7px 10px;border-radius:6px;font-size:12px;font-variant-numeric:tabular-nums;line-height:1.45;max-width:280px;white-space:nowrap;contain:layout style paint;will-change:transform}
.snaplot-tooltip-dot{display:inline-block;flex-shrink:0;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}
.snaplot-tooltip-title{display:flex;align-items:center;margin-bottom:5px}
.snaplot-tooltip-strong{font-weight:600}
.snaplot-tooltip-grid{display:grid;grid-template-columns:auto auto;gap:2px 12px;font-variant-numeric:tabular-nums}
.snaplot-tooltip-fields{display:grid;grid-template-columns:auto auto;gap:2px 12px;margin-top:6px;font-variant-numeric:tabular-nums}
.snaplot-tooltip-key{opacity:0.7}
.snaplot-tooltip-value{font-weight:600;text-align:right}
.snaplot-tooltip-block+.snaplot-tooltip-block{margin-top:8px}
.snaplot-tooltip-header{margin-bottom:4px;opacity:0.7;font-size:11px}
.snaplot-tooltip-row{display:flex;align-items:center;gap:12px}
.snaplot-tooltip-name{display:flex;align-items:center;min-width:0;flex:1}
.snaplot-tooltip-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.snaplot-tooltip-amount{font-weight:600;flex-shrink:0}
.snaplot-tooltip-more{opacity:0.6;font-size:11px;margin-top:2px}`;

/**
 * Cap on rows in the default multi-series tooltip. Beyond this the list is
 * truncated to a "+N more" row so a chart with dozens of series does not
 * produce a tooltip taller than the viewport. The cap is on the default
 * renderer only; a caller's `render` override is free to show every row.
 */
const MAX_TOOLTIP_ROWS = 12;
/** Cap on point blocks (coincident scatter points) in the default tooltip. */
const MAX_TOOLTIP_POINTS = 4;
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
  const { clientX, clientY, width, height, viewportWidth, viewportHeight, offset, pointerType } =
    input;
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
  const left = right + width <= viewportWidth - margin ? right : clientX - offset - width;
  const below = clientY + offset;
  const top = below + height <= viewportHeight - margin ? below : clientY - offset - height;
  return { left: clampLeft(left), top: clampTop(top) };
}

/** Structural width key: changing numeric values of the same width is layout-stable. */
export function tooltipMeasurementKey(points: TooltipPoint[]): string {
  const widths = (value: string) => value.length;
  return points
    .map((point) =>
      [
        point.xRange ? 'range' : 'point',
        widths(point.label),
        widths(point.formattedX),
        widths(point.formattedY),
        ...(point.fields ?? []).flatMap((field) => [widths(field.label), widths(field.formatted)]),
      ].join(':'),
    )
    .join('|');
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

  constructor(
    theme: ThemeConfig,
    /** The chart's host: the tooltip mounts in the open dialog or fullscreen element around it. */
    private readonly anchor?: HTMLElement,
  ) {
    adoptStyles(document, 'tooltip', TOOLTIP_CSS);
    this.el = document.createElement('div');
    this.el.className = 'snaplot-tooltip';
    // Reduced motion: drop the fade so the tooltip appears instantly rather
    // than transitioning opacity. Read once at construction from the cached
    // query, never per show().
    const transition = prefersReducedMotion() ? 'none' : 'opacity 0.1s ease';
    this.el.style.cssText = `position:fixed;left:0;top:0;z-index:10000;pointer-events:none;opacity:0;transition:${transition};`;
    this.el.setAttribute('aria-hidden', 'true');
    this.applyTheme(theme);
    document.body.appendChild(this.el);
  }

  /**
   * Where the tooltip lives (plan §5.5): in the nearest open `<dialog>` or fullscreen element
   * around the chart, which sit in the top layer above `document.body`, else in the body.
   */
  private mountPoint(): HTMLElement {
    const dialog = this.anchor?.closest('dialog');
    if (dialog?.open) return dialog;
    const fullscreen = document.fullscreenElement as HTMLElement | null;
    if (fullscreen && this.anchor && fullscreen.contains(this.anchor)) return fullscreen;
    return document.body;
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
    const parent = this.mountPoint();
    if (this.el.parentElement !== parent) parent.appendChild(this.el);

    // Render content. When the caller returns a string it is treated as
    // trusted HTML (fast path, matches ChartSpec.tooltip.render's documented
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
    if (this.lastWidth === 0 || this.lastHeight === 0 || (contentChanged && geometryChanged)) {
      this.lastWidth = this.el.offsetWidth;
      this.lastHeight = this.el.offsetHeight;
      this.lastMeasurementKey = measurementKey;
    }
    const viewportWidth =
      window.innerWidth ||
      document.documentElement.clientWidth ||
      this.lastWidth + TOOLTIP_VIEWPORT_MARGIN * 2;
    const viewportHeight =
      window.innerHeight ||
      document.documentElement.clientHeight ||
      this.lastHeight + TOOLTIP_VIEWPORT_MARGIN * 2;
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
      `<span class="snaplot-tooltip-dot" style="background:${escapeHtml(color)}"></span>`;

    // A histogram point represents an interval, not an arbitrary coordinate.
    if (points.length === 1 && points[0].xRange) {
      const p = points[0];
      return `<div class="snaplot-tooltip-title">${dot(p.color)}<span class="snaplot-tooltip-strong">${escapeHtml(p.label)}</span></div>
        <div class="snaplot-tooltip-grid">
          <span class="snaplot-tooltip-key">Range</span><span class="snaplot-tooltip-value">${escapeHtml(p.formattedX)}</span>
          <span class="snaplot-tooltip-key">Count</span><span class="snaplot-tooltip-value">${escapeHtml(p.formattedY)}</span>
        </div>`;
    }

    // Point-cloud points (nearest mode): one block per point, the series named above its rows,
    // each value named by its axis title or field (then the colour category and tooltipFields in
    // order). Coincident points are all listed.
    if (points.every((p) => p.radius !== undefined)) {
      const pair = (key: string, value: string) =>
        `<span class="snaplot-tooltip-key">${escapeHtml(key)}</span>\n<span class="snaplot-tooltip-value">${escapeHtml(value)}</span>\n`;
      const shown = points.slice(0, MAX_TOOLTIP_POINTS);
      let html = '';
      for (const p of shown) {
        const fields = (p.fields ?? []).map((field) => pair(field.label, field.formatted)).join('');
        html += `<div class="snaplot-tooltip-block"><div class="snaplot-tooltip-title">${dot(p.color)}<span class="snaplot-tooltip-strong">${escapeHtml(p.label)}</span></div>
        <div class="snaplot-tooltip-grid">${pair(p.xName ?? 'x', p.formattedX)}${pair(p.yName ?? 'y', p.formattedY)}${fields}</div></div>`;
      }
      if (points.length > shown.length) {
        html += `<div class="snaplot-tooltip-more">+${points.length - shown.length} more</div>`;
      }
      return html;
    }

    // Every other mark: the formatted X, then a row per series in series order (one row too).
    const header = `<div class="snaplot-tooltip-header">${escapeHtml(points[0].formattedX)}</div>`;

    // Truncate long series lists so the box cannot outgrow the viewport. The
    // label ellipsizes (flex child with min-width:0) while the value stays
    // pinned right and never shrinks.
    const shown = points.length > MAX_TOOLTIP_ROWS ? MAX_TOOLTIP_ROWS - 1 : points.length;
    let rows = '';
    for (let i = 0; i < shown; i++) {
      const p = points[i];
      rows += `<div class="snaplot-tooltip-row">
        <span class="snaplot-tooltip-name">${dot(p.color)}<span class="snaplot-tooltip-label">${escapeHtml(p.label)}</span></span>
        <span class="snaplot-tooltip-amount">${escapeHtml(p.formattedY)}</span>
      </div>`;
    }
    if (points.length > shown) {
      rows += `<div class="snaplot-tooltip-more">+${points.length - shown} more</div>`;
    }

    return header + rows;
  }
}
