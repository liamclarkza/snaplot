import { createMemo, createSignal, onCleanup, onMount, Show } from 'solid-js';
import { refinedDarkTheme, type ChartOptions, type ChartHandle, type ColumnData, type ReferenceLine } from 'snaplot';
import { Chart, createChartGroup, LegendTable, SeriesLegend } from 'snaplot/solid';
import { ChartCard, DogfoodShell, EmptyState, Metric, Segmented } from './DogfoodShell';
import { mulberry32, pulseColumns, pulseHistogram, pulsePoints, serviceComparison, type PulsePoint } from './data';

type PulseState = 'live' | 'loading' | 'empty' | 'disconnected' | 'partial';
const services = ['Edge API', 'Identity', 'Search'];
const timeOptions = [
  { value: '15m', label: '15m' },
  { value: '30m', label: '30m' },
  { value: '1h', label: '1h' },
] as const;
const pulseTheme = { ...refinedDarkTheme, backgroundColor: 'container' as const };
const compactChartPadding = { top: 12, right: 12, bottom: 12, left: 12 } as const;

export default function PulseOps() {
  const [service, setService] = createSignal(0);
  const [paused, setPaused] = createSignal(false);
  const [windowSize, setWindowSize] = createSignal<'15m' | '30m' | '1h'>('30m');
  const [state, setState] = createSignal<PulseState>('live');
  const [latest, setLatest] = createSignal<PulsePoint>(pulsePoints(0, 360).at(-1)!);
  const [legendChart, setLegendChart] = createSignal<ChartHandle<Record<string, number>>>();
  const group = createChartGroup({ viewport: true, alignPlots: true });
  const chartInstances = new Set<ChartHandle<Record<string, number>>>();
  const rand = mulberry32(0x0b5e7e);
  let sequence = 0;

  const basePoints = createMemo(() => pulsePoints(service(), 360));
  const baseData = createMemo<ColumnData>(() => {
    if (state() === 'empty') return pulseColumns([]);
    return pulseColumns(basePoints(), state() === 'partial');
  });

  const follow = () => windowSize() === '15m' ? 900_000 : windowSize() === '30m' ? 1_800_000 : 3_600_000;
  const shared = (config: ChartOptions<Record<string, number>>): ChartOptions<Record<string, number>> => ({
    group, x: 'time',
    ...config,
    theme: pulseTheme,
    streaming: { maxPoints: 720, followWindow: follow() },
    cursor: { show: true, indicators: true, syncTooltip: false },
    zoom: { enabled: true, x: true, y: false, bounds: 'data' },
    pan: { enabled: true, x: true },
    tooltip: { show: true, mode: 'index', xFormat: timeLabel },
    padding: { top: 14, right: 18, bottom: 32, left: 54 },
  });

  const cpuRefs: ReferenceLine[] = [
    { axis: 'y', value: 75, label: 'warning', color: '#f5b942', dash: [5, 4] },
    { axis: 'y', value: 90, label: 'critical', color: '#ff647c', dash: [5, 4] },
  ];
  const latencyRefs: ReferenceLine[] = [
    { axis: 'y', value: 180, label: 'SLO 180 ms', color: '#f5b942', dash: [5, 4] },
  ];
  const errorRefs: ReferenceLine[] = [
    { axis: 'y', value: 2, label: 'budget 2%', color: '#ff647c', dash: [5, 4] },
  ];

  const cpuConfig = createMemo(() => shared({
    axes: { x: { type: 'time', tickCount: 5 }, y: { type: 'linear', min: 0, max: 100, format: (v) => `${v}%`, roundBounds: true } },
    series: [
      { label: 'CPU', y: 'cpu', type: 'line', stroke: '#6de5c2', lineWidth: 2, interpolation: 'monotone' },
      { label: 'Memory', y: 'memory', type: 'area', stroke: '#7e9cff', fillGradient: { top: 'rgba(126,156,255,.25)', bottom: 'rgba(126,156,255,.015)' }, lineWidth: 1.5 },
    ],
    referenceLines: cpuRefs,
    tooltip: { yFormat: (v) => `${Number(v).toFixed(1)}%` },
  }));
  const latencyConfig = createMemo(() => shared({
    axes: { x: { type: 'time', tickCount: 5 }, y: { type: 'linear', min: 0, format: (v) => `${v}ms`, roundBounds: true } },
    series: [
      { label: 'Expected range', type: 'band', y: 'forecast', upper: 'upper', lower: 'lower', stroke: '#9b87f5', fill: '#9b87f5', opacity: 0.16 },
      { label: 'p95 latency', y: 'latency', type: 'line', stroke: '#f4ca64', lineWidth: 2.2, interpolation: 'monotone', spanGaps: false },
    ],
    referenceLines: latencyRefs,
    tooltip: { yFormat: (v) => `${Number(v).toFixed(0)} ms` },
  }));
  const trafficConfig = createMemo(() => shared({
    axes: {
      x: { type: 'time', tickCount: 5 },
      y: { type: 'linear', min: 0, format: (v) => `${(Number(v) / 1000).toFixed(1)}k`, roundBounds: true },
      y2: { type: 'linear', position: 'right', min: 0, max: 4, format: (v) => `${v}%` },
    },
    series: [
      { label: 'Requests', y: 'requests', type: 'area', stroke: '#57b8ff', fillGradient: { top: 'rgba(87,184,255,.28)', bottom: 'rgba(87,184,255,.02)' }, lineWidth: 1.6 },
      { label: 'Errors', y: 'errors', type: 'line', yAxis: 'y2', stroke: '#ff647c', lineWidth: 2 },
    ],
    referenceLines: errorRefs,
    tooltip: { yFormat: (v, i) => i === 'errors' ? `${Number(v).toFixed(2)}%` : `${Math.round(Number(v))} req/s` },
    padding: { top: 14, right: 56, bottom: 32, left: 54 },
  }));

  const register = (chart: ChartHandle<Record<string, number>>, legend = false) => {
    chartInstances.add(chart);
    if (legend) setLegendChart(chart);
  };

  onMount(() => {
    const timer = window.setInterval(() => {
      if (paused() || state() !== 'live') return;
      const previous = latest();
      sequence += 1;
      const wave = Math.sin(sequence / 10 + service());
      const point: PulsePoint = {
        time: previous.time + 10_000,
        cpu: Math.max(12, Math.min(96, previous.cpu * 0.72 + (50 + wave * 17 + rand() * 15) * 0.28)),
        memory: Math.max(25, Math.min(92, previous.memory + (rand() - 0.47) * 1.4)),
        latency: Math.max(65, 120 + wave * 22 + rand() * 30 + service() * 8),
        requests: Math.max(500, 1550 + wave * 260 + rand() * 170),
        errors: Math.max(0.04, 0.28 + rand() * 0.42),
        forecast: 122 + wave * 16,
        upper: 150 + wave * 16,
        lower: 98 + wave * 16,
      };
      setLatest(point);
      const chunk = pulseColumns([point]);
      chartInstances.forEach((chart) => { chart.appendData(chunk); });
    }, 1000);
    onCleanup(() => window.clearInterval(timer));
  });
  onCleanup(() => chartInstances.clear());

  const changeService = (value: string) => {
    const index = services.indexOf(value);
    setService(index);
    setLatest(pulsePoints(index, 360).at(-1)!);
  };

  return (
    <DogfoodShell active="pulseops" product="PulseOps" eyebrow="Production control">
      <div class="pulse-page">
        <section class="df-hero pulse-hero">
          <div><p class="df-kicker">Production overview</p><h1>Systems are healthy.</h1><p>Live telemetry across the edge platform, updated every ten seconds.</p></div>
          <div class="pulse-status"><span class={state() === 'disconnected' ? 'status-bad' : 'status-good'} />{state() === 'disconnected' ? 'Collector offline' : paused() ? 'Stream paused' : 'All collectors online'}<small>Last sample {timeLabel(latest().time)}</small></div>
        </section>

        <section class="df-toolbar" aria-label="Dashboard controls">
          <label>Service<select value={services[service()]} onChange={(e) => changeService(e.currentTarget.value)}>{services.map((name) => <option>{name}</option>)}</select></label>
          <Segmented label="Time window" value={windowSize()} options={timeOptions} onChange={setWindowSize} />
          <label>Scenario<select value={state()} onChange={(e) => setState(e.currentTarget.value as PulseState)}><option value="live">Live</option><option value="loading">Loading</option><option value="partial">Partial data</option><option value="empty">Empty</option><option value="disconnected">Disconnected</option></select></label>
          <button class="df-primary" type="button" onClick={() => setPaused((v) => !v)}>{paused() ? 'Resume stream' : 'Pause stream'}</button>
        </section>

        <section class="df-metrics" aria-label="Current service metrics">
          <Metric label="Availability" value="99.98%" delta="+0.03% vs SLO" tone="good" />
          <Metric label="p95 latency" value={`${latest().latency.toFixed(0)} ms`} delta={latest().latency > 180 ? 'Above SLO' : 'Within SLO'} tone={latest().latency > 180 ? 'warn' : 'good'} />
          <Metric label="Throughput" value={`${(latest().requests / 1000).toFixed(2)}k/s`} delta="+8.4% this hour" tone="good" />
          <Metric label="Error rate" value={`${latest().errors.toFixed(2)}%`} delta="0.41% budget used" />
        </section>

        <div class="pulse-layout">
          <div class="pulse-main">
            <ChartCard title="Resource pressure" subtitle="CPU and memory utilization" meta={<span class="chart-hint">Drag to zoom · Shift-drag to pan</span>}>
              <div class="df-chart df-chart-lg"><Chart {...cpuConfig()} data={baseData()} onReady={(c) => register(c)} /></div>
              <StateOverlay state={state()} />
            </ChartCard>
            <ChartCard title="Request latency" subtitle="p95 against predicted operating envelope" meta={<div class="grid-chart-meta"><Show when={legendChart()}>{chart => <SeriesLegend chart={chart} />}</Show><span>SLO 180 ms</span></div>}>
              <div class="df-chart df-chart-lg"><Chart {...latencyConfig()} data={baseData()} onReady={(c) => register(c, true)} /></div>
              <StateOverlay state={state()} />
            </ChartCard>
            <ChartCard title="Traffic & errors" subtitle="Dual-axis service health">
              <div class="df-chart df-chart-lg"><Chart {...trafficConfig()} data={baseData()} onReady={(c) => register(c)} /></div>
              <StateOverlay state={state()} />
            </ChartCard>
          </div>
          <aside class="pulse-side">
            <ChartCard title="Cursor details" subtitle="Synced to request latency"><LegendTable chart={legendChart} fallback="latest" showStepHeader formatStep={(value) => timeLabel(Number(value))} /></ChartCard>
            <ChartCard title="Latency distribution" subtitle="Last 30 minutes"><div class="df-chart df-chart-sm"><Chart {...{ theme: pulseTheme, axes: { x: { type: 'linear', format: (v) => `${Number(v).toFixed(0)}ms` }, y: { type: 'linear' } }, series: [{ id: 'samples', label: 'Samples', type: 'histogram', data: pulseHistogram(basePoints().slice(-180)), fill: '#9b87f5' }], tooltip: { mode: 'x' }, padding: compactChartPadding }} /></div></ChartCard>
            <ChartCard title="Regional availability" subtitle="Current vs previous window"><div class="df-chart df-chart-sm"><Chart {...{ theme: pulseTheme, axes: { x: { type: 'linear', ticks: [0,1,2,3], format: (v) => ['JHB','FRA','IAD','SIN'][Number(v)] ?? '', grid: false }, y: { type: 'linear', min: 99.8, max: 100, format: (v) => `${Number(v).toFixed(1)}%` } }, series: [{ label: 'Current', type: 'bar', y: 'current', fill: '#6de5c2' }, { label: 'Previous', type: 'bar', y: 'previous', fill: '#40506c' }], tooltip: { mode: 'index', yFormat: (v) => `${Number(v).toFixed(2)}%` }, padding: compactChartPadding }} x="region" data={serviceComparison} /></div></ChartCard>
          </aside>
        </div>
      </div>
    </DogfoodShell>
  );
}

function StateOverlay(props: { state: PulseState }) {
  return <Show when={props.state !== 'live' && props.state !== 'partial'}><div class="df-state-overlay"><Show when={props.state === 'loading'} fallback={<EmptyState title={props.state === 'empty' ? 'No samples in this window' : 'Telemetry unavailable'} detail={props.state === 'empty' ? 'Try a longer time range or another service.' : 'The collector is reconnecting. Existing data is preserved.'} />}><div class="df-loading"><span /><span /><span /></div></Show></div></Show>;
}

function timeLabel(value: number): string {
  return new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(value);
}
