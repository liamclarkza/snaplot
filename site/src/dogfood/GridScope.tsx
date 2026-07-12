import { createMemo, createSignal, Show } from 'solid-js';
import { ivoryTheme, type ChartConfig, type ChartInstance } from 'snaplot';
import { Chart, createChartGroup, createReferenceRegions, SeriesLegend } from 'snaplot/solid';
import { ChartCard, DogfoodShell, Metric, Segmented } from './DogfoodShell';
import { energyColumns, energyComparison, energyDay, energyHistogram, energyScatter } from './data';

type EnergyState = 'ready' | 'loading' | 'missing' | 'no-forecast';
const dateOptions = [{ value: '0', label: 'Today' }, { value: '-1', label: 'Yesterday' }, { value: '-2', label: 'Tue 8' }] as const;
const gridTheme = { ...ivoryTheme, backgroundColor: 'container' as const };

export default function GridScope() {
  const [day, setDay] = createSignal<'0' | '-1' | '-2'>('0');
  const [solar, setSolar] = createSignal(1);
  const [battery, setBattery] = createSignal(13.5);
  const [state, setState] = createSignal<EnergyState>('ready');
  const [selectedHours, setSelectedHours] = createSignal('Full day');
  const [selectedRange, setSelectedRange] = createSignal<{ min: number; max: number }>();
  const [flowChart, setFlowChart] = createSignal<ChartInstance>();
  const group = createChartGroup();
  const points = createMemo(() => energyDay(Number(day()), solar(), battery()));
  const data = createMemo(() => energyColumns(points(), state() === 'missing', state() === 'no-forecast'));
  const visiblePoints = createMemo(() => {
    const range = selectedRange();
    return range ? points().filter((point) => point.time >= range.min && point.time <= range.max) : points();
  });
  const totalUse = createMemo(() => visiblePoints().reduce((sum, point) => sum + point.consumption / 12, 0));
  const totalSolar = createMemo(() => visiblePoints().reduce((sum, point) => sum + point.solar / 12, 0));
  const selfPowered = createMemo(() => Math.min(100, totalSolar() / totalUse() * 100));

  const shared = (config: ChartConfig): ChartConfig => group.apply({
    ...config,
    theme: gridTheme,
    axes: { x: { type: 'time', tickCount: 7 }, y: { type: 'linear', nice: true }, ...config.axes },
    cursor: { show: true, indicators: true },
    zoom: { enabled: true, x: true, y: false, bounds: 'data' },
    pan: { enabled: true, x: true },
    touch: { drag: 'cursor', selectionGesture: 'double-tap-drag' },
    tooltip: { mode: 'index', xFormat: clock },
    padding: { top: 16, right: 18, bottom: 38, left: 54 },
  }, { zoom: true });

  const tariffRegions = createReferenceRegions(() => {
    const start = points()[0].time;
    return [
      { axis: 'x' as const, from: start + 6 * 3_600_000, to: start + 9 * 3_600_000, label: 'Peak tariff', fill: '#d97745', opacity: 0.08 },
      { axis: 'x' as const, from: start + 17 * 3_600_000, to: start + 21 * 3_600_000, label: 'Peak tariff', fill: '#d97745', opacity: 0.08 },
    ];
  });

  const flowConfig = createMemo(() => shared({
    axes: { x: { type: 'time', label: 'Time of day', tickCount: 7 }, y: { type: 'linear', label: 'Power', min: 0, tickFormat: (v) => `${v} kW`, nice: true } },
    series: [
      { label: 'Solar forecast', type: 'band', dataIndex: 3, upperDataIndex: 4, lowerDataIndex: 5, stroke: '#e7a72f', fill: '#f4c85c', opacity: 0.18 },
      { label: 'Solar generation', type: 'area', dataIndex: 2, stroke: '#dd9b20', fillGradient: { top: 'rgba(244,200,92,.48)', bottom: 'rgba(244,200,92,.05)' }, lineWidth: 1.8, interpolation: 'monotone' },
      { label: 'Home consumption', type: 'line', dataIndex: 1, stroke: '#24473f', lineWidth: 2.4, interpolation: 'monotone', spanGaps: false },
    ],
    selection: { mode: 'brush', onBrush: (selection) => {
      if (!selection) { setSelectedRange(undefined); return setSelectedHours('Full day'); }
      setSelectedRange(selection.x);
      const hours = (selection.x.max - selection.x.min) / 3_600_000;
      setSelectedHours(`${hours.toFixed(1)} hour selection`);
    } },
    tooltip: { yFormat: (v) => `${v.toFixed(2)} kW` },
    plugins: [tariffRegions],
  }));
  const batteryConfig = createMemo(() => shared({
    axes: { x: { type: 'time', tickCount: 7 }, y: { type: 'linear', min: 0, max: 100, tickFormat: (v) => `${v}%` } },
    series: [{ label: 'Battery', type: 'area', dataIndex: 6, stroke: '#1f8f72', fillGradient: { top: 'rgba(31,143,114,.28)', bottom: 'rgba(31,143,114,.025)' }, lineWidth: 1.8 }],
    tooltip: { yFormat: (v) => `${v.toFixed(0)}% charged` },
  }));
  const priceConfig = createMemo(() => shared({
    axes: { x: { type: 'time', tickCount: 7 }, y: { type: 'linear', min: 0, tickFormat: (v) => `R${v.toFixed(0)}` } },
    series: [{ label: 'Grid tariff', type: 'line', dataIndex: 7, stroke: '#d15f3a', lineWidth: 2, interpolation: 'step-after' }],
    tooltip: { yFormat: (v) => `R${v.toFixed(2)} / kWh` },
    plugins: [tariffRegions],
  }));
  const register = (chart: ChartInstance) => group.link(chart, { yDomain: false, gutters: true });

  return (
    <DogfoodShell active="gridscope" product="GridScope" eyebrow="Home energy studio">
      <div class="grid-page">
        <section class="df-hero grid-hero">
          <div><p class="df-kicker">{day() === '0' ? 'Thursday, 10 July' : day() === '-1' ? 'Wednesday, 9 July' : 'Tuesday, 8 July'} · Cape Town</p><h1>Your home is running on sunshine.</h1><p>Explore today’s energy flow and plan a more independent home.</p></div>
          <div class="weather"><span aria-hidden="true">☀</span><strong>22°</strong><small>Clear · 18 km/h</small></div>
        </section>

        <section class="grid-controls" aria-label="Energy scenario controls">
          <Segmented label="Day" value={day()} options={dateOptions} onChange={setDay} />
          <label><span>Solar array <b>{(solar() * 6).toFixed(1)} kWp</b></span><input aria-label="Solar array size" type="range" min="0.5" max="1.6" step="0.1" value={solar()} onInput={(e) => setSolar(Number(e.currentTarget.value))} /></label>
          <label><span>Battery <b>{battery().toFixed(1)} kWh</b></span><input aria-label="Battery capacity" type="range" min="5" max="25" step="0.5" value={battery()} onInput={(e) => setBattery(Number(e.currentTarget.value))} /></label>
          <label class="scenario-select"><span>Data scenario</span><select value={state()} onChange={(e) => setState(e.currentTarget.value as EnergyState)}><option value="ready">Ready</option><option value="loading">Loading</option><option value="missing">Missing readings</option><option value="no-forecast">Forecast unavailable</option></select></label>
        </section>

        <section class="df-metrics grid-metrics">
          <Metric label={selectedRange() ? 'Generated in selection' : 'Generated today'} value={`${totalSolar().toFixed(1)} kWh`} delta={`${(totalSolar() * 0.93).toFixed(1)} kg CO₂ avoided`} tone="good" />
          <Metric label={selectedRange() ? 'Consumption in selection' : 'Home consumption'} value={`${totalUse().toFixed(1)} kWh`} delta="8% below your average" tone="good" />
          <Metric label="Self powered" value={`${selfPowered().toFixed(0)}%`} delta="Goal 80%" tone={selfPowered() >= 80 ? 'good' : 'warn'} />
          <Metric label="Viewing" value={selectedHours()} delta="Brush the main chart" />
        </section>

        <ChartCard title="Today’s energy flow" subtitle="Generation, consumption, and forecast range" meta={<div class="grid-chart-meta"><Show when={flowChart()}>{chart => <SeriesLegend chart={chart()} />}</Show><span class="grid-live"><i /> Live · updated 2 min ago</span></div>} class="grid-flow-card">
          <Show when={state() !== 'loading'} fallback={<div class="df-chart grid-main-chart"><div class="df-loading"><span /><span /><span /></div></div>}>
            <div class="df-chart grid-main-chart"><Chart config={flowConfig()} data={data()} onReady={(chart) => { register(chart); setFlowChart(chart); }} /></div>
            <Show when={state() === 'no-forecast'}><div class="inline-notice" role="status"><span>Forecast temporarily unavailable.</span> Live generation remains visible.</div></Show>
            <Show when={state() === 'missing'}><div class="inline-notice" role="status"><span>12:00–13:55 readings missing.</span> Snaplot leaves a visible gap in consumption.</div></Show>
          </Show>
        </ChartCard>

        <div class="grid-sync-row">
          <ChartCard title="Home battery" subtitle="State of charge"><div class="df-chart df-chart-md"><Chart config={batteryConfig()} data={data()} onReady={register} /></div></ChartCard>
          <ChartCard title="Grid tariff" subtitle="Time-of-use pricing"><div class="df-chart df-chart-md"><Chart config={priceConfig()} data={data()} onReady={register} /></div></ChartCard>
        </div>

        <section class="grid-insight-head"><div><p class="df-kicker">Patterns</p><h2>Understand where your energy goes.</h2></div><p>Historical context turns one day of telemetry into decisions you can act on.</p></section>
        <div class="grid-insights">
          <ChartCard title="Daily energy" subtitle="Solar production vs consumption · 14 days"><div class="df-chart df-chart-md"><Chart config={{ theme: gridTheme, axes: { x: { type: 'linear', tickCount: 7, tickFormat: (v) => `Jul ${Math.round(v) + 1}`, grid: false }, y: { type: 'linear', min: 0, tickFormat: (v) => `${v} kWh`, nice: true } }, series: [{ label: 'Solar', type: 'bar', dataIndex: 1, fill: '#e6ad35' }, { label: 'Home', type: 'bar', dataIndex: 2, fill: '#315d52' }], tooltip: { mode: 'index', yFormat: (v) => `${v.toFixed(1)} kWh` }, padding: { top: 16, right: 16, bottom: 38, left: 54 } }} data={energyComparison()} /></div></ChartCard>
          <ChartCard title="Demand & temperature" subtitle="45 days of hourly readings"><div class="df-chart df-chart-md"><Chart config={{ theme: gridTheme, interaction: 'analytical', axes: { x: { type: 'linear', label: 'Outdoor temperature', tickFormat: (v) => `${v}°C` }, y: { type: 'linear', label: 'Demand', tickFormat: (v) => `${v} kW` } }, series: [{ label: 'Hourly demand', type: 'scatter', xDataIndex: 1, yDataIndex: 2, colorBy: { dataIndex: 1, type: 'continuous', domain: [8,35], palette: ['#2d6c73','#e6ad35','#d15f3a'] }, pointRadius: 3, opacity: 0.5 }], tooltip: { mode: 'nearest', yFormat: (v) => `${v.toFixed(2)} kW` }, zoom: { x: true, y: true }, padding: { top: 16, right: 16, bottom: 50, left: 54 } }} data={energyScatter()} /></div></ChartCard>
          <ChartCard title="Usage distribution" subtitle="Today’s five-minute readings"><div class="df-chart df-chart-md"><Chart config={{ theme: gridTheme, axes: { x: { type: 'linear', tickFormat: (v) => `${v.toFixed(1)} kW` }, y: { type: 'linear' } }, series: [{ label: 'Readings', type: 'histogram', dataIndex: 1, fill: '#da7652' }], tooltip: { mode: 'x' }, padding: { top: 16, right: 16, bottom: 38, left: 42 } }} data={energyHistogram(points())} /></div></ChartCard>
        </div>

        <section class="grid-tip"><span aria-hidden="true">↗</span><div><strong>Your next best move</strong><p>Shifting the dishwasher to 11:30 could use surplus solar and save an estimated R142 per month.</p></div></section>
      </div>
    </DogfoodShell>
  );
}

function clock(value: number): string {
  return new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false }).format(value);
}
