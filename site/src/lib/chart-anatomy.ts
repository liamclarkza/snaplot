/**
 * The figures of the chart anatomy page (chart-anatomy.mdx): live charts with their layout drawn
 * over them. Nothing is simulated: the plot comes from the chart's scales and every label box from
 * the label as it rendered, so the figures show what the layout did.
 *
 * - `<snaplot-anatomy>` (ChartAnatomy.astro): one chart and its regions, with controls for the
 *   tick labels, the titles, the legend, a second y axis and `minGutters.y`.
 * - `<snaplot-plot-alignment>` (PlotAlignment.astro): two charts whose y labels differ, measured
 *   on their own, linked by a group, or given the same `minGutters.y`.
 *
 * Both mount on first sight, as the examples do (vanilla-mount.ts).
 */
import type { ChartGroup, ChartHandle, ChartOptions } from 'snaplot';

/** EDGE_MARGIN, and AXIS_TICK_LENGTH + AXIS_LABEL_GAP, in the library's constants.ts. */
const EDGE = 8;
const TICK_AND_GAP = 8;
/** The gap the legend reserves with its height (LEGEND_GAP in the library's legend.ts). */
const LEGEND_GAP = 4;
const SVG = 'http://www.w3.org/2000/svg';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Row {
  step: number;
  train: number;
  validation: number;
  accuracy: number;
}

/** Y values of three widths of label: the chart picks its own ticks from them. */
const LABELS = {
  short: { low: 0.12, high: 1.9, title: 'Loss' },
  decimal: { low: 0.0164, high: 0.0256, title: 'Loss' },
  long: { low: 90_000, high: 1_180_000, title: 'Tokens per second' },
} as const;
type Labels = keyof typeof LABELS;

/** A training run: loss falling over 10,000 steps, validation above training, accuracy rising. */
function rows(labels: Labels): Row[] {
  const { low, high } = LABELS[labels];
  return Array.from({ length: 51 }, (_, i) => {
    const step = i * 200;
    const fall = Math.exp(-step / 2400);
    const wobble = 0.012 * Math.sin(i * 1.7) + 0.008 * Math.sin(i * 0.6);
    const train = low + (high - low) * Math.max(0, fall + wobble);
    const validation = low + (high - low) * Math.min(1, 0.06 + 0.94 * fall + 0.6 * wobble);
    return { step, train, validation, accuracy: 0.52 + 0.43 * (1 - fall) + wobble };
  });
}

interface Measured {
  width: number;
  height: number;
  plot: Rect;
  legend: Rect | null;
  labels: { side: 'left' | 'right' | 'top' | 'bottom'; box: Rect }[];
}

/**
 * The chart's layout as it rendered, in CSS pixels from the surface's top-left corner (the
 * canvases fill the surface, and `toPixel` measures from their corner).
 */
function measure(chart: ChartHandle<Row>, host: HTMLElement): Measured | null {
  const surface = host.querySelector<HTMLElement>('.snaplot-surface');
  const x = chart.scale('x');
  const y = chart.scale('y');
  if (!surface || !x || !y) return null;
  const origin = surface.getBoundingClientRect();
  const local = (r: DOMRect): Rect => ({
    x: r.left - origin.left,
    y: r.top - origin.top,
    w: r.width,
    h: r.height,
  });
  const left = x.toPixel(x.min);
  const top = y.toPixel(y.max);
  const plot = { x: left, y: top, w: x.toPixel(x.max) - left, h: y.toPixel(y.min) - top };
  // The legend's strip: its height and the gap it reserves on the plot's side.
  const legendRoot = host.querySelector<HTMLElement>('.snaplot-legend-root');
  let legend: Rect | null = null;
  if (legendRoot?.offsetHeight) {
    const box = local(legendRoot.getBoundingClientRect());
    const h = Math.ceil(box.h + LEGEND_GAP);
    legend = { x: 0, y: box.y < origin.height / 2 ? 0 : origin.height - h, w: origin.width, h };
  }
  // The labels are spans in the surface's text layer, the one element beside the canvases that
  // hides from assistive technology.
  const layer = surface.querySelector(':scope > div[aria-hidden="true"]');
  const labels: Measured['labels'] = [];
  for (const span of layer?.querySelectorAll('span') ?? []) {
    if (!span.textContent) continue;
    const box = local(span.getBoundingClientRect());
    if (box.w === 0) continue;
    const side =
      box.y >= plot.y + plot.h - 0.5
        ? 'bottom'
        : box.x + box.w <= plot.x + 0.5
          ? 'left'
          : box.x >= plot.x + plot.w - 0.5
            ? 'right'
            : 'top';
    labels.push({ side, box });
  }
  return { width: origin.width, height: origin.height, plot, legend, labels };
}

function element<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function rect(r: Rect, kind: string): SVGRectElement {
  return element('rect', {
    x: r.x,
    y: r.y,
    width: Math.max(0, r.w),
    height: Math.max(0, r.h),
    class: `anatomy-${kind}`,
    'data-kind': kind,
  });
}

/** Sizes an overlay to its surface and clears it, keeping its `<defs>`. */
function resetOverlay(svg: SVGSVGElement, m: Measured): void {
  svg.setAttribute('viewBox', `0 0 ${m.width} ${m.height}`);
  svg.setAttribute('width', String(m.width));
  svg.setAttribute('height', String(m.height));
  for (const child of [...svg.children]) if (child.tagName !== 'defs') child.remove();
}

const px = (value: number) => `${Math.round(value)} px`;

/** Every frame the chart takes to repaint after an update, then `run`. */
function afterPaint(run: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(run));
}

/**
 * Mounts `start` once the element is first on screen; `stop` runs when it leaves the page. It
 * draws again whenever it resizes or a chart's labels change: a chart well below the viewport
 * paints only as it is scrolled toward, after the figure's first draw.
 */
abstract class OnSight extends HTMLElement {
  #observer: IntersectionObserver | undefined;
  #resize: ResizeObserver | undefined;
  #labels: MutationObserver | undefined;
  #pending = false;
  #started = false;
  #gone = false;

  connectedCallback(): void {
    this.#gone = false;
    this.#observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting) || this.#started) return;
      this.#observer?.disconnect();
      this.#started = true;
      void import('snaplot').then((snaplot) => {
        if (this.#gone) return;
        this.start(snaplot);
        this.#resize = new ResizeObserver(() => this.redraw());
        this.#resize.observe(this);
        // The overlays sit beside the chart hosts, so drawing them changes nothing watched here.
        this.#labels = new MutationObserver(() => this.redraw());
        for (const host of this.querySelectorAll('[data-chart]')) {
          this.#labels.observe(host, { childList: true, subtree: true, characterData: true });
        }
      });
    });
    this.#observer.observe(this);
  }

  disconnectedCallback(): void {
    this.#gone = true;
    this.#observer?.disconnect();
    this.#resize?.disconnect();
    this.#labels?.disconnect();
    this.stop();
  }

  /** Draws once the charts have repainted; any number of calls in a frame draw once. */
  protected redraw(): void {
    if (this.#pending) return;
    this.#pending = true;
    afterPaint(() => {
      this.#pending = false;
      this.draw();
    });
  }

  protected abstract start(snaplot: typeof import('snaplot')): void;
  protected abstract draw(): void;
  protected abstract stop(): void;
}

// ─── One chart's anatomy ─────────────────────────────────────────────────────────────────────

interface AnatomyState {
  labels: Labels;
  titles: boolean;
  legend: boolean;
  right: boolean;
  min: number;
}

function anatomyOptions(state: AnatomyState): ChartOptions<Row> {
  const { title } = LABELS[state.labels];
  const series: ChartOptions<Row>['series'] = [
    { id: 'train', y: 'train', label: 'Training' },
    { id: 'validation', y: 'validation', label: 'Validation' },
  ];
  return {
    data: rows(state.labels),
    x: 'step',
    series: state.right
      ? [...series, { id: 'accuracy', y: 'accuracy', label: 'Accuracy', yAxis: 'y2' }]
      : series,
    axes: {
      x: { title: state.titles ? 'Step' : undefined },
      y: { title: state.titles ? title : undefined },
      ...(state.right
        ? {
            y2: {
              format: { style: 'percent' as const },
              title: state.titles ? 'Accuracy' : undefined,
            },
          }
        : {}),
    },
    legend: state.legend,
    minGutters: state.min > 0 ? { y: state.min } : undefined,
    interaction: 'readonly',
    ariaLabel: 'Training and validation loss over 10,000 steps, with the layout drawn over it',
  };
}

class SnaplotAnatomy extends OnSight {
  #chart: ChartHandle<Row> | undefined;
  #state: AnatomyState = { labels: 'decimal', titles: false, legend: true, right: false, min: 0 };
  #focus: string | null = null;

  protected start(snaplot: typeof import('snaplot')): void {
    const host = this.querySelector<HTMLElement>('[data-chart]');
    if (!host) return;
    this.#chart = snaplot.createChart(host, anatomyOptions(this.#state));
    for (const input of this.querySelectorAll<HTMLInputElement>('input')) {
      input.addEventListener('input', () => this.#read());
    }
    for (const item of this.querySelectorAll<HTMLElement>('[data-key-kind]')) {
      const kind = item.dataset.keyKind ?? null;
      item.addEventListener('pointerenter', () => this.#highlight(kind));
      item.addEventListener('pointerleave', () => this.#highlight(null));
      item.addEventListener('focus', () => this.#highlight(kind));
      item.addEventListener('blur', () => this.#highlight(null));
    }
    this.redraw();
  }

  protected stop(): void {
    this.#chart?.destroy();
    this.#chart = undefined;
  }

  #read(): void {
    const value = (name: string) => this.querySelector<HTMLInputElement>(`[name="${name}"]`);
    const checked = this.querySelector<HTMLInputElement>('[name="anatomy-labels"]:checked');
    const min = value('anatomy-min');
    this.#state = {
      labels: (checked?.value as Labels | undefined) ?? 'decimal',
      titles: value('anatomy-titles')?.checked ?? false,
      legend: value('anatomy-legend')?.checked ?? true,
      right: value('anatomy-right')?.checked ?? false,
      min: Number(min?.value ?? 0),
    };
    const output = this.querySelector('[data-min-output]');
    if (output) output.textContent = this.#state.min > 0 ? px(this.#state.min) : 'unset';
    this.#chart?.setOptions(anatomyOptions(this.#state));
    this.redraw();
  }

  #highlight(kind: string | null): void {
    this.#focus = kind;
    for (const node of this.querySelectorAll<SVGElement>('[data-overlay] [data-kind]')) {
      node.classList.toggle('is-dim', kind !== null && node.dataset.kind !== kind);
    }
    for (const item of this.querySelectorAll<HTMLElement>('[data-key-kind]')) {
      item.classList.toggle('is-active', item.dataset.keyKind === kind);
    }
  }

  protected draw(): void {
    const chart = this.#chart;
    const host = this.querySelector<HTMLElement>('[data-chart]');
    const svg = this.querySelector<SVGSVGElement>('[data-overlay]');
    if (!chart || !host || !svg) return;
    const m = measure(chart, host);
    if (!m) return;
    resetOverlay(svg, m);
    const { plot, width: W, height: H } = m;
    const chromeTop = m.legend && m.legend.y < plot.y ? m.legend.y + m.legend.h : 0;
    const chromeBottom = m.legend && m.legend.y > plot.y ? H - m.legend.y : 0;
    const floor = H - chromeBottom;
    const gutters = {
      left: plot.x,
      right: W - plot.x - plot.w,
      top: plot.y - chromeTop,
      bottom: floor - plot.y - plot.h,
    };
    const has = (side: string) => m.labels.some((label) => label.side === side);
    const shapes: SVGElement[] = [];

    // The four gutters: the sides full height between any legend, the top and bottom between them.
    shapes.push(
      rect({ x: 0, y: chromeTop, w: plot.x, h: floor - chromeTop }, 'gutter'),
      rect({ x: plot.x + plot.w, y: chromeTop, w: gutters.right, h: floor - chromeTop }, 'gutter'),
      rect({ x: plot.x, y: chromeTop, w: plot.w, h: gutters.top }, 'gutter'),
      rect({ x: plot.x, y: plot.y + plot.h, w: plot.w, h: gutters.bottom }, 'gutter'),
    );
    if (m.legend) shapes.push(rect({ x: 0, y: m.legend.y, w: W, h: m.legend.h }, 'legend'));
    // The edge margin along each edge of the gutters, the legend's edge included.
    shapes.push(
      rect({ x: 0, y: chromeTop, w: EDGE, h: floor - chromeTop }, 'edge'),
      rect({ x: W - EDGE, y: chromeTop, w: EDGE, h: floor - chromeTop }, 'edge'),
      rect({ x: EDGE, y: chromeTop, w: W - 2 * EDGE, h: EDGE }, 'edge'),
      rect({ x: EDGE, y: floor - EDGE, w: W - 2 * EDGE, h: EDGE }, 'edge'),
    );
    // Tick marks and the gap to their labels, on each side with an axis.
    if (has('left'))
      shapes.push(
        rect({ x: plot.x - TICK_AND_GAP, y: plot.y, w: TICK_AND_GAP, h: plot.h }, 'tick'),
      );
    if (has('right'))
      shapes.push(rect({ x: plot.x + plot.w, y: plot.y, w: TICK_AND_GAP, h: plot.h }, 'tick'));
    if (has('bottom'))
      shapes.push(rect({ x: plot.x, y: plot.y + plot.h, w: plot.w, h: TICK_AND_GAP }, 'tick'));
    for (const label of m.labels) shapes.push(rect(label.box, 'label'));
    shapes.push(rect(plot, 'plot'));
    svg.append(...shapes);
    this.#highlight(this.#focus);

    const widest = Math.max(0, ...m.labels.filter((l) => l.side === 'left').map((l) => l.box.w));
    const blank = m.labels
      .filter((l) => l.side === 'left')
      .reduce((least, l) => Math.min(least, l.box.x), Number.POSITIVE_INFINITY);
    const values: Record<string, string> = {
      plot: `${Math.round(plot.w)} × ${Math.round(plot.h)} px`,
      gutter: `left ${Math.round(gutters.left)}, right ${Math.round(gutters.right)}, top ${Math.round(gutters.top)}, bottom ${Math.round(gutters.bottom)} px`,
      label: `widest y label ${px(widest)}, starting ${px(blank)} from the edge`,
      tick: '4 + 4 px',
      edge: '8 px',
      legend: m.legend ? px(m.legend.h) : 'hidden',
    };
    for (const [kind, text] of Object.entries(values)) {
      const slot = this.querySelector(`[data-key-kind="${kind}"] [data-value]`);
      if (slot) slot.textContent = text;
    }
  }
}

// ─── Two charts, lined up or not ─────────────────────────────────────────────────────────────

type Alignment = 'measured' | 'group' | 'min';

/** Wide enough for the longer labels' gutter at the site's 12 px labels. */
const ALIGN_MIN = 80;

function alignedOptions(
  labels: Labels,
  alignment: Alignment,
  group: ChartGroup,
): ChartOptions<Row> {
  return {
    data: rows(labels),
    x: 'step',
    series: [{ id: 'train', y: 'train', label: LABELS[labels].title }],
    legend: false,
    group: alignment === 'group' ? group : undefined,
    minGutters: alignment === 'min' ? { y: ALIGN_MIN } : undefined,
    interaction: 'readonly',
    ariaLabel: `${LABELS[labels].title} over 10,000 steps`,
  };
}

class SnaplotPlotAlignment extends OnSight {
  #charts: { chart: ChartHandle<Row>; host: HTMLElement; labels: Labels }[] = [];
  #group: ChartGroup | undefined;
  #alignment: Alignment = 'measured';

  protected start(snaplot: typeof import('snaplot')): void {
    this.#group = snaplot.createChartGroup({ cursor: false, highlight: false, viewport: false });
    const hosts = [...this.querySelectorAll<HTMLElement>('[data-chart]')];
    const group = this.#group;
    this.#charts = hosts.map((host) => {
      const labels = (host.dataset.labels as Labels | undefined) ?? 'short';
      const options = alignedOptions(labels, this.#alignment, group);
      return { chart: snaplot.createChart(host, options), host, labels };
    });
    for (const input of this.querySelectorAll<HTMLInputElement>('[name="alignment"]')) {
      input.addEventListener('change', () => {
        this.#alignment = input.value as Alignment;
        for (const { chart, labels } of this.#charts) {
          chart.setOptions(alignedOptions(labels, this.#alignment, group));
        }
        this.redraw();
      });
    }
    this.redraw();
  }

  protected stop(): void {
    for (const { chart } of this.#charts) chart.destroy();
    this.#charts = [];
  }

  protected draw(): void {
    const starts: { label: number; plot: number }[] = [];
    for (const { chart, host } of this.#charts) {
      const svg = host.parentElement?.querySelector<SVGSVGElement>('[data-overlay]');
      const m = measure(chart, host);
      if (!svg || !m) continue;
      resetOverlay(svg, m);
      const label = Math.min(
        ...m.labels.filter((l) => l.side === 'left').map((l) => l.box.x),
        m.plot.x,
      );
      starts.push({ label, plot: m.plot.x });
      svg.append(
        rect({ x: 0, y: 0, w: label, h: m.height }, 'blank'),
        ...m.labels.filter((l) => l.side === 'left').map((l) => rect(l.box, 'label')),
        element('line', {
          x1: label,
          x2: label,
          y1: 0,
          y2: m.height,
          class: 'anatomy-guide-label',
        }),
        element('line', {
          x1: m.plot.x,
          x2: m.plot.x,
          y1: 0,
          y2: m.height,
          class: 'anatomy-guide-plot',
        }),
      );
    }
    const readout = this.querySelector('[data-readout]');
    if (readout && starts.length === 2) {
      const [a, b] = starts;
      const plots =
        Math.round(a.plot) === Math.round(b.plot)
          ? `both plots start ${px(a.plot)} from the edge`
          : `the plots start ${px(a.plot)} and ${px(b.plot)} from the edge`;
      readout.textContent = `The labels start ${px(a.label)} and ${px(b.label)} from the edge; ${plots}.`;
    }
  }
}

/** Defines both elements unless a script already has. */
export function defineChartAnatomy(): void {
  if (!customElements.get('snaplot-anatomy'))
    customElements.define('snaplot-anatomy', SnaplotAnatomy);
  if (!customElements.get('snaplot-plot-alignment'))
    customElements.define('snaplot-plot-alignment', SnaplotPlotAlignment);
}
