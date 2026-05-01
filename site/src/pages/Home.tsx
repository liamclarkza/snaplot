import { createSignal, createMemo, onCleanup } from 'solid-js';
import { createLegendPlugin, darkTheme, lightTheme } from 'snaplot';
import { Chart } from 'snaplot/solid';
import type { ColumnarData, ChartConfig, ChartInstance } from 'snaplot';
import CodeBlock from '../components/CodeBlock';
import { Button } from '../components/ui';
import { useTheme } from '../ThemeContext';

/**
 * Four-core CPU usage. Each core is a bounded random walk with
 * occasional workload bursts, the shape a real CPU chart would
 * trace on an idle box that occasionally compiles something. Five
 * thousand samples streaming at 50 Hz keeps the X axis sliding
 * without the chart ever spiking off-scale.
 */
const WINDOW_POINTS = 5000;
const TICK_MS = 20; // 50 Hz

type CoreState = number[]; // 4 values, one per core

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function stepCores(prev: CoreState): CoreState {
  const next: CoreState = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    // Lazy random walk, drift toward the core's idle baseline
    // (15–30 %), with occasional brief workloads that push one
    // core up to 70–90 % for a few seconds.
    const baseline = 18 + i * 4;
    let v = prev[i] + (Math.random() - 0.5) * 3;
    // Mean reversion toward baseline keeps long-term shape calm.
    v += (baseline - v) * 0.03;
    // Workload burst: rare, affects one core at a time.
    if (Math.random() < 0.0012) {
      v = clamp(v + 30 + Math.random() * 30, 0, 95);
    }
    next[i] = clamp(v, 2, 98);
  }
  return next;
}

function generateCores(): { data: ColumnarData; tail: CoreState } {
  const now = Date.now();
  const x = new Float64Array(WINDOW_POINTS);
  const c0 = new Float64Array(WINDOW_POINTS);
  const c1 = new Float64Array(WINDOW_POINTS);
  const c2 = new Float64Array(WINDOW_POINTS);
  const c3 = new Float64Array(WINDOW_POINTS);
  let s: CoreState = [22, 26, 18, 24];
  for (let i = 0; i < WINDOW_POINTS; i++) {
    x[i] = now - (WINDOW_POINTS - i) * TICK_MS;
    s = stepCores(s);
    c0[i] = s[0];
    c1[i] = s[1];
    c2[i] = s[2];
    c3[i] = s[3];
  }
  return { data: [x, c0, c1, c2, c3], tail: s };
}

const heroCode = `import { createLegendPlugin } from 'snaplot';
import { Chart } from 'snaplot/solid';

<Chart
  config={{
    axes: { x: { type: 'time' }, y: { type: 'linear', min: 0, max: 100 } },
    series: [
      { label: 'Core 0', dataIndex: 1, type: 'line', interpolation: 'monotone' },
      { label: 'Core 1', dataIndex: 2, type: 'line', interpolation: 'monotone' },
      { label: 'Core 2', dataIndex: 3, type: 'line', interpolation: 'monotone' },
      { label: 'Core 3', dataIndex: 4, type: 'line', interpolation: 'monotone' },
    ],
    tooltip: { show: true, mode: 'index' },
    plugins: [createLegendPlugin({ position: 'bottom' })],
  }}
  data={[times, core0, core1, core2, core3]}
/>`;

type Stat = { value: string; label: string };
const stats: Stat[] = [
  { value: '200K+', label: 'points at 60 fps' },
  { value: '< 20 kB', label: 'gzipped bundle' },
  { value: '0',      label: 'runtime dependencies' },
  { value: '5',      label: 'lines to a working chart' },
];

export default function Home() {
  const initial = generateCores();
  const [chartData, setChartData] = createSignal<ColumnarData>(initial.data);
  let tail: CoreState = initial.tail;
  let heroChart: ChartInstance | undefined;
  const { theme } = useTheme();

  // Per-mode hero palette. Light mode uses Observable/Tableau-10's
  // first four (blue / green / orange / red), the de facto standard
  // for business dashboards, proven legible and cohesive. Dark mode
  // uses the matching Tokyo Night quartet, softer pastels tuned
  // specifically for dark backgrounds so no line glares.
  const palette = () =>
    theme() === 'light'
      ? ['#4e79a7', '#59a14f', '#f28e2b', '#e15759']
      : ['#7aa2f7', '#9ece6a', '#ff9e64', '#f7768e'];

  const heroConfig = createMemo<ChartConfig>(() => {
    const p = palette();
    return {
      theme: theme() === 'light' ? lightTheme : darkTheme,
      axes: {
        x: { type: 'time' },
        y: {
          type: 'linear',
          min: 0,
          max: 100,
          tickFormat: (v: number) => `${v}%`,
        },
      },
      series: [
        { label: 'Core 0', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 1.5, stroke: p[0] },
        { label: 'Core 1', dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 1.5, stroke: p[1] },
        { label: 'Core 2', dataIndex: 3, type: 'line', interpolation: 'monotone', lineWidth: 1.5, stroke: p[2] },
        { label: 'Core 3', dataIndex: 4, type: 'line', interpolation: 'monotone', lineWidth: 1.5, stroke: p[3] },
      ],
      cursor: { show: true },
      zoom: { enabled: true, x: true },
      tooltip: { show: true, mode: 'index' },
      padding: { top: 20, right: 20, bottom: 36, left: 56 },
      plugins: [createLegendPlugin({ position: 'bottom' })],
    };
  });

  // 50 Hz tick. Each step shifts the window forward by one sample and
  // appends a fresh one, setData on the full column every 20 ms so the
  // page actually demonstrates sustained repaint throughput, not just
  // an append-to-tail optimisation.
  const interval = setInterval(() => {
    setChartData((prev) => {
      const [x, c0, c1, c2, c3] = prev;
      const len = x.length;
      const nx = new Float64Array(len);
      const n0 = new Float64Array(len);
      const n1 = new Float64Array(len);
      const n2 = new Float64Array(len);
      const n3 = new Float64Array(len);
      nx.set(x.subarray(1));
      n0.set(c0.subarray(1));
      n1.set(c1.subarray(1));
      n2.set(c2.subarray(1));
      n3.set(c3.subarray(1));
      tail = stepCores(tail);
      nx[len - 1] = x[len - 1] + TICK_MS;
      n0[len - 1] = tail[0];
      n1[len - 1] = tail[1];
      n2[len - 1] = tail[2];
      n3[len - 1] = tail[3];
      return [nx, n0, n1, n2, n3];
    });
    heroChart?.setData(chartData());
  }, TICK_MS);
  onCleanup(() => clearInterval(interval));

  return (
    <main>
      {/* Hero */}
      <section
        style={{
          padding: 'var(--space-9) var(--space-5) var(--space-6)',
          'max-width': 'var(--max-width)',
          margin: '0 auto',
          'text-align': 'center',
        }}
      >
        <h1
          style={{
            'font-size': 'clamp(36px, 5.5vw, 60px)',
            'font-weight': 700,
            'letter-spacing': '-0.03em',
            'line-height': 1.08,
            'margin-bottom': 'var(--space-4)',
          }}
        >
          Charts that <span style={{ color: 'var(--accent)' }}>keep up</span>.
        </h1>
        <p
          style={{
            'font-size': 'var(--fs-md)',
            color: 'var(--text-secondary)',
            'max-width': '620px',
            margin: '0 auto var(--space-5)',
            'line-height': 1.55,
          }}
        >
          A canvas chart library built for streaming data. Columnar typed arrays,
          layered rendering, and a minimal reactive API that ensures your dashboards stay
          responsive as data keeps arriving.
        </p>
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            'justify-content': 'center',
            'flex-wrap': 'wrap',
          }}
        >
          <Button href="#/docs" variant="primary">Get started</Button>
          <Button href="#/demos" variant="secondary">Explore themes</Button>
          <Button
            href="https://github.com/liamclarkza/snaplot"
            target="_blank"
            rel="noopener"
            variant="secondary"
          >
            GitHub
          </Button>
        </div>
      </section>

      {/* Hero chart, streaming latency dashboard */}
      <section
        style={{
          padding: '0 var(--space-5)',
          'max-width': 'var(--max-width)',
          margin: '0 auto var(--space-7)',
        }}
      >
        <ChartPanel>
          <div
            style={{
              padding: 'var(--space-4) var(--space-5) 0',
              display: 'flex',
              'align-items': 'baseline',
              'justify-content': 'space-between',
              gap: 'var(--space-4)',
              'flex-wrap': 'wrap',
            }}
          >
            <div>
              <div
                style={{
                  'font-size': 'var(--fs-base)',
                  'font-weight': 600,
                  'letter-spacing': '-0.01em',
                }}
              >
                CPU usage
              </div>
              <div
                style={{
                  'font-size': 'var(--fs-xs)',
                  color: 'var(--text-secondary)',
                  'margin-top': '2px',
                }}
              >
                4 cores · 5,000 samples · 20 ms tick
              </div>
            </div>
            <div
              style={{
                'font-size': 'var(--fs-xs)',
                color: 'var(--text-secondary)',
                'font-variant-numeric': 'tabular-nums',
                'text-align': 'right',
              }}
            >
              drag to zoom · scroll an axis to zoom it · shift+drag to pan · double-click to reset · hover to inspect
            </div>
          </div>
          <div style={{ height: 'clamp(280px, 44vh, 380px)', padding: '8px 0 var(--space-2)' }}>
            <Chart config={heroConfig()} data={chartData()} onReady={(c) => { heroChart = c; }} />
          </div>
        </ChartPanel>
      </section>

      {/* Stats strip */}
      <section
        style={{
          padding: '0 var(--space-5) var(--space-8)',
          'max-width': 'var(--max-width)',
          margin: '0 auto',
        }}
      >
        <div
          style={{
            display: 'grid',
            'grid-template-columns': 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 'var(--space-5)',
            padding: 'var(--space-5) var(--space-4)',
            'border-top': '1px solid var(--border)',
            'border-bottom': '1px solid var(--border)',
          }}
        >
          {stats.map((s) => (
            <div style={{ 'text-align': 'center' }}>
              <div
                style={{
                  'font-size': 'var(--fs-2xl)',
                  'font-weight': 700,
                  'letter-spacing': '-0.02em',
                  'font-variant-numeric': 'tabular-nums',
                  color: 'var(--text)',
                  'line-height': 1.1,
                }}
              >
                {s.value}
              </div>
              <div
                style={{
                  'font-size': 'var(--fs-sm)',
                  color: 'var(--text-secondary)',
                  'margin-top': 'var(--space-1)',
                }}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Code, "here's the chart above" */}
      <section
        style={{
          padding: '0 var(--space-5) var(--space-8)',
          'max-width': 'var(--max-width)',
          margin: '0 auto',
        }}
      >
        <div
          style={{
            'text-align': 'center',
            'margin-bottom': 'var(--space-5)',
          }}
        >
          <h2
            style={{
              'font-size': 'var(--fs-xl)',
              'font-weight': 700,
              'letter-spacing': '-0.02em',
              'margin-bottom': 'var(--space-2)',
            }}
          >
            The chart above, from config to canvas
          </h2>
          <p
            style={{
              color: 'var(--text-secondary)',
              'font-size': 'var(--fs-base)',
              'max-width': '540px',
              margin: '0 auto',
            }}
          >
            No wrapper components. No config trees. Pass Float64Arrays, describe
            series, done.
          </p>
        </div>
        <CodeBlock code={heroCode} lang="tsx" />
      </section>

      {/* CTA strip */}
      <section
        style={{
          padding: '0 var(--space-5) var(--space-9)',
          'max-width': 'var(--max-width)',
          margin: '0 auto',
          'text-align': 'center',
        }}
      >
        <div
          style={{
            'font-size': 'var(--fs-md)',
            color: 'var(--text-secondary)',
            'margin-bottom': 'var(--space-4)',
          }}
        >
          Six hand-tuned themes. Line, area, scatter, bar, histogram, band, density heatmap.
          All reactive, all interactive.
        </div>
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            'justify-content': 'center',
            'flex-wrap': 'wrap',
          }}
        >
          <Button href="#/demos" variant="primary">See it live</Button>
          <Button href="#/docs" variant="secondary">Read the docs</Button>
        </div>
      </section>
    </main>
  );
}

/**
 * Soft-UI panel wrapping the hero chart. Background matches the chart
 * canvas so there's no seam at the plot edge; depth comes from the
 * inset top highlight + ambient shadow tokens.
 */
function ChartPanel(props: { children: any }) {
  return (
    <div
      style={{
        background: 'var(--chart-bg)',
        'border-radius': 'var(--radius-lg)',
        'box-shadow': 'var(--elev-1-inset), var(--elev-1-shadow)',
        overflow: 'hidden',
      }}
    >
      {props.children}
    </div>
  );
}
