import {
  For,
  batch,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
  type JSX,
} from 'solid-js';
import {
  histogram,
  column,
  metricColumn,
  nameColumn,
  studioTheme,
  tokyoTheme,
  valueColumn,
} from 'snaplot';
import {
  Chart,
  LegendTable,
  createChartGroup,
} from 'snaplot/solid';
import type {
  ChartConfig,
  ChartInstance,
  ChartStats,
  ColumnarData,
  ThemeConfig,
} from 'snaplot';
import { useTheme } from '../ThemeContext';
import type { SiteTheme } from '../ThemeContext';

interface ThemeChoice {
  key: string;
  label: string;
  theme: ThemeConfig;
  pageMode: SiteTheme;
}

interface RunMeta {
  runId: string;
  metricKey: string;
  status: 'running' | 'finished' | 'failed';
}

const RUN_NAMES = [
  'baseline-resnet50',
  'large-batch-sweep',
  'augmented-inputs',
  'failed-sweep-17',
  'efficient-v2',
];

const MODEL_FAMILIES = ['ResNet', 'ConvNext', 'ViT', 'Mixer'];

const STREAM_HZ = 60;
const STREAM_FRAME_MS = 1000 / STREAM_HZ;
const STREAM_WINDOW_SECONDS = 20;
const STREAM_WINDOW_POINTS = STREAM_HZ * STREAM_WINDOW_SECONDS;
const STREAM_STATS_MS = 250;
const STREAM_PAUSE_RESET_MS = 250;
const DEMO_THEME_STORAGE_KEY: Record<SiteTheme, string> = {
  light: 'snaplot-demo-theme-light',
  dark: 'snaplot-demo-theme-dark',
};
const DEFAULT_DEMO_THEME: Record<SiteTheme, string> = {
  light: 'studio',
  dark: 'tokyo',
};

const paperTheme: ThemeConfig = {
  ...studioTheme,
  backgroundColor: '#f8fafc',
  textColor: '#172033',
  gridColor: '#cbd5e1',
  gridOpacity: 0.58,
  axisLineColor: '#cbd5e1',
  borderColor: '#cbd5e1',
  borderOpacity: 0.75,
  tickColor: '#64748b',
  crosshairColor: '#64748b',
  tooltipBackground: '#ffffff',
  tooltipTextColor: '#172033',
  tooltipBorderColor: '#cbd5e1',
  palette: ['#2563eb', '#16a34a', '#f59e0b', '#e11d48', '#0891b2', '#7c3aed'],
  categoricalPalette: ['#2563eb', '#16a34a', '#f59e0b', '#e11d48', '#0891b2', '#7c3aed'],
  sequentialPalette: ['#f8fafc', '#dbeafe', '#93c5fd', '#38bdf8', '#2563eb', '#1e3a8a'],
  divergingPalette: ['#2563eb', '#bfdbfe', '#f8fafc', '#fecaca', '#dc2626'],
  heatmapGradient: ['#f8fafc', '#dbeafe', '#93c5fd', '#38bdf8', '#2563eb', '#1e3a8a'],
};

const carbonTheme: ThemeConfig = {
  ...tokyoTheme,
  backgroundColor: '#111318',
  textColor: '#e5e7eb',
  gridColor: '#2b303a',
  gridOpacity: 0.62,
  axisLineColor: '#343a46',
  borderColor: '#343a46',
  borderOpacity: 0.72,
  tickColor: '#9ca3af',
  crosshairColor: '#a3aab8',
  tooltipBackground: '#171a22',
  tooltipTextColor: '#f3f4f6',
  tooltipBorderColor: '#3a404d',
  palette: ['#7aa2f7', '#9ece6a', '#e0af68', '#f7768e', '#2ac3de', '#bb9af7'],
  categoricalPalette: ['#7aa2f7', '#9ece6a', '#e0af68', '#f7768e', '#2ac3de', '#bb9af7'],
  sequentialPalette: ['#111318', '#202842', '#315f88', '#2a9d8f', '#8bd17c', '#f2c14e'],
  divergingPalette: ['#7aa2f7', '#263a5c', '#111318', '#5c2634', '#f7768e'],
  heatmapGradient: ['#111318', '#202842', '#315f88', '#2a9d8f', '#8bd17c', '#f2c14e'],
};

const harborTheme: ThemeConfig = {
  ...tokyoTheme,
  backgroundColor: '#0f1720',
  textColor: '#e6edf3',
  gridColor: '#263544',
  gridOpacity: 0.58,
  axisLineColor: '#304153',
  borderColor: '#304153',
  borderOpacity: 0.76,
  tickColor: '#91a4b7',
  crosshairColor: '#a8b7c7',
  tooltipBackground: '#111d28',
  tooltipTextColor: '#f0f7ff',
  tooltipBorderColor: '#385064',
  palette: ['#5dade2', '#54d2a0', '#f2c879', '#ee7b84', '#8bd3ff', '#b79cff'],
  categoricalPalette: ['#5dade2', '#54d2a0', '#f2c879', '#ee7b84', '#8bd3ff', '#b79cff'],
  sequentialPalette: ['#0f1720', '#17334a', '#1c6788', '#2aa89a', '#88d68d', '#f2c879'],
  divergingPalette: ['#5dade2', '#214259', '#0f1720', '#5f2f36', '#ee7b84'],
  heatmapGradient: ['#0f1720', '#17334a', '#1c6788', '#2aa89a', '#88d68d', '#f2c879'],
};

const THEME_CHOICES: ThemeChoice[] = [
  { key: 'studio', label: 'Studio', theme: studioTheme, pageMode: 'light' },
  { key: 'paper', label: 'Paper', theme: paperTheme, pageMode: 'light' },
  { key: 'tokyo', label: 'Tokyo', theme: tokyoTheme, pageMode: 'dark' },
  { key: 'carbon', label: 'Carbon', theme: carbonTheme, pageMode: 'dark' },
  { key: 'harbor', label: 'Harbor', theme: harborTheme, pageMode: 'dark' },
];

function themeChoiceByKey(key: string | null | undefined): ThemeChoice | undefined {
  return THEME_CHOICES.find((choice) => choice.key === key);
}

function storedThemeKey(mode: SiteTheme): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(DEMO_THEME_STORAGE_KEY[mode]);
}

function rememberThemeChoice(choice: ThemeChoice): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(DEMO_THEME_STORAGE_KEY[choice.pageMode], choice.key);
}

function themeChoiceForMode(mode: SiteTheme): ThemeChoice {
  const storedChoice = themeChoiceByKey(storedThemeKey(mode));
  if (storedChoice?.pageMode === mode) return storedChoice;

  const defaultChoice = themeChoiceByKey(DEFAULT_DEMO_THEME[mode]);
  if (defaultChoice?.pageMode === mode) return defaultChoice;

  return THEME_CHOICES.find((choice) => choice.pageMode === mode) ?? THEME_CHOICES[0];
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function normal(rand: () => number): number {
  const u1 = Math.max(rand(), 1e-9);
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function streamValues(sampleIndex: number): [number, number, number] {
  const t = sampleIndex / STREAM_HZ;
  return [
    64 + Math.sin(t * 0.9) * 18 + Math.sin(t * 2.4) * 4 + Math.sin(t * 5.2) * 1.1,
    48 + Math.cos(t * 0.7 + 0.8) * 12 + Math.sin(t * 1.8) * 3 + Math.cos(t * 4.4) * 0.9,
    17 + Math.sin(t * 0.5 + 2) * 7 + Math.cos(t * 1.9) * 2 + Math.sin(t * 3.3) * 0.7,
  ];
}

function streamSeed(points: number): ColumnarData {
  const now = Date.now();
  const x = new Float64Array(points);
  const requests = new Float64Array(points);
  const p95 = new Float64Array(points);
  const errors = new Float64Array(points);
  const firstStep = -points + 1;

  for (let i = 0; i < points; i++) {
    const step = firstStep + i;
    const [requestValue, p95Value, errorValue] = streamValues(step);
    x[i] = now + step * STREAM_FRAME_MS;
    requests[i] = requestValue;
    p95[i] = p95Value;
    errors[i] = errorValue;
  }

  return [x, requests, p95, errors];
}

function experimentData(runs: number, points: number): ColumnarData {
  const rand = rng(82);
  const x = new Float64Array(points);
  const cols: Float64Array[] = [];

  for (let r = 0; r < runs; r++) {
    const y = new Float64Array(points);
    let v = 0.05 + rand() * 0.04;
    const target = 0.58 + rand() * 0.28 - (r === 3 ? 0.18 : 0);
    const noise = 0.026 + rand() * 0.018;

    for (let i = 0; i < points; i++) {
      x[i] = i;
      const progress = i / (points - 1);
      const penalty = r === 3 && progress > 0.55 ? (progress - 0.55) * 0.22 : 0;
      v += (target - v) * 0.035 + normal(rand) * noise * (1 - progress * 0.7);
      y[i] = clamp(v - penalty, 0.02, 0.98);
    }
    cols.push(y);
  }

  return [x, ...cols] as ColumnarData;
}

function heatmapData(points: number): ColumnarData {
  const rand = rng(123);
  const centers: Array<[number, number, number, number]> = [
    [24, 30, 13, 8],
    [76, 70, 9, 7],
    [34, 76, 14, 9],
    [68, 24, 10, 8],
  ];
  const x = new Float64Array(points);
  const y = new Float64Array(points);

  for (let i = 0; i < points; i++) {
    const c = centers[Math.floor(rand() * centers.length)];
    x[i] = c[0] + normal(rand) * c[2];
    y[i] = c[1] + normal(rand) * c[3];
  }

  const idx = Array.from({ length: points }, (_, i) => i).sort((a, b) => x[a] - x[b]);
  return [
    Float64Array.from(idx.map((i) => x[i])),
    Float64Array.from(idx.map((i) => y[i])),
  ];
}

function sweepScatterData(points: number): ColumnarData {
  const rand = rng(514);
  const row = new Float64Array(points);
  const learningRate = new Float64Array(points);
  const validationLoss = new Float64Array(points);
  const family = new Float64Array(points);
  const runtime = new Float64Array(points);
  const accuracy = new Float64Array(points);

  for (let i = 0; i < points; i++) {
    const fam = Math.floor(rand() * MODEL_FAMILIES.length);
    const logLr = -5 + rand() * 4.1;
    const lr = 10 ** logLr;
    const optimum = -3.35 + fam * 0.23;
    const distance = logLr - optimum;
    const baseLoss = 0.18 + fam * 0.025 + distance * distance * (0.08 + fam * 0.012);
    const params = 18 + fam * 16 + rand() * 18;
    const acc = clamp(0.91 - baseLoss * 0.75 + normal(rand) * 0.018, 0.55, 0.94);

    row[i] = i;
    learningRate[i] = lr;
    validationLoss[i] = Math.max(0.06, baseLoss + normal(rand) * 0.025);
    family[i] = fam;
    runtime[i] = params;
    accuracy[i] = acc;
  }

  return [row, learningRate, validationLoss, family, runtime, accuracy];
}

function endpointData(): ColumnarData {
  const x = Float64Array.from([0, 1, 2, 3, 4, 5]);
  const ok = Float64Array.from([1180, 870, 690, 520, 430, 210]);
  const err = Float64Array.from([36, 146, 58, 74, 16, 52]);
  return [x, ok, err];
}

function responseHistogramData(): ColumnarData {
  const rand = rng(204);
  const raw = new Float64Array(9000);
  for (let i = 0; i < raw.length; i++) {
    raw[i] = rand() < 0.72
      ? 31 + normal(rand) * 6
      : 118 + normal(rand) * 20;
  }
  const bins = histogram(raw);
  return [bins.edges, bins.counts];
}

function latencyBandData(): ColumnarData {
  const rand = rng(301);
  const points = 180;
  const x = new Float64Array(points);
  const median = new Float64Array(points);
  const upper = new Float64Array(points);
  const lower = new Float64Array(points);

  for (let i = 0; i < points; i++) {
    const t = i / points;
    x[i] = i;
    const base = 62 + Math.sin(t * Math.PI * 4) * 18 + Math.cos(t * Math.PI * 9) * 5;
    const spread = 10 + Math.sin(t * Math.PI * 3 + 1) * 4;
    median[i] = base + normal(rand) * 1.2;
    upper[i] = median[i] + spread;
    lower[i] = median[i] - spread * 0.75;
  }

  return [x, median, upper, lower];
}

function cloneTheme(theme: ThemeConfig): ThemeConfig {
  return {
    ...theme,
    palette: [...theme.palette],
    categoricalPalette: theme.categoricalPalette ? [...theme.categoricalPalette] : undefined,
    sequentialPalette: theme.sequentialPalette ? [...theme.sequentialPalette] : undefined,
    divergingPalette: theme.divergingPalette ? [...theme.divergingPalette] : undefined,
    heatmapGradient: theme.heatmapGradient ? [...theme.heatmapGradient] : undefined,
  };
}

function formatStats(stats: ChartStats | null): string {
  const label = `${STREAM_HZ} Hz appends - ${STREAM_WINDOW_SECONDS}s window`;
  if (!stats) return `${label} - waiting for stream`;
  return `${label} - appends ${stats.appendDataCount} - draws ${stats.renderCount.data}`;
}

export default function HeroDashboard() {
  const { theme: siteTheme, setTheme: setPageTheme } = useTheme();
  const initialChoice = themeChoiceForMode(siteTheme());
  const [themeKey, setThemeKey] = createSignal(initialChoice.key);
  const [streamStats, setStreamStats] = createSignal<ChartStats | null>(null);
  const [selectedSweepPoints, setSelectedSweepPoints] = createSignal(0);

  const activeChoice = createMemo(() =>
    THEME_CHOICES.find((choice) => choice.key === themeKey()) ?? THEME_CHOICES[0],
  );
  const activeTheme = createMemo(() => cloneTheme(activeChoice().theme));

  createEffect(() => {
    const mode = siteTheme();
    const currentChoice = themeChoiceByKey(untrack(themeKey));
    if (currentChoice?.pageMode === mode) return;
    setThemeKey(themeChoiceForMode(mode).key);
  });

  const streamData = streamSeed(STREAM_WINDOW_POINTS);
  const runsData = experimentData(RUN_NAMES.length, 220);
  const sweepData = sweepScatterData(2600);
  const heatData = heatmapData(110_000);
  const endpoints = endpointData();
  const responseTimes = responseHistogramData();
  const latencyBand = latencyBandData();

  let streamChart: ChartInstance | undefined;
  let lastX = streamData[0][streamData[0].length - 1];
  let streamStep = 1;

  const streamConfig = createMemo<ChartConfig>(() => ({
    theme: activeTheme(),
    debug: { stats: true },
    streaming: { maxLen: STREAM_WINDOW_POINTS },
    axes: { x: { type: 'time' }, y: { type: 'linear' } },
    series: [
      { label: 'Requests', dataIndex: 1, type: 'area', interpolation: 'monotone', lineWidth: 1.8 },
      { label: 'p95 latency', dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 1.6 },
      { label: 'Errors', dataIndex: 3, type: 'line', interpolation: 'monotone', lineWidth: 1.6 },
    ],
    cursor: { show: true, indicators: true },
    zoom: { enabled: true, x: true, bounds: 'data' },
    tooltip: { show: true, mode: 'index' },
    padding: { top: 20, right: 22, bottom: 36, left: 48 },
  }));

  const group = createChartGroup();
  const [runChartA, setRunChartA] = createSignal<ChartInstance | undefined>();
  const [runChartB, setRunChartB] = createSignal<ChartInstance | undefined>();
  const [activeRunChartKey, setActiveRunChartKey] = createSignal<'a' | 'b'>('a');
  const activeRunChart = createMemo(() =>
    activeRunChartKey() === 'b' ? runChartB() : runChartA(),
  );

  function runConfig(metric: string): ChartConfig<RunMeta> {
    return group.apply({
      theme: activeTheme(),
      axes: {
        x: { type: 'linear', padding: 0 },
        y: { type: 'linear', padding: 0.04 },
      },
      series: RUN_NAMES.map((label, i) => ({
        label,
        dataIndex: i + 1,
        type: 'line' as const,
        interpolation: 'monotone' as const,
        lineWidth: 2,
        meta: {
          runId: `run-${i}`,
          metricKey: metric,
          status: i === 3 ? 'failed' : i === 0 ? 'running' : 'finished',
        },
      })),
      highlight: {
        getKey: (series) => series.meta?.runId,
      },
      cursor: { show: true, snap: true },
      tooltip: { show: false },
      zoom: { enabled: true, x: true, bounds: 'data' },
      padding: { top: 18, right: 20, bottom: 34, left: 44 },
    });
  }

  const runConfigA = createMemo(() => runConfig('eval/accuracy'));
  const runConfigB = createMemo(() => runConfig('train/loss'));

  createEffect(() => {
    const chart = runChartA();
    if (!chart) return;

    const off = chart.on('cursor:move', (_dataX, _dataIdx, origin) => {
      if (origin !== 'local') return;
      setActiveRunChartKey('a');
      chart.setHighlight(chart.getCursorSnapshot({ fallback: 'hide' }).activeSeriesIndex);
    });
    onCleanup(off);
  });
  createEffect(() => {
    const chart = runChartB();
    if (!chart) return;

    const off = chart.on('cursor:move', (_dataX, _dataIdx, origin) => {
      if (origin !== 'local') return;
      setActiveRunChartKey('b');
      chart.setHighlight(chart.getCursorSnapshot({ fallback: 'hide' }).activeSeriesIndex);
    });
    onCleanup(off);
  });

  const heatConfig = createMemo<ChartConfig>(() => ({
    theme: activeTheme(),
    axes: { x: { type: 'linear' }, y: { type: 'linear' } },
    series: [{
      label: 'Density',
      yDataIndex: 1,
      type: 'scatter',
      heatmap: true,
      heatmapBinSize: 1,
    }],
    cursor: { show: true },
    zoom: { enabled: true, x: true, y: true, bounds: 'data' },
    tooltip: { show: true, mode: 'nearest' },
    padding: { top: 18, right: 20, bottom: 34, left: 44 },
  }));

  const sweepConfig = createMemo<ChartConfig>(() => ({
    theme: activeTheme(),
    interaction: 'analytical',
    axes: {
      x: {
        type: 'log',
        padding: 0.05,
        tickFormat: (value) => value >= 0.001 ? value.toFixed(3) : value.toExponential(0),
      },
      y: { type: 'linear', padding: 0.08 },
    },
    series: [{
      label: 'Sweep runs',
      type: 'scatter',
      xDataIndex: 1,
      yDataIndex: 2,
      colorBy: {
        dataIndex: 3,
        type: 'category',
        label: 'Family',
        format: (value) => MODEL_FAMILIES[Math.round(value)] ?? 'Other',
      },
      sizeBy: {
        dataIndex: 4,
        range: [2.2, 7.5],
        scale: 'sqrt',
        label: 'Runtime',
        format: (value) => `${value.toFixed(1)} min`,
      },
      tooltipFields: [
        { dataIndex: 5, label: 'Accuracy', format: (value) => `${(value * 100).toFixed(2)}%` },
      ],
      pointShape: 'circle',
      opacity: 0.72,
      renderMode: 'points',
    }],
    cursor: { show: true, indicators: true },
    zoom: { enabled: false, x: true, y: true },
    selection: {
      onSelect: (selection) => setSelectedSweepPoints(selection.points?.length ?? 0),
    },
    tooltip: { show: true, mode: 'nearest' },
    padding: { top: 18, right: 20, bottom: 38, left: 48 },
  }));

  const endpointConfig = createMemo<ChartConfig>(() => ({
    theme: activeTheme(),
    axes: {
      x: {
        type: 'linear',
        tickFormat: (v) => {
          const idx = Math.round(v);
          if (Math.abs(v - idx) > 1e-6) return '';
          return ['/api', '/auth', '/users', '/search', '/upload', '/admin'][idx] ?? '';
        },
      },
      y: { type: 'linear' },
    },
    series: [
      { label: '2xx', dataIndex: 1, type: 'bar' },
      { label: '5xx', dataIndex: 2, type: 'bar' },
    ],
    cursor: { show: true },
    tooltip: { show: true, mode: 'index' },
    padding: { top: 18, right: 18, bottom: 34, left: 50 },
  }));

  const histogramConfig = createMemo<ChartConfig>(() => ({
    theme: activeTheme(),
    axes: { x: { type: 'linear' }, y: { type: 'linear' } },
    series: [{ label: 'Response time', dataIndex: 1, type: 'histogram' }],
    cursor: { show: true },
    tooltip: { show: true, mode: 'x' },
    padding: { top: 18, right: 18, bottom: 34, left: 50 },
  }));

  const bandConfig = createMemo<ChartConfig>(() => ({
    theme: activeTheme(),
    axes: { x: { type: 'linear' }, y: { type: 'linear' } },
    series: [{
      label: 'Latency band',
      dataIndex: 1,
      upperDataIndex: 2,
      lowerDataIndex: 3,
      type: 'band',
      opacity: 0.16,
      interpolation: 'monotone',
      lineWidth: 1.8,
    }],
    cursor: { show: true },
    tooltip: { show: true, mode: 'index' },
    padding: { top: 18, right: 18, bottom: 34, left: 48 },
  }));

  function appendStreamSample() {
    if (!streamChart) return;

    lastX += STREAM_FRAME_MS;
    const [requestValue, p95Value, errorValue] = streamValues(streamStep);
    streamStep++;

    streamChart.appendData([
      new Float64Array([lastX]),
      new Float64Array([requestValue]),
      new Float64Array([p95Value]),
      new Float64Array([errorValue]),
    ]);
  }

  let streamFrame = 0;
  let lastStreamFrameAt = performance.now();
  let lastStatsAt = 0;

  function resetStreamClock(now = performance.now()) {
    lastStreamFrameAt = now;
    lastStatsAt = now;
  }

  function runStream(now: number) {
    if (!streamChart) {
      resetStreamClock(now);
      streamFrame = window.requestAnimationFrame(runStream);
      return;
    }

    const elapsed = now - lastStreamFrameAt;
    if (elapsed > STREAM_PAUSE_RESET_MS) {
      resetStreamClock(now);
    } else if (elapsed >= STREAM_FRAME_MS) {
      const appendCount = Math.min(4, Math.floor(elapsed / STREAM_FRAME_MS));
      for (let i = 0; i < appendCount; i++) appendStreamSample();
      lastStreamFrameAt += appendCount * STREAM_FRAME_MS;
    }

    if (now - lastStatsAt >= STREAM_STATS_MS) {
      setStreamStats(streamChart.getStats());
      lastStatsAt = now;
    }

    streamFrame = window.requestAnimationFrame(runStream);
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') resetStreamClock();
  }

  function handleWindowFocus() {
    resetStreamClock();
  }

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', handleWindowFocus);
  streamFrame = window.requestAnimationFrame(runStream);
  onCleanup(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('focus', handleWindowFocus);
    window.cancelAnimationFrame(streamFrame);
  });

  createEffect(() => {
    document.documentElement.style.setProperty('--chart-panel-bg', activeTheme().backgroundColor);
  });
  onCleanup(() => {
    document.documentElement.style.removeProperty('--chart-panel-bg');
  });

  function chooseTheme(choice: ThemeChoice) {
    rememberThemeChoice(choice);
    batch(() => {
      setThemeKey(choice.key);
      setPageTheme(choice.pageMode);
    });
  }

  return (
    <section
      class="demos-showcase"
      style={{
        background: 'var(--bg)',
        color: 'var(--text)',
        'min-height': 'calc(100vh - 56px)',
      }}
    >
      <div
        style={{
          margin: '0 auto',
          padding: '28px clamp(16px, 3vw, 40px) 44px',
          'max-width': '1680px',
        }}
      >
        <header
          style={{
            display: 'grid',
            'grid-template-columns': 'minmax(260px, 1fr) auto',
            gap: '18px',
            'align-items': 'end',
            'margin-bottom': '18px',
          }}
        >
          <div>
            <div style={{ color: 'var(--text-secondary)', 'font-size': '12px', 'font-weight': 700, 'letter-spacing': '0.08em', 'text-transform': 'uppercase' }}>
              Snaplot Demos
            </div>
            <h1 style={{ 'font-size': 'clamp(24px, 3vw, 38px)', 'line-height': 1.05, margin: '6px 0 8px' }}>
              Fast charts for dense, live dashboards
            </h1>
            <p style={{ margin: 0, color: 'var(--text-secondary)', 'max-width': '780px', 'font-size': '14px' }}>
              Fixed-window streaming, million-scale rendering patterns, cross-chart sync, and dashboard chart types in one focused workspace.
            </p>
          </div>

          <div
            class="demo-theme-row"
            role="group"
            aria-label="Demo theme"
            style={{
              display: 'flex',
              gap: '8px',
              'flex-wrap': 'wrap',
              'justify-content': 'flex-end',
            }}
          >
            <For each={THEME_CHOICES}>
              {(choice) => (
                <ThemeButton
                  choice={choice}
                  active={themeKey() === choice.key}
                  onClick={() => chooseTheme(choice)}
                />
              )}
            </For>
          </div>
        </header>

        <div style={{ display: 'grid', gap: '14px' }}>
          <Panel
            title="Streaming Throughput"
            meta={
              <span style={{ display: 'inline-flex', gap: '8px', 'align-items': 'center' }}>
                <span class="live-dot" />
                {formatStats(streamStats())}
              </span>
            }
          >
            <div style={{ height: '320px' }}>
              <Chart
                config={streamConfig()}
                data={streamData}
                onReady={(chart) => {
                  streamChart = chart;
                  setStreamStats(chart.getStats());
                }}
              />
            </div>
          </Panel>

          <div
            style={{
              display: 'grid',
              'grid-template-columns': '1fr 1fr',
              gap: '14px',
            }}
            class="demos-two-col-grid"
          >
            <Panel title="Dense Event Cloud" meta="110K points - heatmap renderer">
              <div style={{ height: '260px' }}>
                <Chart config={heatConfig()} data={heatData} />
              </div>
            </Panel>

            <Panel title="Latency Envelope" meta="band series">
              <div style={{ height: '260px' }}>
                <Chart config={bandConfig()} data={latencyBand} />
              </div>
            </Panel>
          </div>

          <Panel
            title="Experiment Sweep Scatter"
            meta={selectedSweepPoints() > 0
              ? `${selectedSweepPoints()} selected - colour by model family, size by runtime`
              : '2.6K runs - colour by model family, size by runtime'}
          >
            <div style={{ height: '320px' }}>
              <Chart config={sweepConfig()} data={sweepData} />
            </div>
          </Panel>

          <Panel title="Experiment Comparison" meta="cursor, zoom, highlight, legend table">
            <div
              style={{
                display: 'grid',
                'grid-template-columns': '1fr 1fr',
                gap: '1px',
                background: 'color-mix(in srgb, var(--border) 70%, transparent)',
              }}
              class="demos-sync-grid"
            >
              <div style={{ height: '260px', background: 'var(--chart-panel-bg, var(--bg-surface))' }}>
                <Chart config={runConfigA()} data={runsData} onReady={setRunChartA} />
              </div>
              <div style={{ height: '260px', background: 'var(--chart-panel-bg, var(--bg-surface))' }}>
                <Chart config={runConfigB()} data={runsData} onReady={setRunChartB} />
              </div>
            </div>
            <LegendTable<RunMeta>
              chart={activeRunChart}
              columns={[
                nameColumn(),
                metricColumn<RunMeta>((point) => point.meta!.metricKey),
                column<RunMeta>({
                  key: 'status',
                  header: 'Status',
                  cell: (point) => point.meta!.status,
                }),
                valueColumn({ format: (value) => value.toFixed(4) }),
              ]}
            />
          </Panel>

          <div
            style={{
              display: 'grid',
              'grid-template-columns': '1fr 1fr',
              gap: '14px',
            }}
            class="demos-two-col-grid"
          >
            <Panel title="Top Endpoints" meta="grouped bar chart">
              <div style={{ height: '260px' }}>
                <Chart config={endpointConfig()} data={endpoints} />
              </div>
            </Panel>

            <Panel title="Response Time" meta="histogram - 9K samples">
              <div style={{ height: '260px' }}>
                <Chart config={histogramConfig()} data={responseTimes} />
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </section>
  );
}

function ThemeButton(props: {
  choice: ThemeChoice;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.active}
      onClick={props.onClick}
      style={{
        display: 'inline-flex',
        'align-items': 'center',
        gap: '8px',
        height: '34px',
        padding: '0 11px',
        'border-radius': '999px',
        border: props.active ? '1px solid var(--accent)' : '1px solid var(--border)',
        background: props.active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'var(--bg-surface)',
        color: props.active ? 'var(--text)' : 'var(--text-secondary)',
        cursor: 'pointer',
        'font-size': '12px',
        'font-weight': 650,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          width: '30px',
          height: '14px',
          overflow: 'hidden',
          'border-radius': '999px',
          border: '1px solid color-mix(in srgb, var(--border) 75%, transparent)',
        }}
      >
        <span style={{ flex: 1, background: props.choice.theme.backgroundColor }} />
        <span style={{ flex: 1, background: props.choice.theme.palette[0] }} />
        <span style={{ flex: 1, background: props.choice.theme.palette[1] ?? props.choice.theme.textColor }} />
      </span>
      {props.choice.label}
    </button>
  );
}

function Panel(props: {
  title: string;
  meta?: JSX.Element | string;
  children: JSX.Element;
}) {
  return (
    <section
      style={{
        background: 'var(--chart-panel-bg, var(--bg-surface))',
        'border-radius': '16px',
        'box-shadow': 'var(--elev-1-inset), var(--elev-1-shadow)',
        overflow: 'hidden',
        display: 'flex',
        'flex-direction': 'column',
        'min-width': '0',
      }}
    >
      <div
        style={{
          padding: '12px 16px 8px',
          display: 'flex',
          'align-items': 'baseline',
          'justify-content': 'space-between',
          gap: '12px',
        }}
      >
        <h2 style={{ 'font-size': '14px', 'font-weight': 700, margin: 0 }}>
          {props.title}
        </h2>
        {props.meta && (
          <div style={{ color: 'var(--text-secondary)', 'font-size': '12px', 'white-space': 'nowrap' }}>
            {props.meta}
          </div>
        )}
      </div>
      {props.children}
    </section>
  );
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
