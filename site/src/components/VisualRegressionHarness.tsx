import { createSignal } from 'solid-js';
import type { JSX } from 'solid-js';
import { Chart, LegendTable } from 'snaplot/solid';
import {
  histogram,
  nameColumn,
  valueColumn,
  studioTheme,
  lightTheme,
  tokyoTheme,
  darkTheme,
  oceanTheme,
  forestTheme,
  sunsetTheme,
  violetTheme,
  fogTheme,
  ivoryTheme,
  mintTheme,
} from 'snaplot';
import type { ChartConfig, ColumnarData, ChartInstance, ThemeConfig } from 'snaplot';
// The legend-table fixture needs the plugin stylesheet the docs page also
// pulls from source. Published consumers import 'snaplot/legend-table.css'.
import '../../../packages/snaplot/src/styles/legendTable.css';

/**
 * Deterministic renderer fixtures for the secondary `#/visual` route
 * (deliberately absent from the nav). Each panel carries a stable
 * `id`/`data-fixture` slug so `site/scripts/screenshots.mjs` can capture
 * them one by one for manual and scripted regression review. Everything
 * here is seeded, so a given fixture renders the same pixels every run.
 */

const f = (xs: number[]): Float64Array => Float64Array.from(xs);

// Deterministic LCG so fixtures never depend on Math.random.
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

// Themes promoted on the docs page, one swatch row each.
const NAMED_THEMES: { label: string; theme: ThemeConfig }[] = [
  { label: 'studio', theme: studioTheme },
  { label: 'light', theme: lightTheme },
  { label: 'tokyo', theme: tokyoTheme },
  { label: 'dark', theme: darkTheme },
  { label: 'ocean', theme: oceanTheme },
  { label: 'forest', theme: forestTheme },
  { label: 'sunset', theme: sunsetTheme },
  { label: 'violet', theme: violetTheme },
  { label: 'fog', theme: fogTheme },
  { label: 'ivory', theme: ivoryTheme },
  { label: 'mint', theme: mintTheme },
];

function multiLine(): ColumnarData {
  const n = 80;
  const x = new Float64Array(n);
  const a = new Float64Array(n);
  const b = new Float64Array(n);
  const c = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    x[i] = i;
    a[i] = 50 + Math.sin(t * Math.PI * 3) * 18;
    b[i] = 40 + Math.cos(t * Math.PI * 2) * 14;
    c[i] = 62 + Math.sin(t * Math.PI * 4 + 1) * 10;
  }
  return [x, a, b, c];
}

function gapLine(): ColumnarData {
  return [
    f([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
    f([12, 15, 17, NaN, NaN, NaN, 22, 20, 24, 21, 25, 23]),
  ];
}

function axisTitleLine(): ColumnarData {
  const n = 60;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    x[i] = i;
    y[i] = 400 + Math.sin(t * Math.PI * 2) * 220 + t * 180;
  }
  return [x, y];
}

// Columns: [index, x, y, category, weight]. Scatter reads x/y/color/size
// off explicit column indices, so column 0 is a placeholder shared X.
function scatterCloud(n = 600): ColumnarData {
  const rand = rng(7);
  const idx = new Float64Array(n);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const cat = new Float64Array(n);
  const size = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const g = Math.floor(rand() * 4);
    idx[i] = i;
    x[i] = 20 + g * 18 + normal(rand) * 7;
    y[i] = 25 + g * 14 + normal(rand) * 9;
    cat[i] = g;
    size[i] = 6 + rand() * 18;
  }
  return [idx, x, y, cat, size];
}

function densityCloud(n = 14_000): ColumnarData {
  const rand = rng(11);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    x[i] = t * 100;
    y[i] = 50 + Math.sin(t * Math.PI * 10) * 20 + normal(rand) * 6;
  }
  return [x, y];
}

function bandData(): ColumnarData {
  const rand = rng(3);
  const n = 60;
  const x = new Float64Array(n);
  const mid = new Float64Array(n);
  const up = new Float64Array(n);
  const lo = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    x[i] = i;
    const base = 52 + Math.sin(t * Math.PI * 3) * 15;
    mid[i] = base + normal(rand) * 0.8;
    up[i] = mid[i] + 8 + Math.sin(t * 5) * 2;
    lo[i] = mid[i] - 8 - Math.cos(t * 4) * 2;
  }
  return [x, mid, up, lo];
}

function barData(): ColumnarData {
  return [f([0, 1, 2, 3, 4]), f([120, 90, 140, 70, 110]), f([40, 60, 30, 50, 20])];
}

function histData(): ColumnarData {
  const rand = rng(9);
  const raw = new Float64Array(4000);
  for (let i = 0; i < raw.length; i++) {
    raw[i] = rand() < 0.7 ? 30 + normal(rand) * 6 : 70 + normal(rand) * 12;
  }
  const bins = histogram(raw);
  return [bins.edges, bins.counts];
}

const lineSeries = [
  { label: 'alpha', dataIndex: 1, type: 'line' as const, interpolation: 'monotone' as const, lineWidth: 2 },
  { label: 'beta', dataIndex: 2, type: 'line' as const, interpolation: 'monotone' as const, lineWidth: 2 },
  { label: 'gamma', dataIndex: 3, type: 'line' as const, interpolation: 'monotone' as const, lineWidth: 2 },
];

const axisTitleConfig: ChartConfig = {
  axes: {
    x: { type: 'linear', label: 'Elapsed (s)' },
    y: { type: 'linear', label: 'Throughput (req/s)' },
  },
  series: [{ label: 'req/s', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2 }],
  tooltip: { show: false },
};

function spanGapsConfig(spanGaps: boolean): ChartConfig {
  return {
    axes: { x: { type: 'linear' }, y: { type: 'linear' } },
    series: [{ label: 'series', dataIndex: 1, type: 'line', interpolation: 'linear', lineWidth: 2, spanGaps }],
    tooltip: { show: false },
  };
}

const scatterConfig: ChartConfig = {
  axes: { x: { type: 'linear' }, y: { type: 'linear' } },
  series: [
    {
      label: 'runs',
      type: 'scatter',
      xDataIndex: 1,
      yDataIndex: 2,
      colorBy: {
        dataIndex: 3,
        type: 'category',
        label: 'Group',
        format: (v) => ['A', 'B', 'C', 'D'][Math.round(v)] ?? '?',
      },
      sizeBy: { dataIndex: 4, range: [3, 9], scale: 'sqrt', label: 'Weight' },
      opacity: 0.78,
      renderMode: 'points',
    },
  ],
  tooltip: { show: false },
};

const densityConfig: ChartConfig = {
  axes: { x: { type: 'linear' }, y: { type: 'linear' } },
  series: [
    {
      label: 'density',
      yDataIndex: 1,
      type: 'scatter',
      renderMode: 'density',
      heatmapBinSize: 2,
      // Explicit ramp: `renderMode: 'density'` does not inherit a theme ramp
      // the way the legacy `heatmap: true` flag does, so the fixture pins one.
      heatmapGradient: ['#0b1021', '#1b2a5b', '#2f6fb0', '#3fb0a5', '#c7e46b'],
    },
  ],
  tooltip: { show: false },
};

const bandConfig: ChartConfig = {
  axes: { x: { type: 'linear' }, y: { type: 'linear' } },
  series: [
    {
      label: 'band',
      dataIndex: 1,
      upperDataIndex: 2,
      lowerDataIndex: 3,
      type: 'band',
      opacity: 0.18,
      interpolation: 'monotone',
      lineWidth: 1.5,
    },
  ],
  tooltip: { show: false },
};

const barConfig: ChartConfig = {
  axes: { x: { type: 'linear' }, y: { type: 'linear' } },
  series: [
    { label: 'ok', dataIndex: 1, type: 'bar' },
    { label: 'error', dataIndex: 2, type: 'bar' },
  ],
  tooltip: { show: false },
};

const histogramConfig: ChartConfig = {
  axes: { x: { type: 'linear' }, y: { type: 'linear' } },
  series: [{ label: 'latency', dataIndex: 1, type: 'histogram' }],
  tooltip: { show: false },
};

const tooltipConfig: ChartConfig = {
  axes: { x: { type: 'linear' }, y: { type: 'linear' } },
  series: lineSeries,
  // syncTooltip lets a programmatic cursor open the tooltip (see onReady).
  cursor: { show: true, syncTooltip: true },
  tooltip: { show: true, mode: 'index' },
};

const legendConfig: ChartConfig = {
  axes: { x: { type: 'linear' }, y: { type: 'linear' } },
  series: lineSeries,
  cursor: { show: true, snap: true, syncTooltip: true },
  tooltip: { show: false },
};

const highlightConfig: ChartConfig = {
  axes: { x: { type: 'linear' }, y: { type: 'linear' } },
  series: lineSeries,
  highlight: { dimOpacity: 0.15 },
  tooltip: { show: false },
};

// Open the tooltip / populate the legend without a real pointer by parking
// a programmatic cursor mid-plot once the first frame has painted.
function parkCursor(chart: ChartInstance, dataX: number): void {
  requestAnimationFrame(() => chart.setCursorDataX(dataX, 'programmatic'));
}

export default function VisualRegressionHarness() {
  const [legendChart, setLegendChart] = createSignal<ChartInstance | undefined>();

  return (
    <section style={{ padding: '32px clamp(16px, 4vw, 48px)', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ 'max-width': '1180px', margin: '0 auto' }}>
        <h2 style={{ 'font-size': '18px', 'font-weight': 700, margin: '0 0 8px' }}>
          Visual Regression Fixtures
        </h2>
        <p style={{ margin: '0 0 18px', color: 'var(--text-secondary)', 'font-size': '13px' }}>
          Deterministic charts for manual and scripted screenshot checks of renderer edge cases.
          Not linked from the nav; reachable at <code>#/visual</code>.
        </p>

        <Fixture slug="theme-swatches" title="Theme swatch strips" span>
          <ThemeSwatches />
        </Fixture>

        <div
          style={{
            display: 'grid',
            'grid-template-columns': 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '18px',
          }}
        >
          <Fixture slug="axis-titles" title="Axis titles">
            <Chart data={axisTitleLine()} config={axisTitleConfig} />
          </Fixture>

          <Fixture slug="spangaps-off" title="spanGaps off (broken path)">
            <Chart data={gapLine()} config={spanGapsConfig(false)} />
          </Fixture>

          <Fixture slug="spangaps-on" title="spanGaps on (bridged)">
            <Chart data={gapLine()} config={spanGapsConfig(true)} />
          </Fixture>

          <Fixture slug="scatter-color-size" title="Scatter colorBy + sizeBy">
            <Chart data={scatterCloud()} config={scatterConfig} />
          </Fixture>

          <Fixture slug="density-heatmap" title="Density heatmap">
            <Chart data={densityCloud()} config={densityConfig} />
          </Fixture>

          <Fixture slug="band" title="Band series">
            <Chart data={bandData()} config={bandConfig} />
          </Fixture>

          <Fixture slug="bar" title="Grouped bar">
            <Chart data={barData()} config={barConfig} />
          </Fixture>

          <Fixture slug="histogram" title="Histogram">
            <Chart data={histData()} config={histogramConfig} />
          </Fixture>

          <Fixture slug="tooltip-open" title="Open tooltip (index mode)">
            <Chart
              data={multiLine()}
              config={tooltipConfig}
              onReady={(chart) => parkCursor(chart, 40)}
            />
          </Fixture>

          <Fixture slug="highlight-dim" title="Highlight dim state">
            <Chart
              data={multiLine()}
              config={highlightConfig}
              onReady={(chart) => chart.setHighlight(1)}
            />
          </Fixture>
        </div>

        <Fixture slug="legend-table" title="Legend table" span>
          <div style={{ display: 'flex', 'flex-direction': 'column' }}>
            <div style={{ height: '220px' }}>
              <Chart
                data={multiLine()}
                config={legendConfig}
                onReady={(chart) => {
                  setLegendChart(chart);
                  parkCursor(chart, 40);
                }}
              />
            </div>
            <LegendTable chart={legendChart} columns={[nameColumn(), valueColumn()]} />
          </div>
        </Fixture>
      </div>
    </section>
  );
}

function Fixture(props: { slug: string; title: string; span?: boolean; children: JSX.Element }) {
  return (
    <section
      id={props.slug}
      data-fixture={props.slug}
      // Span fixtures stand alone in the column and space themselves; grid
      // fixtures rely on the grid `gap`, so they carry no margin.
      style={{ margin: props.span ? '18px 0' : '0' }}
    >
      <h3 style={{ 'font-size': '13px', 'font-weight': 650, margin: '0 0 8px' }}>{props.title}</h3>
      <div
        style={{
          border: '1px solid var(--border)',
          'border-radius': '8px',
          overflow: 'hidden',
          background: 'var(--bg-surface)',
        }}
      >
        {/* Chart fixtures fill a fixed 220px box; the swatch and legend
            fixtures pass their own layout and opt out via `span`. */}
        {props.span ? props.children : <div style={{ height: '220px' }}>{props.children}</div>}
      </div>
    </section>
  );
}

function ThemeSwatches() {
  return (
    <div
      style={{
        display: 'grid',
        'grid-template-columns': 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '10px',
        padding: '14px',
      }}
    >
      {NAMED_THEMES.map((entry) => (
        <div
          style={{
            display: 'flex',
            'align-items': 'center',
            gap: '10px',
            padding: '8px 10px',
            'border-radius': '8px',
            background: entry.theme.backgroundColor,
            color: entry.theme.textColor,
            border: '1px solid var(--border)',
          }}
        >
          <span style={{ 'font-size': '12px', 'font-weight': 600, width: '52px' }}>{entry.label}</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            {entry.theme.palette.map((c) => (
              <span
                style={{
                  width: '16px',
                  height: '16px',
                  'border-radius': '4px',
                  background: c,
                  'box-shadow': 'inset 0 0 0 1px rgba(127,127,127,0.35)',
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
