import { createSignal, createMemo, createEffect, onCleanup, For } from 'solid-js';
import {
  Chart,
  LegendTable,
  createChartGroup,
  createCursorSnapshot,
  nameColumn,
  valueColumn,
  metricColumn,
  swatchColumn,
  column,
  lightTheme,
  darkTheme,
} from 'snaplot';
import { useTheme } from '../ThemeContext';
import type {
  ChartConfig,
  ChartInstance,
  ColumnarData,
  CursorSnapshot,
} from 'snaplot';

// ─── Shared helpers ─────────────────────────────────────────────

interface RunMeta {
  runId: string;
  metricKey: string;
  epoch: number;
}

/**
 * Accuracy-like curves: each series starts near 0 and climbs toward a
 * random target in (0.5, 0.95) with diminishing noise — the shape of a
 * converging training metric. No hard clamp, so values can briefly
 * overshoot without being visibly flattened against the top of the chart.
 */
function runSeriesData(numRuns: number, points: number): ColumnarData {
  const x = new Float64Array(points);
  const series: Float64Array[] = [];
  for (let r = 0; r < numRuns; r++) {
    const arr = new Float64Array(points);
    let v = 0.02 + Math.random() * 0.08;
    const target = 0.5 + Math.random() * 0.45;
    const baseNoise = 0.015 + Math.random() * 0.025;
    for (let i = 0; i < points; i++) {
      x[i] = i;
      // Converge toward target; noise decays with progress.
      const progress = i / (points - 1);
      const noise = baseNoise * (1 - progress * 0.7);
      v += (target - v) * 0.03 + (Math.random() - 0.5) * noise;
      arr[i] = v;
    }
    series.push(arr);
  }
  return [x, ...series] as ColumnarData;
}

function runNames(n: number): string[] {
  const adjs = ['live', 'failed', 'baseline', 'efficient', 'resnet101', 'sweep', 'final', 'pilot'];
  const nouns = ['training', 'experiment', 'resnet50', 'sweep-1', 'sweep-2', 'large-batch', 'attempt'];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(`${adjs[i % adjs.length]}-${nouns[(i * 3) % nouns.length]}-${i}`);
  }
  return out;
}

/**
 * @param numRuns number of series
 * @param metric  per-series `meta.metricKey`
 *
 * X uses `nice: false` so the plot stretches exactly from the first to
 * the last X value (no trailing gap). Y keeps `nice: true` with a small
 * padding so the top-most line doesn't touch the plot edge.
 */
function runConfig(numRuns: number, metric: string): ChartConfig<RunMeta> {
  const names = runNames(numRuns);
  return {
    axes: {
      x: { type: 'linear', nice: false, padding: 0 },
      y: { type: 'linear', padding: 0.05 },
    },
    series: names.map((label, i) => ({
      label,
      dataIndex: i + 1,
      type: 'line' as const,
      interpolation: 'monotone' as const,
      lineWidth: 2,
      meta: { runId: `r${i}`, metricKey: metric, epoch: i },
    })),
    tooltip: { show: false },
    // With highlight active (via activeSeriesIndex), only the focused
    // series gets a cursor dot — the rest just show the crosshair line.
    cursor: { show: true, snap: true },
  };
}

// ─── Demo 1: Default LegendTable ────────────────────────────────

export function DefaultLegendTableDemo() {
  const { theme: siteTheme } = useTheme();
  const [chart, setChart] = createSignal<ChartInstance | undefined>();
  const data = runSeriesData(4, 200);

  const config = createMemo(() => ({
    ...runConfig(4, 'eval/accuracy'),
    theme: siteTheme() === 'light' ? lightTheme : darkTheme,
  }));

  // Highlight the series nearest the cursor — the line under the mouse
  // focuses itself and everything else dims.
  const snap = createCursorSnapshot(chart);
  createEffect(() => {
    chart()?.setHighlight(snap()?.activeSeriesIndex ?? null);
  });

  return (
    <div style={{ border: '1px solid var(--border)', 'border-radius': 'var(--radius-lg)', overflow: 'hidden', background: 'var(--bg-surface)' }}>
      <div style={{ height: '260px' }}>
        <Chart config={config()} data={data} onReady={setChart} />
      </div>
      <LegendTable<RunMeta> chart={chart} />
    </div>
  );
}

// ─── Demo 2: Custom columns with typed meta ─────────────────────

export function CustomColumnsDemo() {
  const { theme: siteTheme } = useTheme();
  const [chart, setChart] = createSignal<ChartInstance | undefined>();
  const [precision, setPrecision] = createSignal(4);
  const data = runSeriesData(5, 200);

  const config = createMemo(() => ({
    ...runConfig(5, 'eval/accuracy'),
    theme: siteTheme() === 'light' ? lightTheme : darkTheme,
  }));

  const snap = createCursorSnapshot(chart);
  createEffect(() => {
    chart()?.setHighlight(snap()?.activeSeriesIndex ?? null);
  });

  return (
    <div style={{ border: '1px solid var(--border)', 'border-radius': 'var(--radius-lg)', overflow: 'hidden', background: 'var(--bg-surface)' }}>
      <div style={{ height: '260px' }}>
        <Chart config={config()} data={data} onReady={setChart} />
      </div>
      <LegendTable<RunMeta>
        chart={chart}
        columns={[
          swatchColumn(),
          nameColumn({ swatch: false }),
          metricColumn<RunMeta>((p) => p.meta!.metricKey),
          column<RunMeta>({
            key: 'epoch',
            header: 'Epoch',
            align: 'right',
            cell: (p) => String(p.meta!.epoch),
          }),
          valueColumn<RunMeta>({
            format: (v) => v.toFixed(precision()),
          }),
        ]}
      />
      <div style={{ padding: '8px 12px', 'border-top': '1px solid var(--border)', 'font-size': '12px', display: 'flex', gap: '8px', 'align-items': 'center' }}>
        Precision:
        <input
          type="range"
          min="0"
          max="10"
          value={precision()}
          onInput={(e) => setPrecision(+e.currentTarget.value)}
        />
        <span style={{ 'font-variant-numeric': 'tabular-nums' }}>{precision()}</span>
      </div>
    </div>
  );
}

// ─── Demo 3: Cross-chart sync (cursor + highlight) ──────────────

export function CrossChartSyncDemo() {
  const { theme: siteTheme } = useTheme();
  const group = createChartGroup();
  const [chartA, setChartA] = createSignal<ChartInstance | undefined>();
  const [chartB, setChartB] = createSignal<ChartInstance | undefined>();
  const data = runSeriesData(4, 200);

  const configA = createMemo(() => group.apply({
    ...runConfig(4, 'eval/accuracy'),
    theme: siteTheme() === 'light' ? lightTheme : darkTheme,
  }));

  const configB = createMemo(() => {
    const base = runConfig(4, 'eval/accuracy');
    return group.apply({
      ...base,
      theme: siteTheme() === 'light' ? lightTheme : darkTheme,
      series: base.series.map((s) => ({
        ...s,
        meta: { ...s.meta!, metricKey: 'train/loss' },
      })),
    });
  });

  return (
    <div style={{ border: '1px solid var(--border)', 'border-radius': 'var(--radius-lg)', overflow: 'hidden', background: 'var(--bg-surface)' }}>
      <div style={{ height: '180px' }}>
        <Chart config={configA()} data={data} onReady={setChartA} />
      </div>
      <div style={{ height: '180px', 'border-top': '1px solid var(--border)' }}>
        <Chart config={configB()} data={data} onReady={setChartB} />
      </div>
      <LegendTable<RunMeta>
        chart={chartA}
        columns={[
          nameColumn(),
          metricColumn<RunMeta>((p) => p.meta!.metricKey),
          valueColumn({ format: (v) => v.toFixed(4) }),
        ]}
      />
      <div style={{ padding: '6px 12px', 'border-top': '1px solid var(--border)', 'font-size': '11px', opacity: 0.7 }}>
        Hover either chart — the cursor and step values sync. Hover a legend row — that series highlights in <i>both</i> charts.
        {/* Suppress unused warning */}
        <span style={{ display: 'none' }}>{String(chartB() ? '' : '')}</span>
      </div>
    </div>
  );
}

// ─── Demo 4: External highlight from a sidepanel ────────────────

export function SidepanelHighlightDemo() {
  const { theme: siteTheme } = useTheme();
  const group = createChartGroup();
  const [chart, setChart] = createSignal<ChartInstance | undefined>();
  const data = runSeriesData(6, 200);
  const config = createMemo(() => group.apply({
    ...runConfig(6, 'eval/accuracy'),
    theme: siteTheme() === 'light' ? lightTheme : darkTheme,
  }));
  const names = runNames(6);

  return (
    <div style={{ display: 'flex', border: '1px solid var(--border)', 'border-radius': 'var(--radius-lg)', overflow: 'hidden', background: 'var(--bg-surface)' }}>
      <div style={{ width: '180px', 'border-right': '1px solid var(--border)', padding: '12px 8px', 'font-size': '12px' }}>
        <div style={{ 'font-weight': 600, 'margin-bottom': '6px', opacity: 0.7 }}>Runs</div>
        <For each={names}>
          {(name, i) => (
            <button
              type="button"
              onMouseEnter={() => group.highlight(i())}
              onMouseLeave={() => group.highlight(null)}
              onFocus={() => group.highlight(i())}
              onBlur={() => group.highlight(null)}
              onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(127,127,127,0.1)')}
              onMouseOut={(e) => (e.currentTarget.style.background = '')}
              title={name}
              style={{
                display: 'block',
                width: '100%',
                'text-align': 'left',
                padding: '4px 6px',
                'border-radius': '4px',
                border: '0',
                background: 'transparent',
                color: 'inherit',
                cursor: 'pointer',
                'white-space': 'nowrap',
                overflow: 'hidden',
                'text-overflow': 'ellipsis',
                font: 'inherit',
              }}
            >
              {name}
            </button>
          )}
        </For>
      </div>
      <div style={{ flex: '1', display: 'flex', 'flex-direction': 'column' }}>
        <div style={{ height: '260px' }}>
          <Chart config={config()} data={data} onReady={setChart} />
        </div>
        <LegendTable<RunMeta> chart={chart} />
      </div>
    </div>
  );
}

// ─── Demo 5: Many runs benchmark with FPS counter ───────────────

export function BenchmarkDemo() {
  const { theme: siteTheme } = useTheme();
  const NUM_RUNS = 50;
  const POINTS = 2_000;
  const [chart, setChart] = createSignal<ChartInstance | undefined>();
  const [fps, setFps] = createSignal(60);

  const data = runSeriesData(NUM_RUNS, POINTS);
  const cfg = createMemo(() => ({
    ...runConfig(NUM_RUNS, 'eval/accuracy'),
    theme: siteTheme() === 'light' ? lightTheme : darkTheme,
  } as ChartConfig<RunMeta>));

  const snap = createCursorSnapshot(chart);
  createEffect(() => {
    chart()?.setHighlight(snap()?.activeSeriesIndex ?? null);
  });

  // FPS counter — measures rAF cadence while the page is animating
  let frames = 0;
  let last = performance.now();
  let raf = 0;
  const tick = (now: number) => {
    frames++;
    if (now - last >= 1000) {
      setFps(Math.round((frames * 1000) / (now - last)));
      frames = 0;
      last = now;
    }
    raf = requestAnimationFrame(tick);
  };
  createEffect(() => {
    raf = requestAnimationFrame(tick);
    onCleanup(() => cancelAnimationFrame(raf));
  });

  return (
    <div style={{ position: 'relative', border: '1px solid var(--border)', 'border-radius': 'var(--radius-lg)', overflow: 'hidden', background: 'var(--bg-surface)' }}>
      <div style={{ height: '260px' }}>
        <Chart config={cfg()} data={data} onReady={setChart} />
      </div>
      <LegendTable<RunMeta>
        chart={chart}
        maxHeight="180px"
        columns={[nameColumn({ truncate: 200 }), valueColumn({ format: (v) => v.toFixed(4) })]}
      />
      <div
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          padding: '4px 8px',
          background: 'rgba(0,0,0,0.55)',
          color: fps() >= 55 ? '#7eed8d' : fps() >= 40 ? '#f5d76e' : '#e95c5c',
          'font-family': 'var(--font-mono)',
          'font-size': '11px',
          'border-radius': '4px',
          'pointer-events': 'none',
        }}
      >
        {NUM_RUNS} series × {POINTS.toLocaleString()} pts &nbsp; {fps()} fps
      </div>
    </div>
  );
}

// ─── Demo 6: Headless cursor snapshot via render-prop ───────────

export function HeadlessSnapshotDemo() {
  const { theme: siteTheme } = useTheme();
  const [chart, setChart] = createSignal<ChartInstance | undefined>();
  const data = runSeriesData(2, 150);
  const config = createMemo(() => ({
    ...runConfig(2, 'eval/accuracy'),
    theme: siteTheme() === 'light' ? lightTheme : darkTheme,
  }));

  return (
    <div style={{ border: '1px solid var(--border)', 'border-radius': 'var(--radius-lg)', overflow: 'hidden', background: 'var(--bg-surface)' }}>
      <div style={{ height: '220px' }}>
        <Chart config={config()} data={data} onReady={setChart} />
      </div>
      <LegendTable<RunMeta> chart={chart}>
        {(snap) => {
          // Focus the line nearest the cursor by pushing
          // `activeSeriesIndex` through to the chart's highlight state —
          // this is the "dim everything else" interaction demonstrated
          // via the cross-chart highlight API, but using a single chart.
          createEffect(() => {
            chart()?.setHighlight(snap()?.activeSeriesIndex ?? null);
          });
          return (
            <pre
              style={{
                margin: 0,
                padding: '12px',
                'border-top': '1px solid var(--border)',
                'font-family': 'var(--font-mono)',
                'font-size': '11px',
                // No max-height — the snapshot is small enough to show in full.
                overflow: 'auto',
                background: 'var(--code-bg)',
                'white-space': 'pre',
              }}
            >
              {snapshotPreview(snap())}
            </pre>
          );
        }}
      </LegendTable>
    </div>
  );
}

function snapshotPreview(s: CursorSnapshot<RunMeta> | null): string {
  if (!s) return 'no chart';
  return JSON.stringify(
    {
      source: s.source,
      dataIndex: s.dataIndex,
      formattedX: s.formattedX,
      // `activeSeriesIndex` is the series whose value at the current X
      // is visually closest to the cursor Y — pair with `setHighlight`
      // to focus the line under the cursor in every chart in the group.
      activeSeriesIndex: s.activeSeriesIndex,
      points: s.points.map((p) => ({
        seriesIndex: p.seriesIndex,
        label: p.label,
        value: Number.isFinite(p.value) ? p.value.toFixed(4) : null,
        meta: p.meta,
      })),
    },
    null,
    2,
  );
}
