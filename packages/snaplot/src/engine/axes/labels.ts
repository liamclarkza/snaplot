/**
 * Axis labels: the tick and title labels a grid paint lays out, the corner pass that keeps a
 * horizontal and a vertical label from colliding, and the pooled DOM spans that show them.
 */
import type { Layout, ThemeConfig } from '../spec';
import { AXIS_CORNER_GAP } from '../../constants';

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

export function resolveAxisCornerCollisions(
  result: AxesRenderResult,
  layout: Layout,
  theme: ThemeConfig,
  ctx: CanvasRenderingContext2D,
): void {
  const lineHeight = theme.fontSize * 1.4;
  const horizontal: Array<{ label: AxisLabel; position: 'top' | 'bottom' }> = [];
  const vertical: Array<{ label: AxisLabel; position: 'left' | 'right' }> = [];

  ctx.font = `${theme.fontSize}px ${theme.fontFamily}`;
  for (const [key, labels] of result.labels) {
    const position = layout.axes[key]?.position;
    if (!position) continue;
    for (const label of labels) {
      if (label.kind === 'title') continue;
      if (position === 'top' || position === 'bottom') horizontal.push({ label, position });
      else vertical.push({ label, position });
    }
  }

  for (const h of horizontal) {
    const hWidth = ctx.measureText(h.label.text).width;
    for (const v of vertical) {
      const sameCorner =
        (v.position === 'left' && h.label.x <= layout.plot.left + hWidth) ||
        (v.position === 'right' && h.label.x >= layout.plot.left + layout.plot.width - hWidth);
      if (!sameCorner) continue;

      const hTop = h.position === 'bottom' ? h.label.y : h.label.y - lineHeight;
      const hBottom = hTop + lineHeight;
      const vTop = v.label.y - lineHeight / 2;
      const vBottom = v.label.y + lineHeight / 2;
      if (Math.min(hBottom, vBottom) <= Math.max(hTop, vTop)) continue;

      if (v.position === 'left') {
        const vRight = v.label.x;
        const hLeft = h.label.x - hWidth / 2;
        const overlap = vRight + AXIS_CORNER_GAP - hLeft;
        if (overlap > 0) h.label.x += overlap;
      } else {
        const vLeft = v.label.x;
        const hRight = h.label.x + hWidth / 2;
        const overlap = hRight + AXIS_CORNER_GAP - vLeft;
        if (overlap > 0) h.label.x -= overlap;
      }
    }
  }
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
  const baseStyle = `position:absolute;font-family:${theme.fontFamily};font-size:${theme.fontSize}px;font-variant-numeric:tabular-nums;color:${theme.axisLabelColor ?? theme.textColor};white-space:nowrap;pointer-events:none;`;

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
        posStyle = 'text-align:center;transform:translate(-50%, -100%);';
        break;
      default:
        posStyle = 'transform:translateX(-50%);';
        break;
    }
    // Titles center on their anchor point and rotate to read along
    // vertical axes. Titles and tick labels share one quiet text role.
    const vertical = pos === 'left' || pos === 'right';
    const titleStyle =
      `transform:translate(-50%, -50%)` +
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
