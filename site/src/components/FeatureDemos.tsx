import { createMemo, createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import { Chart } from 'snaplot/solid';
import { darkTheme, lightTheme } from 'snaplot';
import type { ChartConfig, ChartInstance, ColumnarData, ThemeConfig } from 'snaplot';
import { useTheme } from '../ThemeContext';

/**
 * Compact interactive demos for features added this release, sitting below
 * the main dashboard on /demos. Each isolates one capability so it reads at
 * a glance: spanGaps bridging, proximity auto-highlight, and updateLast
 * streaming. Axis titles ship in the dashboard's sweep-scatter panel above.
 */

const f = (xs: number[]): Float64Array => Float64Array.from(xs);

function useChartTheme(): () => ThemeConfig {
  const { theme } = useTheme();
  return () => (theme() === 'light' ? lightTheme : darkTheme);
}

const axes = { x: { type: 'linear' as const }, y: { type: 'linear' as const } };
const padding = { top: 16, right: 18, bottom: 30, left: 42 };

function gappyLine(): ColumnarData {
  return [
    f([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]),
    f([18, 22, 25, NaN, NaN, NaN, 30, 27, 33, NaN, 29, 34, 31, 36]),
  ];
}

function multiLine(): ColumnarData {
  const n = 90;
  const x = new Float64Array(n);
  const a = new Float64Array(n);
  const b = new Float64Array(n);
  const c = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    x[i] = i;
    a[i] = 50 + Math.sin(t * Math.PI * 3) * 18;
    b[i] = 42 + Math.cos(t * Math.PI * 2) * 13;
    c[i] = 63 + Math.sin(t * Math.PI * 4 + 1) * 10;
  }
  return [x, a, b, c];
}

export default function FeatureDemos() {
  return (
    <section
      style={{
        background: 'var(--bg)',
        color: 'var(--text)',
        padding: '8px clamp(16px, 3vw, 40px) 56px',
      }}
    >
      <div style={{ 'max-width': '1680px', margin: '0 auto' }}>
        <div style={{ color: 'var(--text-secondary)', 'font-size': '12px', 'font-weight': 700, 'letter-spacing': '0.08em', 'text-transform': 'uppercase', 'margin-bottom': '6px' }}>
          New this release
        </div>
        <p style={{ margin: '0 0 18px', color: 'var(--text-secondary)', 'font-size': '14px', 'max-width': '780px' }}>
          Small, focused demos of the latest features. Axis titles are shown on the
          sweep-scatter panel above.
        </p>
        <div
          style={{ display: 'grid', 'grid-template-columns': 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}
        >
          <SpanGapsDemo />
          <ProximityDemo />
          <UpdateLastDemo />
        </div>
      </div>
    </section>
  );
}

function SpanGapsDemo() {
  const theme = useChartTheme();
  const [span, setSpan] = createSignal(false);
  const config = createMemo<ChartConfig>(() => ({
    theme: theme(),
    axes,
    series: [{ label: 'signal', dataIndex: 1, type: 'line', interpolation: 'linear', lineWidth: 2, spanGaps: span() }],
    cursor: { show: false },
    tooltip: { show: false },
    padding,
  }));
  return (
    <Card
      title="spanGaps"
      meta={
        <button
          type="button"
          onClick={() => setSpan((v) => !v)}
          aria-pressed={span()}
          style={{
            background: span() ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'var(--bg-surface)',
            color: span() ? 'var(--text)' : 'var(--text-secondary)',
            border: span() ? '1px solid var(--accent)' : '1px solid var(--border)',
            'border-radius': '999px',
            padding: '2px 10px',
            'font-size': '12px',
            'font-weight': 600,
            cursor: 'pointer',
            'font-family': 'inherit',
          }}
        >
          {span() ? 'Bridging gaps' : 'Breaking at gaps'}
        </button>
      }
    >
      <Chart config={config()} data={gappyLine()} />
    </Card>
  );
}

function ProximityDemo() {
  const theme = useChartTheme();
  const config = createMemo<ChartConfig>(() => ({
    theme: theme(),
    axes,
    series: [
      { label: 'alpha', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2 },
      { label: 'beta', dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 2 },
      { label: 'gamma', dataIndex: 3, type: 'line', interpolation: 'monotone', lineWidth: 2 },
    ],
    // Auto-focus the line nearest the cursor within 24 CSS px; others dim.
    highlight: { proximity: 24 },
    cursor: { show: true },
    tooltip: { show: false },
    padding,
  }));
  return (
    <Card title="highlight.proximity" meta="hover near a line">
      <Chart config={config()} data={multiLine()} />
    </Card>
  );
}

const UPDATE_LAST_MAXLEN = 24;
// Deliberately unhurried so each change reads as a discrete update, not lag:
// the forming bar visibly steps up a few times (updateLast, in place), then a
// new bar commits and the window scrolls one slot. A faster cadence blurred
// the in-place refinement into the once-per-bucket scroll and looked jittery.
const UPDATE_LAST_TICK_MS = 220;
const UPDATE_LAST_TICKS_PER_BUCKET = 6;
// Reach most of the target within those few grow ticks so the "fills, then
// commits" story is legible at the slower cadence.
const UPDATE_LAST_GROW_RATE = 0.42;

function seedBuckets(rand: () => number): ColumnarData {
  const x = new Float64Array(UPDATE_LAST_MAXLEN);
  const y = new Float64Array(UPDATE_LAST_MAXLEN);
  for (let i = 0; i < UPDATE_LAST_MAXLEN; i++) {
    x[i] = i;
    y[i] = 30 + Math.sin(i / 3) * 16 + rand() * 10;
  }
  return [x, y];
}

function UpdateLastDemo() {
  const theme = useChartTheme();
  const rand = mulberry(0x51ed);
  const seed = seedBuckets(rand);
  const config = createMemo<ChartConfig>(() => ({
    theme: theme(),
    interaction: 'readonly',
    streaming: { maxLen: UPDATE_LAST_MAXLEN },
    axes: { x: { type: 'linear' }, y: { type: 'linear', min: 0 } },
    series: [{ label: 'req/s (forming bucket updates in place)', dataIndex: 1, type: 'bar' }],
    cursor: { show: false },
    tooltip: { show: false },
    padding,
  }));

  let chart: ChartInstance | undefined;
  let lastX = seed[0][UPDATE_LAST_MAXLEN - 1];
  let forming = seed[1][UPDATE_LAST_MAXLEN - 1];
  let target = forming;
  let ticks = 0;

  onMount(() => {
    const interval = setInterval(() => {
      if (!chart) return;
      ticks += 1;
      if (ticks >= UPDATE_LAST_TICKS_PER_BUCKET) {
        // Commit the finished bucket and open a fresh one (a real append).
        ticks = 0;
        lastX += 1;
        target = 30 + rand() * 55;
        forming = 6 + rand() * 8;
        chart.appendData([f([lastX]), f([forming])]);
      } else {
        // The open bucket keeps filling: overwrite the tail in place rather
        // than appending a new point for every partial update.
        forming += (target - forming) * UPDATE_LAST_GROW_RATE;
        chart.appendData([f([lastX]), f([forming])], { updateLast: true });
      }
    }, UPDATE_LAST_TICK_MS);
    onCleanup(() => clearInterval(interval));
  });

  return (
    <Card title="appendData updateLast" meta="last bar grows, then commits">
      <Chart config={config()} data={seed} onReady={(c) => { chart = c; }} />
    </Card>
  );
}

// Small deterministic PRNG so the streaming demo starts identically each load.
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function Card(props: { title: string; meta?: JSX.Element | string; children: JSX.Element }) {
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
      <div style={{ padding: '12px 16px 8px', display: 'flex', 'align-items': 'baseline', 'justify-content': 'space-between', gap: '12px' }}>
        <h3 style={{ 'font-size': '14px', 'font-weight': 700, margin: 0, 'font-family': 'var(--font-mono)' }}>
          {props.title}
        </h3>
        {props.meta && (
          <div style={{ color: 'var(--text-secondary)', 'font-size': '12px', 'white-space': 'nowrap' }}>
            {props.meta}
          </div>
        )}
      </div>
      <div style={{ height: '240px' }}>{props.children}</div>
    </section>
  );
}
