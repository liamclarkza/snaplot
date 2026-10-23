/**
 * In-page geometry collection for `geometry.spec.ts`: DOM label boxes, the axes and the ink under
 * every finite datum. It reads only the public handle plus the untyped debug symbol (plan D31),
 * and prefers the final API (`scale(key).toPixel`, M8) when it exists.
 */
import type { ChartHandle, ChartOptions } from '../../src/index';
import type { GeometryReport, PageAxis, PageLabel, PageProbe, PageRect } from './page-api';

const DEBUG = Symbol.for('snaplot.debug');

interface DebugView {
  layers?: { data?: HTMLCanvasElement };
  labelBoxes?: () => Array<{ axis: string; kind: 'tick' | 'title'; text: string }>;
}

interface AxisView {
  type: string;
  min: number;
  max: number;
}

interface LayoutView {
  plot: { left: number; top: number; width: number; height: number };
  axes: Record<string, { position: PageAxis['position'] }>;
  dpr: number;
}

type AnyHandle = ChartHandle<any> & {
  scale?: (key: string) => { toPixel(value: number): number } | undefined;
};

function rect(r: DOMRect | PageRect): PageRect {
  return {
    left: r.left,
    top: r.top,
    right: r.right,
    bottom: r.bottom,
    width: r.width,
    height: r.height,
  };
}

function debugOf(chart: ChartHandle<any>): DebugView {
  return ((chart as unknown as Record<symbol, DebugView | undefined>)[DEBUG] ?? {}) as DebugView;
}

function layoutOf(chart: ChartHandle<any>): LayoutView {
  return chart.getLayout() as unknown as LayoutView;
}

function axisOf(chart: ChartHandle<any>, key: string): AxisView | undefined {
  return chart.getAxis(key) as AxisView | undefined;
}

function isHorizontal(layout: LayoutView, key: string): boolean {
  const position = layout.axes[key]?.position;
  return position ? position === 'top' || position === 'bottom' : key.startsWith('x');
}

/** CSS px relative to the chart host. */
function toPixel(chart: ChartHandle<any>, key: string, value: number): number {
  const final = (chart as AnyHandle).scale?.(key);
  if (final && typeof final.toPixel === 'function') return final.toPixel(value);
  const axis = axisOf(chart, key);
  const layout = layoutOf(chart);
  if (!axis) return Number.NaN;
  const { min, max } = axis;
  const t =
    axis.type === 'log'
      ? (Math.log10(value) - Math.log10(min)) / (Math.log10(max) - Math.log10(min))
      : (value - min) / (max - min);
  const plot = layout.plot;
  return isHorizontal(layout, key) ? plot.left + t * plot.width : plot.top + (1 - t) * plot.height;
}

function inDomain(chart: ChartHandle<any>, key: string, value: number): boolean {
  const axis = axisOf(chart, key);
  if (!axis || !Number.isFinite(value)) return false;
  const lo = Math.min(axis.min, axis.max);
  const hi = Math.max(axis.min, axis.max);
  return value >= lo && value <= hi && (axis.type !== 'log' || value > 0);
}

// ─── Labels ───

const COMPANION =
  '[role="tooltip"], [role="list"], [role="table"], table, button, [data-snaplot-legend]';

function labelElements(host: HTMLElement): HTMLElement[] {
  const marked = [...host.querySelectorAll<HTMLElement>('[data-snaplot-label]')];
  if (marked.length > 0) return marked;
  return [...host.querySelectorAll<HTMLElement>('span')].filter(
    (el) =>
      (el.textContent ?? '').trim() !== '' && !el.closest(COMPANION) && el.children.length === 0,
  );
}

function attributeByGeometry(label: PageLabel, plot: PageRect, layout: LayoutView): PageLabel {
  const cx = (label.rect.left + label.rect.right) / 2;
  const cy = (label.rect.top + label.rect.bottom) / 2;
  const want: PageAxis['position'] =
    cy > plot.bottom ? 'bottom' : cy < plot.top ? 'top' : cx < plot.left ? 'left' : 'right';
  const key = Object.keys(layout.axes).find((k) => layout.axes[k]?.position === want) ?? null;
  return { ...label, axis: key, kind: null };
}

function collectLabels(
  chart: ChartHandle<any>,
  host: HTMLElement,
  plot: PageRect,
): { labels: PageLabel[]; attribution: GeometryReport['attribution'] } {
  const layout = layoutOf(chart);
  const raw: PageLabel[] = labelElements(host).map((el) => ({
    text: (el.textContent ?? '').trim(),
    rect: rect(el.getBoundingClientRect()),
    axis: null,
    kind: null,
  }));
  const boxes = debugOf(chart).labelBoxes?.() ?? [];
  const zipped =
    boxes.length === raw.length && boxes.every((box, i) => box.text.trim() === raw[i]?.text);
  if (zipped) {
    return {
      labels: raw.map((label, i) => ({ ...label, axis: boxes[i]!.axis, kind: boxes[i]!.kind })),
      attribution: 'debug',
    };
  }
  return { labels: raw.map((l) => attributeByGeometry(l, plot, layout)), attribution: 'geometry' };
}

// ─── Datums ───

interface Datum {
  series: string;
  x: number;
  y: number;
  xAxis: string;
  yAxis: string;
  /** Bars and histograms are probed at half height across their slot. */
  slot: boolean;
}

type Accessor = string | ((row: any, index: number) => unknown) | undefined;

function read(row: any, accessor: Accessor, index: number): unknown {
  if (typeof accessor === 'function') return accessor(row, index);
  if (typeof accessor === 'string') return row?.[accessor];
  return undefined;
}

function rowsOf(source: unknown): { length: number; get(i: number, a: Accessor): unknown } | null {
  if (Array.isArray(source)) {
    return { length: source.length, get: (i, a) => read(source[i], a, i) };
  }
  const columns = (source as { columns?: Record<string, ArrayLike<number>> } | undefined)?.columns;
  if (columns) {
    const first = Object.values(columns)[0];
    return {
      length: first?.length ?? 0,
      get: (i, a) => (typeof a === 'string' ? columns[a]?.[i] : undefined),
    };
  }
  return null;
}

function collectDatums(
  chart: ChartHandle<any>,
  options: ChartOptions<any>,
  unprobed: string[],
): Datum[] {
  const out: Datum[] = [];
  const categories = new Map<string, Map<string, number>>();
  const categoryIndex = (axis: string, value: string): number => {
    let registry = categories.get(axis);
    if (!registry) {
      registry = new Map();
      const explicit = (options.axes?.[axis] as { categories?: readonly string[] } | undefined)
        ?.categories;
      for (const c of explicit ?? []) registry.set(c, registry.size);
      categories.set(axis, registry);
    }
    if (!registry.has(value)) registry.set(value, registry.size);
    return registry.get(value)!;
  };

  options.series.forEach((series: any, index: number) => {
    const id = String(series.id ?? (typeof series.y === 'string' ? series.y : `#${index}`));
    const type = series.type ?? 'line';
    const xAxis = series.xAxis ?? 'x';
    const yAxis = series.yAxis ?? 'y';
    if (type === 'scatter' && series.renderMode === 'density') {
      unprobed.push(`${id}: density`);
      return;
    }
    if (type === 'histogram') {
      const bins = series.data as { edges: ArrayLike<number>; counts: ArrayLike<number> };
      for (let k = 0; k < bins.counts.length; k++) {
        const count = bins.counts[k]!;
        if (!(count > 0)) continue;
        out.push({
          series: id,
          x: (bins.edges[k]! + bins.edges[k + 1]!) / 2,
          y: count / 2,
          xAxis,
          yAxis,
          slot: true,
        });
      }
      return;
    }
    const rows = rowsOf(series.data ?? options.data);
    if (!rows) {
      unprobed.push(`${id}: no row or column data`);
      return;
    }
    const xAccessor: Accessor = series.x ?? options.x;
    const xType = axisOf(chart, xAxis)?.type;
    for (let i = 0; i < rows.length; i++) {
      const rawX = rows.get(i, xAccessor);
      const rawY = rows.get(i, series.y);
      let x: number;
      if (rawX instanceof Date) x = rawX.getTime();
      else if (typeof rawX === 'string')
        x = xType === 'category' ? categoryIndex(xAxis, rawX) : Date.parse(rawX);
      else if (typeof rawX === 'number') x = rawX;
      else if (rawX === undefined && xAccessor === undefined) x = i;
      else continue;
      if (typeof rawY !== 'number' || !Number.isFinite(rawY) || !Number.isFinite(x)) continue;
      const bar = type === 'bar';
      if (bar && rawY === 0) continue;
      out.push({ series: id, x, y: bar ? rawY / 2 : rawY, xAxis, yAxis, slot: bar });
    }
  });
  return out;
}

function inkAt(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  dpr: number,
  px: number,
  py: number,
  rx: number,
  ry: number,
): boolean {
  const x0 = Math.max(0, Math.floor((px - rx) * dpr));
  const x1 = Math.min(width - 1, Math.ceil((px + rx) * dpr));
  const y0 = Math.max(0, Math.floor((py - ry) * dpr));
  const y1 = Math.min(height - 1, Math.ceil((py + ry) * dpr));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (data[(y * width + x) * 4 + 3]! > 0) return true;
    }
  }
  return false;
}

function collectProbes(
  chart: ChartHandle<any>,
  options: ChartOptions<any>,
  host: HTMLElement,
  unprobed: string[],
): PageProbe[] {
  const canvas =
    debugOf(chart).layers?.data ?? (host.querySelectorAll('canvas')[1] as HTMLCanvasElement | null);
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx || canvas.width === 0 || canvas.height === 0) {
    unprobed.push('no data canvas');
    return [];
  }
  const dpr = canvas.width / Math.max(1, canvas.getBoundingClientRect().width);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const datums = collectDatums(chart, options, unprobed).filter(
    (d) => inDomain(chart, d.xAxis, d.x) && inDomain(chart, d.yAxis, d.y),
  );

  // Half the smallest slot spacing per series, for bars and histograms.
  const slotHalf = new Map<string, number>();
  for (const d of datums) {
    if (!d.slot || slotHalf.has(d.series)) continue;
    const xs = [...new Set(datums.filter((o) => o.series === d.series).map((o) => o.x))]
      .map((x) => toPixel(chart, d.xAxis, x))
      .sort((a, b) => a - b);
    let gap = Number.POSITIVE_INFINITY;
    for (let i = 1; i < xs.length; i++) gap = Math.min(gap, xs[i]! - xs[i - 1]!);
    slotHalf.set(d.series, Number.isFinite(gap) ? Math.max(2, gap * 0.45) : 12);
  }

  const offset = canvas.getBoundingClientRect();
  const hostBox = host.getBoundingClientRect();
  const dx = offset.left - hostBox.left;
  const dy = offset.top - hostBox.top;
  return datums.map((d) => {
    const px = toPixel(chart, d.xAxis, d.x);
    const py = toPixel(chart, d.yAxis, d.y);
    const rx = d.slot ? (slotHalf.get(d.series) ?? 2) : 2;
    const ry = 2;
    return {
      series: d.series,
      x: d.x,
      y: d.y,
      px,
      py,
      rx,
      ry,
      inked: inkAt(pixels, canvas.width, canvas.height, dpr, px - dx, py - dy, rx, ry),
    };
  });
}

// ─── Report ───

export function collectGeometry(
  id: string,
  chart: ChartHandle<any>,
  options: ChartOptions<any>,
  host: HTMLElement,
): GeometryReport {
  const hostRect = rect(host.getBoundingClientRect());
  const layout = layoutOf(chart);
  const p = layout.plot;
  const plot = rect({
    left: hostRect.left + p.left,
    top: hostRect.top + p.top,
    right: hostRect.left + p.left + p.width,
    bottom: hostRect.top + p.top + p.height,
    width: p.width,
    height: p.height,
  });
  const axes: PageAxis[] = Object.entries(layout.axes).map(([key, info]) => {
    const horizontal = info.position === 'top' || info.position === 'bottom';
    return { key, position: info.position, horizontal, extent: horizontal ? p.width : p.height };
  });
  const { labels, attribution } = collectLabels(chart, host, plot);
  const unprobed: string[] = [];
  const probes = collectProbes(chart, options, host, unprobed);
  return { id, host: hostRect, plot, axes, labels, attribution, probes, unprobed };
}
