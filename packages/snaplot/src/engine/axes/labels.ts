/**
 * Axis labels: the tick and title labels a grid paint lays out (`LabelBox[]`), the corner pass that
 * keeps a horizontal and a vertical label from colliding, and the pooled DOM spans that show them.
 */
import type { AxisPosition, Layout, ThemeConfig } from '../spec';
import { AXIS_CORNER_GAP } from '../../constants';
import { measureLabel } from '../layout';

/**
 * One axis label as a grid paint lays it out: the W5 layout type (plan §3.2). `axes/render.ts`
 * produces a `LabelBox[]` in paint order (axis by axis in options order, ticks then the title),
 * `updateDOMLabels` shows it in pooled spans, the engine keeps the last one and the debug hook's
 * `labelBoxes()` returns copies of it. M10 owns the type and extends it (the measured box, once
 * tick selection measures labels as rendered); other modules read boxes and never build them.
 */
export interface LabelBox {
  /** The axis key in `axes` (`'x'`, `'y'`, `'y2'`, …). */
  axis: string;
  /** A tick label, or the axis title (in the outer gutter strip, rotated on vertical axes). */
  kind: 'tick' | 'title';
  text: string;
  /** The anchor point, in CSS pixels from the canvases' top-left corner. */
  x: number;
  y: number;
  /**
   * The part of the text on the anchor along its axis: `'end'` for left ticks (right-aligned),
   * `'start'` for right ticks, `'middle'` for horizontal ticks and every title.
   */
  anchor: 'start' | 'middle' | 'end';
}

export interface AxesRenderResult {
  /** Every label of the paint, in paint order. */
  labels: LabelBox[];
}

export function resolveAxisCornerCollisions(
  result: AxesRenderResult,
  layout: Layout,
  theme: ThemeConfig,
): void {
  const lineHeight = theme.fontSize * 1.4;
  const horizontal: Array<{ label: LabelBox; position: 'top' | 'bottom' }> = [];
  const vertical: Array<{ label: LabelBox; position: 'left' | 'right' }> = [];

  for (const label of result.labels) {
    const position = layout.axes[label.axis]?.position;
    if (!position) continue;
    if (label.kind === 'title') continue;
    if (position === 'top' || position === 'bottom') horizontal.push({ label, position });
    else vertical.push({ label, position });
  }

  for (const h of horizontal) {
    const hWidth = measureLabel(h.label.text, theme.fontFamily, theme.fontSize);
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

/** The tick label transform by axis position: right-aligned on the left, centred under or above. */
const TICK_STYLE: Readonly<Record<AxisPosition, string>> = {
  left: 'text-align:right;transform:translate(-100%, -50%);',
  right: 'transform:translateY(-50%);',
  top: 'text-align:center;transform:translate(-50%, -100%);',
  bottom: 'transform:translateX(-50%);',
};

/** Titles centre on their anchor point and rotate to read along vertical axes. */
const TITLE_STYLE: Readonly<Record<AxisPosition, string>> = {
  left: 'transform:translate(-50%, -50%) rotate(-90deg);',
  right: 'transform:translate(-50%, -50%) rotate(90deg);',
  top: 'transform:translate(-50%, -50%);',
  bottom: 'transform:translate(-50%, -50%);',
};

/**
 * Update DOM labels from a paint's `LabelBox[]`.
 *
 * Spans are pooled and updated in place: the grid layer redraws on every
 * pan/zoom frame, and rebuilding all label nodes per frame (the previous
 * innerHTML approach) churned the DOM at gesture rate. The static style
 * (font, color, transform) is stamped only when its signature changes;
 * steady-state frames touch just left/top/textContent. Titles and tick
 * labels share one quiet text role.
 */
export function updateDOMLabels(
  domLayer: HTMLDivElement,
  axesResult: AxesRenderResult,
  theme: ThemeConfig,
  layout: Layout,
): void {
  const baseStyle = `position:absolute;font-family:${theme.fontFamily};font-size:${theme.fontSize}px;font-variant-numeric:tabular-nums;color:${theme.axisLabelColor ?? theme.textColor};white-space:nowrap;pointer-events:none;forced-color-adjust:none;`;

  const pool = domLayer.children;
  let used = 0;

  for (const label of axesResult.labels) {
    const axisInfo = layout.axes[label.axis];
    if (!axisInfo) continue;

    let el = pool[used] as HTMLSpanElement | undefined;
    if (!el) {
      el = document.createElement('span');
      domLayer.appendChild(el);
    }
    used++;

    const pos = axisInfo.position;
    const styleSig = baseStyle + (label.kind === 'title' ? TITLE_STYLE[pos] : TICK_STYLE[pos]);
    if (el.dataset.labelStyle !== styleSig) {
      el.style.cssText = styleSig;
      el.dataset.labelStyle = styleSig;
    }
    el.style.left = label.x + 'px';
    el.style.top = label.y + 'px';
    if (el.textContent !== label.text) el.textContent = label.text;
  }

  while (domLayer.children.length > used) {
    domLayer.lastChild?.remove();
  }
}
