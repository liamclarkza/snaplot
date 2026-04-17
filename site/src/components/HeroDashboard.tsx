import { createSignal, createMemo, onCleanup, For } from 'solid-js';
import {
  Chart,
  createLegendPlugin,
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
};

const THEMES: ThemeEntry[] = [
  { key: 'light',  label: 'Paper',  theme: lightTheme,  dark: false },
  { key: 'fog',    label: 'Fog',    theme: fogTheme,    dark: false },
  { key: 'dark',   label: 'Slate',  theme: darkTheme,   dark: true  },
  { key: 'ocean',  label: 'Ocean',  theme: oceanTheme,  dark: true  },
  { key: 'forest', label: 'Forest', theme: forestTheme, dark: true  },
  { key: 'violet', label: 'Violet', theme: violetTheme, dark: true  },
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
    series: [{ label: 'Density', dataIndex: 1, type: 'scatter', heatmap: true, heatmapBinSize: 1 }],
    cursor: { show: true },
    zoom: { enabled: true, x: true, y: true },
    tooltip: { show: true, mode: 'nearest' },
    padding: { top: 20, right: 20, bottom: 36, left: 44 },
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

  // Page-scope CSS variables. The /demos route applies these to the
  // whole main content area, so background, panels and chips all
  // track the active theme — no hard wrapper needed around the
  // dashboard. Elevation tokens (inset + shadow) are theme-aware
  // so panels feel raised on light and glow-lit on dark.
  const cssVars = createMemo(() => {
    const { theme: t, dark } = activeEntry();
    const panelSurface = dark
      ? `color-mix(in srgb, ${t.backgroundColor} 88%, #fff 2%)`
      : t.backgroundColor;
    const elevInset = dark
      ? 'inset 0 1px 0 rgba(255, 255, 255, 0.05)'
      : 'inset 0 1px 0 rgba(255, 255, 255, 0.80)';
    const elevShadow = dark
      ? '0 1px 2px rgba(0, 0, 0, 0.25), 0 12px 32px rgba(0, 0, 0, 0.28)'
      : '0 1px 2px rgba(30, 35, 60, 0.04), 0 10px 28px rgba(30, 35, 60, 0.08)';
    return {
      '--bg': t.backgroundColor,
      '--bg-surface': panelSurface,
      '--bg-surface-2': panelSurface,
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

  return (
    <section
      class="demos-themed"
      style={{
        ...cssVars(),
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
            <Panel title="Density heatmap" subtitle="80K points · Viridis">
              <div style={{ height: 'clamp(220px, 32vh, 280px)' }}>
                <Chart config={heatConfig()} data={heat()} />
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
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          padding: '2px',
          'border-radius': 'var(--radius-pill)',
          background: props.entry.theme.backgroundColor,
        }}
      >
        <For each={preview()}>
          {(c) => (
            <span
              style={{
                display: 'inline-block',
                width: '10px',
                height: '10px',
                'border-radius': '50%',
                background: c,
                'margin-left': '-3px',
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
