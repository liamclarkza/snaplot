import { createMemo, createSignal, For, Show } from 'solid-js';
import { lightTheme, type ChartOptions, type ChartHandle } from 'snaplot';
import { Chart, createChartGroup, createChartState } from 'snaplot/solid';
import { ChartCard, DogfoodShell, EmptyState, Metric, Segmented } from './DogfoodShell';
import { comparisonColumns, comparisonMetrics, comparisonSeries, experimentRuns, families, metricHistogram, progressColumns, runsById, topRunsByAccuracy, type ExperimentRun } from './data';

type DensityMode = 'points' | 'density';
type ColorMode = 'family' | 'cost';

const allRuns = experimentRuns(24_000);
const densityOptions = [{ value: 'points', label: 'Points' }, { value: 'density', label: 'Density' }] as const;
const colorOptions = [{ value: 'family', label: 'Family' }, { value: 'cost', label: 'Cost' }] as const;
const cohortTheme = { ...lightTheme, backgroundColor: 'container' as const };

export default function CohortLab() {
  const [family, setFamily] = createSignal('All families');
  const [team, setTeam] = createSignal('All teams');
  const [status, setStatus] = createSignal('All statuses');
  const [days, setDays] = createSignal('30');
  const [density, setDensity] = createSignal<DensityMode>('points');
  const [colorMode, setColorMode] = createSignal<ColorMode>('family');
  const [selectedCount, setSelectedCount] = createSignal(0);
  const [selectedIds, setSelectedIds] = createSignal<number[]>([124, 257, 618]);
  const group = createChartGroup();
  const [progressChart, setProgressChart] = createSignal<ChartHandle<Record<string, number>>>();
  const progressState = createChartState(progressChart);

  const filtered = createMemo(() => allRuns.filter((run) =>
    (family() === 'All families' || run.family === family()) &&
    (team() === 'All teams' || run.team === team()) &&
    (status() === 'All statuses' || run.status === status()) &&
    run.day < Number(days()),
  ));
  const selectedRuns = createMemo(() => runsById(allRuns, selectedIds()));
  const topVisibleRuns = createMemo(() => topRunsByAccuracy(filtered()));
  const bestRun = createMemo(() => filtered().reduce<ExperimentRun | undefined>((best, run) => !best || run.accuracy > best.accuracy ? run : best, undefined));

  const scatterConfig = createMemo<ChartOptions<ExperimentRun>>(() => ({
    theme: cohortTheme,
    interaction: 'analytical',
    x: 'latency', rowId: 'id',
    axes: {
      x: { type: 'log', title: 'Inference latency (ms)', format: (v) => `${v} ms`, roundBounds: true },
      y: { type: 'linear', title: 'Validation accuracy', format: (v) => `${Number(v).toFixed(0)}%`, roundBounds: true },
    },
    series: [{
      id: 'runs', label: 'Experiment runs', type: 'scatter', y: (run) => run.accuracy * 100,
      colorBy: colorMode() === 'family'
        ? { field: (run) => families.indexOf(run.family), type: 'category', label: 'Family', format: (v) => families[Math.round(Number(v))] ?? 'Unknown' }
        : { field: 'cost', type: 'continuous', domain: [0, 2.4], palette: ['#36a98f', '#f2bb52', '#d85a6a'], label: 'Cost / 1K', format: (v) => `$${Number(v).toFixed(2)}` },
      sizeBy: { field: 'size', range: [2.4, 8], scale: 'sqrt', label: 'Parameters', format: (v) => `${Number(v).toFixed(0)}M` },
      tooltipFields: [{ field: 'cost', label: 'Cost / 1K', format: (v) => `$${Number(v).toFixed(2)}` }],
      renderMode: density(), opacity: 0.68,
    }],
    onSelect: (selection) => {
      const points = selection.points ?? [];
      setSelectedCount(points.length);
      if (points.length > 0) {
        const ids = [...new Set(points.map(point => Number(point.rowId)))].slice(0, 4);
        if (ids.length) setSelectedIds(ids);
      }
    },
    zoom: { enabled: true, x: true, y: true, bounds: 'data' },
    pan: { enabled: true, x: true, y: true },
    touch: { drag: 'pan', selectionGesture: 'double-tap-drag' },
    tooltip: { show: true, mode: 'nearest', yFormat: (v) => `${Number(v).toFixed(2)}%` },
    cursor: { show: true, xLine: true, yLine: true },
    padding: { top: 16, right: 16, bottom: 16, left: 16 },
  }));

  const progressConfig = createMemo<ChartOptions<Record<string, number>>>(() => ({
    group,
    theme: cohortTheme,
    x: 'step', axes: { x: { type: 'linear', title: 'Training step', roundBounds: true }, y: { type: 'linear', title: 'Accuracy', min: 50, max: 100, format: (v) => `${v}%` } },
    series: comparisonSeries(selectedRuns()),
    highlight: { dimOpacity: 0.12 },
    tooltip: { mode: 'index', yFormat: (v) => `${Number(v).toFixed(2)}%` },
    padding: { top: 16, right: 18, bottom: 50, left: 58 },
  }));
  const comparisonConfig = createMemo<ChartOptions<Record<string, number>>>(() => ({
    group,
    theme: cohortTheme,
    x: 'metric', axes: { x: { type: 'linear', ticks: [0, 1, 2], format: (v) => comparisonMetrics[Number(v)] ?? '', grid: false }, y: { type: 'linear', min: 0, max: 100, format: (v) => `${v}` } },
    series: comparisonSeries(selectedRuns()).map((series) => ({ ...series, type: 'bar' as const, barWidthRatio: 0.76 })),
    highlight: { dimOpacity: 0.12 },
    tooltip: { mode: 'index', yFormat: (v) => `${Number(v).toFixed(1)} score` },
    padding: { top: 16, right: 18, bottom: 38, left: 44 },
  }));

  const clearFilters = () => { setFamily('All families'); setTeam('All teams'); setStatus('All statuses'); setDays('30'); };

  return (
    <DogfoodShell active="cohortlab" product="CohortLab" eyebrow="Experiment intelligence">
      <div class="cohort-page">
        <section class="df-hero cohort-hero">
          <div><p class="df-kicker">Model registry / July sweep</p><h1>Find the efficient frontier.</h1><p>Compare quality, speed, and cost across every training run.</p></div>
          <div class="cohort-registry-status"><i />24k runs indexed</div>
        </section>

        <section class="cohort-filters" aria-label="Experiment filters">
          <Filter label="Family" value={family()} options={['All families', ...families]} onChange={setFamily} />
          <Filter label="Team" value={team()} options={['All teams', 'Core', 'Vision', 'Applied']} onChange={setTeam} />
          <Filter label="Status" value={status()} options={['All statuses', 'ready', 'training', 'failed', ['archived', 'Archived (empty state)']]} onChange={setStatus} />
          <Filter label="Date window" value={days()} options={[['30', 'Last 30 days'], ['14', 'Last 14 days'], ['7', 'Last 7 days']]} onChange={setDays} />
          <button type="button" class="filter-clear" onClick={clearFilters}>Reset filters</button>
        </section>

        <section class="df-metrics cohort-metrics">
          <Metric label="Visible runs" value={filtered().length.toLocaleString()} delta={`${((filtered().length / allRuns.length) * 100).toFixed(0)}% of registry`} />
          <Metric label="Best accuracy" value={bestRun() ? `${(bestRun()!.accuracy * 100).toFixed(2)}%` : '—'} delta={bestRun()?.name ?? 'No matching run'} tone={bestRun() ? 'good' : undefined} />
          <Metric label="Median latency" value={filtered().length ? `${median(filtered().map((r) => r.latency)).toFixed(0)} ms` : '—'} delta="p50 inference" />
          <Metric label="Selected" value={`${selectedRuns().length}`} delta={selectedCount() ? `${selectedCount()} in last box` : 'Hover cards to link'} />
        </section>

        <div class="cohort-layout">
          <section class="cohort-workspace">
            <ChartCard class="cohort-scatter-card" title="Quality vs latency" subtitle={`Colour: ${colorMode() === 'family' ? 'model family' : 'cost per 1K'} · Size: parameter count`} meta={<div class="cohort-chart-controls"><Segmented label="Scatter colour encoding" value={colorMode()} options={colorOptions} onChange={setColorMode} /><Segmented label="Scatter render mode" value={density()} options={densityOptions} onChange={setDensity} /></div>}>
              <Show when={filtered().length > 0} fallback={<EmptyState title="No experiments match" detail="Broaden the filters to return runs to the workspace." />}>
                <div class="df-chart cohort-scatter"><Chart {...scatterConfig()} data={filtered()} /></div>
                <p class="chart-instruction">Drag a box to select runs · Shift-drag to pan · Wheel to zoom at the cursor</p>
              </Show>
            </ChartCard>

            <div class="cohort-two-up">
              <ChartCard title="Accuracy distribution" subtitle="Visible runs"><div class="df-chart df-chart-sm"><Chart {...{ theme: cohortTheme, axes: { x: { type: 'linear', format: (v) => `${Number(v).toFixed(1)}%` }, y: { type: 'linear' } }, series: [{ id: 'accuracy-distribution', label: 'Runs', type: 'histogram', data: metricHistogram(filtered(), 'accuracy'), fill: '#625bf6' }], tooltip: { mode: 'x' }, padding: { top: 12, right: 14, bottom: 36, left: 40 } }} /></div></ChartCard>
              <ChartCard title="Latency distribution" subtitle="Long tail included"><div class="df-chart df-chart-sm"><Chart {...{ theme: cohortTheme, axes: { x: { type: 'linear', format: (v) => `${Number(v).toFixed(0)}ms` }, y: { type: 'linear' } }, series: [{ id: 'latency-distribution', label: 'Runs', type: 'histogram', data: metricHistogram(filtered(), 'latency'), fill: '#18a879' }], tooltip: { mode: 'x' }, padding: { top: 12, right: 14, bottom: 36, left: 40 } }} /></div></ChartCard>
            </div>

            <ChartCard title="Training trajectories" subtitle="Stable-key highlight sync across reordered charts" meta="80 checkpoints">
              <div class="df-chart df-chart-md"><Chart {...progressConfig()} data={progressColumns(selectedRuns())} onReady={setProgressChart} /></div>
            </ChartCard>
          </section>

          <aside class="cohort-sidebar">
            <ChartCard title="Comparison set" subtitle="Hover a run to focus every linked chart">
              <div class="run-list"><For each={selectedRuns()}>{(run, index) => <button type="button" data-highlighted={progressState()?.highlightedSeries === String(run.id) ? 'true' : undefined} onPointerEnter={() => group.setHighlight(String(run.id))} onPointerLeave={() => group.setHighlight(null)} onFocus={() => group.setHighlight(String(run.id))} onBlur={() => group.setHighlight(null)} onClick={() => setSelectedIds((ids) => ids.filter((id) => id !== run.id))}><span class={`run-swatch run-${index()}`} /><span><strong>{run.name}</strong><small>{run.family} · {run.team}</small></span><b>{(run.accuracy * 100).toFixed(2)}%</b></button>}</For></div>
              <Show when={selectedRuns().length === 0}><EmptyState title="No runs selected" detail="Box-select points in the scatter plot to compare them." /></Show>
              <p class="comparison-note">Box-select the scatter or choose a ranked run below. The same ordered set drives this list, Training trajectories, and the scorecard.</p>
            </ChartCard>
            <ChartCard title="Normalized scorecard" subtitle="Accuracy %, inverse latency, inverse cost · higher is better"><div class="df-chart df-chart-md"><Chart {...comparisonConfig()} data={comparisonColumns(selectedRuns())} /></div></ChartCard>
            <ChartCard title="Top visible runs" subtitle="Filter-aware ranking">
              <div class="cohort-table" role="table" aria-label="Top visible experiment runs"><div class="table-head"><span>Run</span><span>Accuracy</span><span>Latency</span></div><For each={topVisibleRuns()}>{(run) => <button type="button" onClick={() => setSelectedIds((ids) => [run.id, ...ids.filter((id) => id !== run.id)].slice(0, 4))}><span><b>{run.name}</b><small>{run.family}</small></span><span>{(run.accuracy * 100).toFixed(2)}%</span><span>{run.latency.toFixed(0)} ms</span></button>}</For></div>
            </ChartCard>
          </aside>
        </div>
      </div>
    </DogfoodShell>
  );
}

function Filter(props: { label: string; value: string; options: readonly (string | readonly [string, string])[]; onChange: (value: string) => void }) {
  return <label><span>{props.label}</span><select value={props.value} onChange={(e) => props.onChange(e.currentTarget.value)}>{props.options.map((option) => typeof option === 'string' ? <option>{option}</option> : <option value={option[0]}>{option[1]}</option>)}</select></label>;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
