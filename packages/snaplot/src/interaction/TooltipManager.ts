import type { TooltipPoint, TooltipConfig, ThemeConfig } from '../types';
import { TOOLTIP_OFFSET } from '../constants';

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

  constructor(theme: ThemeConfig) {
    this.el = document.createElement('div');
    this.el.style.cssText = `
      position: fixed;
      z-index: 10000;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.1s ease;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      line-height: 1.5;
      max-width: 320px;
      white-space: nowrap;
    `;
    this.applyTheme(theme);
    document.body.appendChild(this.el);
  }

  applyTheme(theme: ThemeConfig): void {
    this.el.style.backgroundColor = theme.tooltipBackground;
    this.el.style.color = theme.tooltipTextColor;
    this.el.style.border = `1px solid ${theme.tooltipBorderColor}`;
    this.el.style.fontFamily = theme.fontFamily;
    // Subtle shadow on light backgrounds; deeper glow on dark.
    const isDark = this.isBackgroundDark(theme.tooltipBackground);
    this.el.style.boxShadow = isDark
      ? '0 4px 12px rgba(0, 0, 0, 0.4)'
      : '0 2px 8px rgba(0, 0, 0, 0.1)';
  }

  private isBackgroundDark(bg: string): boolean {
    if (bg.startsWith('#')) {
      const r = parseInt(bg.slice(1, 3), 16);
      const g = parseInt(bg.slice(3, 5), 16);
      const b = parseInt(bg.slice(5, 7), 16);
      return (r * 0.299 + g * 0.587 + b * 0.114) < 128;
    }
    const m = bg.match(/\d+/g);
    if (m && m.length >= 3) {
      return (Number(m[0]) * 0.299 + Number(m[1]) * 0.587 + Number(m[2]) * 0.114) < 128;
    }
    return true;
  }

  show(
    points: TooltipPoint[],
    clientX: number,
    clientY: number,
    config?: TooltipConfig,
  ): void {
    if (points.length === 0) {
      this.hide();
      return;
    }

    // Render content. When the caller returns a string it is treated as
    // trusted HTML (fast path, matches ChartConfig.tooltip.render's documented
    // contract). Callers rendering user-controlled data should return a DOM
    // node or pre-escape their string. The default renderer already escapes.
    if (config?.render) {
      const content = config.render(points);
      if (typeof content === 'string') {
        this.el.innerHTML = content;
      } else {
        this.el.innerHTML = '';
        this.el.appendChild(content);
      }
    } else {
      this.el.innerHTML = this.defaultRender(points);
    }

    this.el.style.opacity = '1';
    this.visible = true;

    const offset = config?.offset ?? TOOLTIP_OFFSET;
    this.el.style.left = (clientX + offset) + 'px';
    this.el.style.top = (clientY + offset) + 'px';
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
      `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${escapeHtml(color)};margin-right:6px;vertical-align:middle"></span>`;

    // Single point (nearest mode, e.g. scatter): show x, y as coordinate pair
    if (points.length === 1) {
      const p = points[0];
      return `<div style="display:flex;align-items:center;gap:8px">${dot(p.color)}<span style="font-variant-numeric:tabular-nums"><b>x</b> ${escapeHtml(p.formattedX)}&nbsp;&nbsp;<b>y</b> ${escapeHtml(p.formattedY)}</span></div>`;
    }

    // Multiple points (index mode, e.g. time series): header + rows
    const header = `<div style="margin-bottom:4px;opacity:0.7;font-size:11px">${escapeHtml(points[0].formattedX)}</div>`;

    const rows = points.map(p => {
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <span>${dot(p.color)}${escapeHtml(p.label)}</span>
        <span style="font-weight:600">${escapeHtml(p.formattedY)}</span>
      </div>`;
    }).join('');

    return header + rows;
  }
}
