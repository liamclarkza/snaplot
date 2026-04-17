import { createSignal, createMemo, createEffect, onCleanup, For } from 'solid-js';
import {
  Chart,
  createLegendPlugin,
  histogram,
  lightTheme,
  darkTheme,
  oceanTheme,
  forestTheme,
  violetTheme,
  fogTheme,
} from 'snaplot';
import type { ColumnarData, ChartConfig, ChartInstance, ThemeConfig } from 'snaplot';
import { useTheme } from '../ThemeContext';

/**
 * Showcase dashboard on the /demos route. Six hand-tuned themes
 * drive every surface on the page, not just the charts — the chip
 * row rewrites the local CSS-var namespace so panels, chips and
 * text pick up the selection too. Panels lean on layered elevation
 * (inset highlight + soft ambient shadow) instead of hard borders.
 */

type ThemeKey = 'dark' | 'light' | 'fog' | 'ocean' | 'forest' | 'violet';

type ThemeEntry = {
  key: ThemeKey;
  label: string;
  theme: ThemeConfig;
  /** true = dark background; drives elevation + contrast picks */
  dark: boolean;
  /**
   * Density ramp for the heatmap panel. 3–4 stops that walk from the
   * page bg through the theme's primary into a hotter tertiary — gives
   * every theme a distinct "hot spot" colour instead of always Viridis.
   */
  heatmapGradient: string[];
};

const THEMES: ThemeEntry[] = [
  // Paper — warm cream through orange into red (Okabe-Ito warm arc)
  { key: 'light',  label: 'Paper',  theme: lightTheme,  dark: false,
    heatmapGradient: ['#fafbfc', '#e69f00', '#d55e00'] },
  // Fog — cool blue family, picks up the productivity feel
  { key: 'fog',    label: 'Fog',    theme: fogTheme,    dark: false,
    heatmapGradient: ['#f5f7fb', '#60a5fa', '#2563eb', '#1e3a8a'] },
  // Slate — classic cool-to-warm "viridis-lite" tuned to the slate bg
  { key: 'dark',   label: 'Slate',  theme: darkTheme,   dark: true,
    heatmapGradient: ['#14161f', '#1e3a8a', '#0891b2', '#22d3ee', '#fde68a'] },
  // Ocean — deep water to surface sparkle
  { key: 'ocean',  label: 'Ocean',  theme: oceanTheme,  dark: true,
    heatmapGradient: ['#0b1a2b', '#1d4ed8', '#22d3ee', '#fef3c7'] },
  // Forest — pine to leaf to sunlit canopy
  { key: 'forest', label: 'Forest', theme: forestTheme, dark: true,
    heatmapGradient: ['#0c1613', '#064e3b', '#10b981', '#fde68a'] },
  // Violet — aubergine through lavender to hot magenta
  { key: 'violet', label: 'Violet', theme: violetTheme, dark: true,
    heatmapGradient: ['#100d1f', '#4c1d95', '#a78bfa', '#f0abfc'] },
];

function genStream(points: number): ColumnarData {
  const now = Date.now();
  const x = new Float64Array(points);
  const y1 = new Float64Array(points);
  const y2 = new Float64Array(points);
  const y3 = new Float64Array(points);
  for (let i = 0; i < points; i++) {
    x[i] = now - (points - i) * 60_000;
    const t = i / points;
    y1[i] = 62 + 22 * Math.sin(t * Math.PI * 4) + 6 * Math.sin(t * Math.PI * 13) + (Math.random() - 0.5) * 4;
    y2[i] = 42 + 18 * Math.cos(t * Math.PI * 3 + 1) + 5 * Math.sin(t * Math.PI * 9) + (Math.random() - 0.5) * 4;
    y3[i] = 28 + 14 * Math.sin(t * Math.PI * 2.3 + 2) + 4 * Math.cos(t * Math.PI * 7) + (Math.random() - 0.5) * 3;
  }
  return [x, y1, y2, y3];
}

function genScatter(n: number): ColumnarData {
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  // Three gaussian clusters so the scatter reads as genuine data.
  const centers: [number, number][] = [
    [30, 70],
    [60, 40],
    [80, 75],
  ];
  for (let i = 0; i < n; i++) {
    const c = centers[i % 3];
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
    x[i] = c[0] + z0 * 10;
    y[i] = c[1] + z1 * 10;
  }
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => x[a] - x[b]);
  return [Float64Array.from(idx.map((i) => x[i])), Float64Array.from(idx.map((i) => y[i]))];
}

function genHeatmap(n: number): ColumnarData {
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const centers: [number, number, number][] = [
    [25, 30, 10],
    [75, 70, 8],
    [30, 75, 12],
    [70, 25, 9],
  ];
  for (let i = 0; i < n; i++) {
    const c = centers[Math.floor(Math.random() * centers.length)];
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
    x[i] = c[0] + z0 * c[2];
    y[i] = c[1] + z1 * c[2];
  }
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => x[a] - x[b]);
  return [Float64Array.from(idx.map((i) => x[i])), Float64Array.from(idx.map((i) => y[i]))];
}

/**
 * Top-N endpoints by request count — grouped bar with a 2xx
 * and 5xx column per endpoint so the chart actually says something
 * (not just random bars). Errors scale with traffic + a random
 * failure rate to keep the shape realistic.
 */
function genBars(): ColumnarData {
  const n = 6;
  const x = new Float64Array(n);
  const success = new Float64Array(n);
  const errors = new Float64Array(n);
  const baselines = [1200, 820, 640, 510, 390, 220];
  // Per-endpoint error rate — a mix of healthy and unhealthy endpoints
  // so the grouped bars actually tell a story instead of reading flat.
  const errorRates = [0.04, 0.18, 0.08, 0.12, 0.02, 0.22];
  for (let i = 0; i < n; i++) {
    x[i] = i;
    const traffic = baselines[i] * (0.9 + Math.random() * 0.2);
    errors[i] = Math.round(traffic * errorRates[i] * (0.85 + Math.random() * 0.3));
    success[i] = Math.round(traffic - errors[i]);
  }
  return [x, success, errors];
}

/**
 * Response-time histogram — bimodal "fast cache hit / slow DB path"
 * distribution typical of API latency. 8K samples, freedman-diaconis
 * bins give a smooth shape without over-binning.
 */
function genHistogram(): ColumnarData {
  const n = 8000;
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (Math.random() < 0.7) {
      // fast path — tight around 30 ms
      raw[i] = 30 + (Math.random() + Math.random() - 1) * 12;
    } else {
      // slow path — spread around 120 ms
      raw[i] = 120 + (Math.random() + Math.random() + Math.random() - 1.5) * 35;
    }
  }
  const bins = histogram(raw);
  return [bins.edges, bins.counts];
}

export default function HeroDashboard() {
  const { theme: siteTheme } = useTheme();
  const [selected, setSelected] = createSignal<ThemeKey>(
    siteTheme() === 'light' ? 'light' : 'dark',
  );

  const activeEntry = createMemo(
    () => THEMES.find((t) => t.key === selected()) ?? THEMES[2],
  );
  const activeTheme = createMemo(() => activeEntry().theme);

  // ─── Data ────────────────────────────────────────────────────
  const [streamData, setStreamData] = createSignal(genStream(240));
  const [scatter] = createSignal(genScatter(600));
  const [heat] = createSignal(genHeatmap(80_000));
  const [bars] = createSignal(genBars());
  const [hist] = createSignal(genHistogram());

  // ─── Chart configs (theme-reactive) ──────────────────────────
  let streamChart: ChartInstance | undefined;

  const streamConfig = createMemo<ChartConfig>(() => ({
    theme: activeTheme(),
    axes: { x: { type: 'time' }, y: { type: 'linear' } },
    series: [
      { label: 'Requests',  dataIndex: 1, type: 'area', interpolation: 'monotone', lineWidth: 1.75 },
      { label: 'p95 (ms)',  dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 1.5 },
      { label: 'Errors %',  dataIndex: 3, type: 'line', interpolation: 'monotone', lineWidth: 1.5 },
    ],
    cursor: { show: true },
    zoom: { enabled: true, x: true },
    tooltip: { show: true, mode: 'index' },
    padding: { top: 20, right: 20, bottom: 36, left: 48 },
    plugins: [createLegendPlugin({ position: 'bottom' })],
  }));

  const scatterConfig = createMemo<ChartConfig>(() => ({
    theme: activeTheme(),
    axes: { x: { type: 'linear' }, y: { type: 'linear' } },
    series: [{ label: 'Events', dataIndex: 1, type: 'scatter', pointRadius: 2.5 }],
    cursor: { show: true },
    zoom: { enabled: true, x: true, y: true },
    tooltip: { show: true, mode: 'nearest' },
    padding: { top: 20, right: 20, bottom: 36, left: 44 },
  }));

  const heatConfig = createMemo<ChartConfig>(() => ({
    theme: activeTheme(),
    axes: { x: { type: 'linear' }, y: { type: 'linear' } },
    series: [{
      label: 'Density',
      dataIndex: 1,
      type: 'scatter',
      heatmap: true,
      heatmapBinSize: 1,
      heatmapGradient: activeEntry().heatmapGradient,
    }],
    cursor: { show: true },
    zoom: { enabled: true, x: true, y: true },
    tooltip: { show: true, mode: 'nearest' },
    padding: { top: 20, right: 20, bottom: 36, left: 44 },
  }));

  const barConfig = createMemo<ChartConfig>(() => ({
    theme: activeTheme(),
    axes: {
      x: {
        type: 'linear',
        tickFormat: (v: number) => ['/api', '/auth', '/users', '/search', '/upload', '/admin'][Math.round(v)] ?? '',
      },
      y: { type: 'linear' },
    },
    series: [
      { label: '2xx', dataIndex: 1, type: 'bar' },
      { label: '5xx', dataIndex: 2, type: 'bar' },
    ],
    cursor: { show: true },
    tooltip: { show: true, mode: 'index' },
    padding: { top: 20, right: 20, bottom: 36, left: 48 },
    plugins: [createLegendPlugin({ position: 'bottom' })],
  }));

  const histConfig = createMemo<ChartConfig>(() => ({
    theme: activeTheme(),
    axes: { x: { type: 'linear' }, y: { type: 'linear' } },
    series: [{ label: 'Response time (ms)', dataIndex: 1, type: 'histogram' }],
    cursor: { show: true },
    tooltip: { show: true },
    padding: { top: 20, right: 20, bottom: 36, left: 48 },
  }));

  // ─── Stream loop — appends one point every 1.5s ──────────────
  const interval = setInterval(() => {
    // Keep a rolling window: push a new point, drop the oldest so the
    // X-range slides instead of stretching unbounded.
    setStreamData((prev) => {
      const [x, y1, y2, y3] = prev;
      const next = x[x.length - 1] + 60_000;
      const nx = new Float64Array(x.length);
      const ny1 = new Float64Array(x.length);
      const ny2 = new Float64Array(x.length);
      const ny3 = new Float64Array(x.length);
      nx.set(x.subarray(1));
      ny1.set(y1.subarray(1));
      ny2.set(y2.subarray(1));
      ny3.set(y3.subarray(1));
      nx[x.length - 1] = next;
      ny1[x.length - 1] = clamp(y1[x.length - 1] + (Math.random() - 0.5) * 6, 20, 100);
      ny2[x.length - 1] = clamp(y2[x.length - 1] + (Math.random() - 0.5) * 5, 10, 90);
      ny3[x.length - 1] = clamp(y3[x.length - 1] + (Math.random() - 0.5) * 4, 5, 60);
      return [nx, ny1, ny2, ny3] as ColumnarData;
    });
    if (streamChart) streamChart.setData(streamData());
  }, 1500);
  onCleanup(() => clearInterval(interval));

  // Page-scope CSS variables. Painted onto `document.documentElement`
  // (not just the dashboard subtree) so the nav, footer and scrollbar
  // gutter all track the active theme. On cleanup we remove the
  // overrides so Home and Docs fall back to their site light/dark tokens.
  const cssVars = createMemo(() => {
    const { theme: t, dark } = activeEntry();
    // Panel surface matches the chart canvas exactly so the header /
    // footer blend seamlessly into the plot — no visible seam where
    // a lighter card meets a darker chart. The page background is the
    // tinted surround, so panels still feel contained even without a
    // color step (elevation does the rest via inset + shadow).
    const pageBg = dark
      ? `color-mix(in srgb, ${t.backgroundColor} 88%, #000 12%)`
      : `color-mix(in srgb, ${t.backgroundColor} 92%, #000 8%)`;
    // Dark: a dark drop-shadow under a dark card reads muddy. Skip
    // the ambient shadow and let the tinted page bg + inset top
    // highlight do the lifting — the soft-UI "lit from above" feel
    // without the blob. Light: the layered shadow works as intended.
    const elevInset = dark
      ? 'inset 0 1px 0 rgba(255, 255, 255, 0.05)'
      : 'inset 0 1px 0 rgba(255, 255, 255, 0.70)';
    const elevShadow = dark
      ? 'none'
      : '0 1px 2px rgba(30, 35, 60, 0.05), 0 10px 28px rgba(30, 35, 60, 0.08)';
    return {
      '--bg': pageBg,
      '--bg-surface': t.backgroundColor,
      '--bg-surface-2': t.backgroundColor,
      '--text': t.textColor,
      '--text-secondary': t.tickColor,
      '--border': t.borderColor,
      '--border-light': t.gridColor,
      '--accent': t.palette[0],
      '--accent-hover': t.palette[0],
      '--elev-1-inset': elevInset,
      '--elev-1-shadow': elevShadow,
      '--code-bg': dark
        ? `color-mix(in srgb, ${t.backgroundColor} 80%, #fff 4%)`
        : `color-mix(in srgb, ${t.backgroundColor} 85%, #000 3%)`,
    } as Record<string, string>;
  });

  // Paint (and repaint) onto <html> so nav + body reflect the theme.
  createEffect(() => {
    const vars = cssVars();
    const root = document.documentElement;
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  });
  onCleanup(() => {
    const root = document.documentElement;
    for (const k of Object.keys(cssVars())) root.style.removeProperty(k);
  });

  return (
    <section
      class="demos-themed"
      style={{
        background: 'var(--bg)',
        color: 'var(--text)',
        'min-height': 'calc(100vh - 56px)',
        transition:
          'background-color var(--dur) var(--ease-out), color var(--dur) var(--ease-out)',
      }}
    >
      <div
        style={{
          'max-width': 'var(--max-width)',
          margin: '0 auto',
          padding: 'var(--space-7) var(--space-5) var(--space-8)',
        }}
      >
        <header style={{ 'text-align': 'center', 'margin-bottom': 'var(--space-6)' }}>
          <h1
            style={{
              'font-size': 'clamp(28px, 4vw, 40px)',
              'font-weight': 700,
              'letter-spacing': '-0.02em',
              'line-height': 1.15,
              'margin-bottom': 'var(--space-2)',
            }}
          >
            Themes & live dashboard
          </h1>
          <p
            style={{
              'font-size': 'var(--fs-md)',
              color: 'var(--text-secondary)',
              'max-width': '560px',
              margin: '0 auto',
              'line-height': 1.55,
            }}
          >
            Pick a theme — every surface on the page follows. Streaming area, scatter
            cloud, and 80K-point density heatmap all re-render against the palette.
          </p>
        </header>

        {/* Theme chip row */}
        <div
          role="tablist"
          aria-label="Chart themes"
          style={{
            display: 'flex',
            'flex-wrap': 'wrap',
            gap: 'var(--space-2)',
            'justify-content': 'center',
            'margin-bottom': 'var(--space-5)',
          }}
        >
          <For each={THEMES}>
            {(t) => <ThemeChip entry={t} active={selected() === t.key} onPick={() => setSelected(t.key)} />}
          </For>
        </div>

        {/* Dashboard grid */}
        <div
          style={{
            display: 'grid',
            'grid-template-columns': '1fr',
            'grid-template-rows': 'auto auto',
            gap: 'var(--space-4)',
          }}
        >
          {/* Row 1 — streaming (full width) */}
          <Panel title="Throughput & latency" subtitle="Streaming — 1.5s tick">
            <div style={{ height: 'clamp(240px, 36vh, 320px)' }}>
              <Chart config={streamConfig()} data={streamData()} onReady={(c) => { streamChart = c; }} />
            </div>
          </Panel>

          {/* Row 2 — scatter + heatmap */}
          <div
            style={{
              display: 'grid',
              'grid-template-columns': 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 'var(--space-4)',
            }}
          >
            <Panel title="Event cloud" subtitle="600 points, 3 clusters">
              <div style={{ height: 'clamp(220px, 32vh, 280px)' }}>
                <Chart config={scatterConfig()} data={scatter()} />
              </div>
            </Panel>
            <Panel title="Density heatmap" subtitle="80K points · themed gradient">
              <div style={{ height: 'clamp(220px, 32vh, 280px)' }}>
                <Chart config={heatConfig()} data={heat()} />
              </div>
            </Panel>
          </div>

          {/* Row 3 — bar + histogram */}
          <div
            style={{
              display: 'grid',
              'grid-template-columns': 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 'var(--space-4)',
            }}
          >
            <Panel title="Top endpoints" subtitle="Requests · 2xx vs 5xx">
              <div style={{ height: 'clamp(240px, 34vh, 300px)' }}>
                <Chart config={barConfig()} data={bars()} />
              </div>
            </Panel>
            <Panel title="Response time" subtitle="Bimodal · 8K samples">
              <div style={{ height: 'clamp(240px, 34vh, 300px)' }}>
                <Chart config={histConfig()} data={hist()} />
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </section>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Single-theme picker button — a swatch row previewing the palette. */
function ThemeChip(props: { entry: ThemeEntry; active: boolean; onPick: () => void }) {
  const preview = () => {
    const p = props.entry.theme.palette;
    return [p[0], p[1], p[2]];
  };
  return (
    <button
      type="button"
      role="tab"
      aria-selected={props.active}
      onClick={props.onPick}
      style={{
        display: 'inline-flex',
        'align-items': 'center',
        gap: '8px',
        padding: '6px 14px 6px 8px',
        'border-radius': 'var(--radius-pill)',
        border: 'none',
        background: props.active
          ? 'color-mix(in srgb, var(--accent) 14%, var(--bg-surface))'
          : 'var(--bg-surface)',
        color: 'inherit',
        'font-size': 'var(--fs-sm)',
        'font-weight': props.active ? 600 : 500,
        cursor: 'pointer',
        'box-shadow': props.active
          ? `var(--elev-1-inset), 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent)`
          : 'var(--elev-1-inset), var(--elev-1-shadow)',
        transition:
          'background-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
      }}
    >
      {/* Avatar-stack preview — three overlapping dots on the chip
          itself (no mini-pill). A ring in the chip's own bg colour
          separates them cleanly without adding a bright frame. */}
      <span aria-hidden="true" style={{ display: 'inline-flex' }}>
        <For each={preview()}>
          {(c, i) => (
            <span
              style={{
                display: 'inline-block',
                width: '12px',
                height: '12px',
                'border-radius': '50%',
                background: c,
                'margin-left': i() === 0 ? '0' : '-4px',
                'box-shadow': '0 0 0 1.5px var(--bg-surface)',
              }}
            />
          )}
        </For>
      </span>
      {props.entry.label}
    </button>
  );
}

/** Panel with header + chart slot. Soft-UI elevation, no hard border. */
function Panel(props: { title: string; subtitle?: string; children: any }) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        'border-radius': 'var(--radius-lg)',
        'box-shadow': 'var(--elev-1-inset), var(--elev-1-shadow)',
        overflow: 'hidden',
        display: 'flex',
        'flex-direction': 'column',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          display: 'flex',
          'align-items': 'baseline',
          'justify-content': 'space-between',
        }}
      >
        <div style={{ 'font-size': 'var(--fs-sm)', 'font-weight': 600 }}>{props.title}</div>
        {props.subtitle && (
          <div style={{ 'font-size': 'var(--fs-xs)', color: 'var(--text-secondary)' }}>
            {props.subtitle}
          </div>
        )}
      </div>
      {props.children}
    </div>
  );
}
