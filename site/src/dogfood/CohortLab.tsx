import { createMemo, createSignal, For, Show } from 'solid-js';
import { lightTheme, type ChartConfig, type ChartInstance } from 'snaplot';
import { Chart, createChartGroup } from 'snaplot/solid';
import { ChartCard, DogfoodShell, EmptyState, Metric, Segmented } from './DogfoodShell';
import { comparisonColumns, comparisonMetrics, comparisonSeries, experimentColumns, experimentRuns, families, metricHistogram, progressColumns, runIdsAtRows, runsById, topRunsByAccuracy, type ExperimentRun } from './data';

type DensityMode = 'points' | 'density';
type ColorMode = 'family' | 'cost';
interface RunMeta { runId: number }

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
  const group = createChartGroup<RunMeta>();

  const filtered = createMemo(() => allRuns.filter((run) =>
    (family() === 'All families' || run.family === family()) &&
    (team() === 'All teams' || run.team === team()) &&
    (status() === 'All statuses' || run.status === status()) &&
    run.day < Number(days()),
  ));
  const selectedRuns = createMemo(() => runsById(allRuns, selectedIds()));
  const topVisibleRuns = createMemo(() => topRunsByAccuracy(filtered()));
  const bestRun = createMemo(() => filtered().reduce<ExperimentRun | undefined>((best, run) => !best || run.accuracy > best.accuracy ? run : best, undefined));

  const scatterConfig = createMemo<ChartConfig>(() => ({
    theme: cohortTheme,
    interaction: 'analytical',
    axes: {
      x: { type: 'log', label: 'Inference latency (ms)', tickFormat: (v) => `${v} ms`, nice: true },
      y: { type: 'linear', label: 'Validation accuracy', tickFormat: (v) => `${v.toFixed(0)}%`, nice: true },
    },
    series: [{
      label: 'Experiment runs', type: 'scatter', xDataIndex: 1, yDataIndex: 2,
      colorBy: colorMode() === 'family'
        ? { dataIndex: 3, type: 'category', label: 'Family', format: (v) => families[Math.round(v)] ?? 'Unknown' }
        : { dataIndex: 5, type: 'continuous', domain: [0, 2.4], palette: ['#36a98f', '#f2bb52', '#d85a6a'], label: 'Cost / 1K', format: (v) => `$${v.toFixed(2)}` },
      sizeBy: { dataIndex: 4, range: [2.4, 8], scale: 'sqrt', label: 'Parameters', format: (v) => `${v.toFixed(0)}M` },
      tooltipFields: [{ dataIndex: 5, label: 'Cost / 1K', format: (v) => `$${v.toFixed(2)}` }],
      renderMode: density(), opacity: 0.68,
    }],
    selection: { onSelect: (selection) => {
      const points = selection.points ?? [];
      setSelectedCount(points.length);
      if (points.length > 0) {
        const ids = runIdsAtRows(filtered(), points.map(point => point.dataIndex));
        if (ids.length) setSelectedIds(ids);
      }
    } },
    zoom: { enabled: true, x: true, y: true, bounds: 'data' },
    pan: { enabled: true, x: true, y: true },
    touch: { drag: 'pan', selectionGesture: 'double-tap-drag' },
    tooltip: { show: true, mode: 'nearest', yFormat: (v) => `${v.toFixed(2)}%` },
    cursor: { show: true, xLine: true, yLine: true },
    padding: { top: 16, right: 16, bottom: 16, left: 16 },
  }));

  const progressConfig = createMemo<ChartConfig<RunMeta>>(() => group.apply({
    theme: cohortTheme,
    axes: { x: { type: 'linear', label: 'Training step', nice: true }, y: { type: 'linear', label: 'Accuracy', min: 50, max: 100, tickFormat: (v) => `${v}%` } },
    series: comparisonSeries(selectedRuns()),
    highlight: { dimOpacity: 0.12, getKey: (series) => series.meta?.runId },
    tooltip: { mode: 'index', yFormat: (v) => `${v.toFixed(2)}%` },
    padding: { top: 16, right: 18, bottom: 50, left: 58 },
  }));
  const comparisonConfig = createMemo<ChartConfig<RunMeta>>(() => group.apply({
    theme: cohortTheme,
    axes: { x: { type: 'linear', ticks: [0, 1, 2], tickFormat: (v) => comparisonMetrics[v] ?? '', grid: false }, y: { type: 'linear', min: 0, max: 100, tickFormat: (v) => `${v}` } },
    series: comparisonSeries(selectedRuns()).map((series) => ({ ...series, type: 'bar' as const, barWidthRatio: 0.76 })),
    highlight: { dimOpacity: 0.12, getKey: (series) => series.meta?.runId },
    tooltip: { mode: 'index', yFormat: (v) => `${v.toFixed(1)} score` },
    padding: { top: 16, right: 18, bottom: 38, left: 44 },
  }));

  const registerLinked = (chart: ChartInstance) => group.link(chart, { yDomain: false, gutters: false });
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
                <div class="df-chart cohort-scatter"><Chart config={scatterConfig()} data={experimentColumns(filtered())} /></div>
                <p class="chart-instruction">Drag a box to select runs · Shift-drag to pan · Wheel to zoom at the cursor</p>
              </Show>
            </ChartCard>

            <div class="cohort-two-up">
              <ChartCard title="Accuracy distribution" subtitle="Visible runs"><div class="df-chart df-chart-sm"><Chart config={{ theme: cohortTheme, axes: { x: { type: 'linear', tickFormat: (v) => `${v.toFixed(1)}%` }, y: { type: 'linear' } }, series: [{ label: 'Runs', type: 'histogram', dataIndex: 1, fill: '#625bf6' }], tooltip: { mode: 'x' }, padding: { top: 12, right: 14, bottom: 36, left: 40 } }} data={metricHistogram(filtered(), 'accuracy')} /></div></ChartCard>
              <ChartCard title="Latency distribution" subtitle="Long tail included"><div class="df-chart df-chart-sm"><Chart config={{ theme: cohortTheme, axes: { x: { type: 'linear', tickFormat: (v) => `${v.toFixed(0)}ms` }, y: { type: 'linear' } }, series: [{ label: 'Runs', type: 'histogram', dataIndex: 1, fill: '#18a879' }], tooltip: { mode: 'x' }, padding: { top: 12, right: 14, bottom: 36, left: 40 } }} data={metricHistogram(filtered(), 'latency')} /></div></ChartCard>
            </div>

            <ChartCard title="Training trajectories" subtitle="Stable-key highlight sync across reordered charts" meta="80 checkpoints">
              <div class="df-chart df-chart-md"><Chart config={progressConfig()} data={progressColumns(selectedRuns())} onReady={registerLinked} /></div>
            </ChartCard>
          </section>

          <aside class="cohort-sidebar">
            <ChartCard title="Comparison set" subtitle="Hover a run to focus every linked chart">
              <div class="run-list"><For each={selectedRuns()}>{(run, index) => <button type="button" data-highlighted={group.highlightedKey() === run.id ? 'true' : undefined} onPointerEnter={() => group.highlightKey(run.id)} onPointerLeave={() => group.highlightKey(null)} onFocus={() => group.highlightKey(run.id)} onBlur={() => group.highlightKey(null)} onClick={() => setSelectedIds((ids) => ids.filter((id) => id !== run.id))}><span class={`run-swatch run-${index()}`} /><span><strong>{run.name}</strong><small>{run.family} · {run.team}</small></span><b>{(run.accuracy * 100).toFixed(2)}%</b></button>}</For></div>
              <Show when={selectedRuns().length === 0}><EmptyState title="No runs selected" detail="Box-select points in the scatter plot to compare them." /></Show>
              <p class="comparison-note">Box-select the scatter or choose a ranked run below. The same ordered set drives this list, Training trajectories, and the scorecard.</p>
            </ChartCard>
            <ChartCard title="Normalized scorecard" subtitle="Accuracy %, inverse latency, inverse cost · higher is better"><div class="df-chart df-chart-md"><Chart config={comparisonConfig()} data={comparisonColumns(selectedRuns())} onReady={registerLinked} /></div></ChartCard>
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
