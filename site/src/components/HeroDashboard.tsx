import { createSignal, createMemo, onCleanup, For } from 'solid-js';
import {
  Chart,
  createLegendPlugin,
  lightTheme,
  darkTheme,
  oceanTheme,
  marsTheme,
  forestTheme,
  sunsetTheme,
  midnightTheme,
} from 'snaplot';
import type { ColumnarData, ChartConfig, ChartInstance, ThemeConfig } from 'snaplot';
import { useTheme } from '../ThemeContext';

/**
 * Landing-page dashboard. Three panels share a single theme the visitor
 * picks from a chip row: a streaming multi-series area, a scatter, and a
 * density heatmap. A 1.5s timer appends fresh points to the streaming
 * panel so the page feels alive without a WebSocket.
 *
 * The chip row doubles as the marketing pitch ("here's the range the
 * library can paint") — every theme is a hand-tuned palette + background
 * + grid, not a recoloured default.
 */

type ThemeKey =
  | 'dark'
  | 'light'
  | 'ocean'
  | 'mars'
  | 'forest'
  | 'sunset'
  | 'midnight';

type ThemeEntry = {
  key: ThemeKey;
  label: string;
  theme: ThemeConfig;
};

const THEMES: ThemeEntry[] = [
  { key: 'dark', label: 'Slate', theme: darkTheme },
  { key: 'light', label: 'Paper', theme: lightTheme },
  { key: 'ocean', label: 'Ocean', theme: oceanTheme },
  { key: 'mars', label: 'Mars', theme: marsTheme },
  { key: 'forest', label: 'Forest', theme: forestTheme },
  { key: 'sunset', label: 'Sunset', theme: sunsetTheme },
  { key: 'midnight', label: 'Midnight', theme: midnightTheme },
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

  const activeTheme = createMemo(
    () => THEMES.find((t) => t.key === selected())?.theme ?? darkTheme,
  );

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

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: 'var(--space-3)' }}>
      {/* Theme chip row */}
      <div
        role="tablist"
        aria-label="Chart themes"
        style={{
          display: 'flex',
          'flex-wrap': 'wrap',
          gap: 'var(--space-2)',
          'justify-content': 'center',
          'margin-bottom': 'var(--space-2)',
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
          gap: 'var(--space-3)',
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
            gap: 'var(--space-3)',
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
        padding: '6px 12px 6px 8px',
        'border-radius': 'var(--radius-pill)',
        border: `1px solid ${props.active ? 'var(--accent)' : 'var(--border)'}`,
        background: props.active
          ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
          : 'var(--bg-surface)',
        color: 'inherit',
        'font-size': 'var(--fs-sm)',
        'font-weight': props.active ? 600 : 500,
        cursor: 'pointer',
        transition: 'background-color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          padding: '2px',
          'border-radius': 'var(--radius-pill)',
          background: props.entry.theme.backgroundColor,
          border: `1px solid ${props.entry.theme.borderColor}`,
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

/** Panel card with header + chart slot. Mirrors the site's `Card` style. */
function Panel(props: { title: string; subtitle?: string; children: any }) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        'border-radius': 'var(--radius-lg)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
        display: 'flex',
        'flex-direction': 'column',
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          display: 'flex',
          'align-items': 'baseline',
          'justify-content': 'space-between',
          'border-bottom': '1px solid var(--border)',
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
