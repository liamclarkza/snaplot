import { createSignal } from 'solid-js';
import CodeBlock from '../../../components/CodeBlock';
import DocsLink from '../DocsLink';
import { Section, Prose, Demo, LazyMount } from '../../../components/ui';
import { timeSeries, legendData } from '../fixtures';
import {
  DefaultLegendTableDemo,
  CustomColumnsDemo,
  CrossChartSyncDemo,
  SidepanelHighlightDemo,
  BenchmarkDemo,
  HeadlessSnapshotDemo,
} from '../../../components/LegendTableDemos';

export default function Plugins() {
  const [d_line] = createSignal(timeSeries(500, 3));
  const [d_legend] = createSignal(legendData());

  return (
    <>
      <Section id="reference-lines" title="Reference Lines">
        <Prose>
          The referenceLines option renders horizontal or vertical marker lines at fixed data values.
          Use it for thresholds, baselines, targets, or event markers. Lines respond to zoom/pan and
          scale changes. Labels are positioned automatically within the plot area.
        </Prose>
        <Demo title="Threshold and baseline markers" desc="Horizontal lines at y=75 (target) and y=40 (floor), with a dashed style"
          data={d_line()}
          code={`{
  axes: { x: { type: 'time' }, y: { type: 'linear' } },
  series: [
    { label: 'Metric A', y: 'value1', type: 'line', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Metric B', y: 'value2', type: 'line', interpolation: 'monotone', lineWidth: 1.5 },
  ],
  referenceLines: [
        { axis: 'y', value: 75, label: 'Target', color: '#e74c3c', dash: [6, 3], lineWidth: 1.5 },
        { axis: 'y', value: 40, label: 'Floor', color: '#888', lineWidth: 1 },
  ],
  tooltip: { show: true, mode: 'index' },
}`} />
        <Prose>
          Call <code>chart.update({'{ referenceLines: newLines }'})</code> to update annotations. Reference lines render above the data and below the cursor overlay. Use <code>referenceRegions</code> for shaded axis intervals.
        </Prose>
      </Section>

      <Section id="legend-plugin" title="Legend Plugin">
        <Prose>
          The built-in legend plugin creates a clickable legend above or below the chart. Click a series name to toggle its visibility. Long-press (or shift-click) to solo a series.
        </Prose>
        <CodeBlock code={`import { createLegendPlugin } from 'snaplot';

const config = {
  series: [ /* ... */ ],
  plugins: [createLegendPlugin({ position: 'bottom' })],
};`} />
        <div style={{ height: '12px' }} />
        <Demo title="Legend plugin" desc="Click a series name to toggle visibility"
          data={d_legend()}
          code={`{
  series: [
    { label: 'Alpha', y: 'value1', type: 'line', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Beta', y: 'value2', type: 'line', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Gamma', y: 'value3', type: 'line', interpolation: 'monotone', lineWidth: 2 },
  ],
  plugins: [createLegendPlugin({ position: 'bottom' })],
  tooltip: { show: true, mode: 'index' },
}`} />
      </Section>

      <Section id="legend-table" title="Legend Table">
        <Prose>
          A cursor-synchronised table that shows the value of every visible series at the cursor's X position, the common ML-dashboard pattern for comparing many runs. Available as a DOM plugin and as native React and Solid components:
        </Prose>
        <ul style={{ color: 'var(--text-secondary)', 'margin-bottom': '16px', 'font-size': '14.5px', 'line-height': '1.7', 'padding-left': '20px' }}>
          <li><code>createLegendTablePlugin()</code>, DOM-only, attaches to any chart.</li>
          <li><code>&lt;LegendTable&gt;</code>, React or Solid component with native JSX cells, typed source rows, and a render-prop escape hatch.</li>
        </ul>
        <Prose>
          Import column helpers from the same entrypoint as your component. Each framework returns native JSX; the DOM plugin helpers come from the root package. All versions preserve the same CSS classes. Zero configuration produces a sensible default:
        </Prose>
        <CodeBlock code={`import { LegendTable } from 'snaplot/solid';
import 'snaplot/legend-table.css';

<LegendTable chart={chart} />`} />
        <div style={{ height: '12px' }} />
        <LazyMount estHeight="340px"><DefaultLegendTableDemo /></LazyMount>

        <div style={{ height: '24px' }} />
        <Prose>
          <b>Custom columns</b> via the typed <code>meta</code> field on each series. Column helpers (<code>nameColumn</code>, <code>valueColumn</code>, <code>metricColumn</code>, <code>swatchColumn</code>, <code>column</code>) cover the common cases:
        </Prose>
        <CodeBlock code={`import { LegendTable, nameColumn, valueColumn, column } from 'snaplot/solid';

const options = {
  x: 'step',
  series: runs.map(run => ({
    id: run.id, label: run.name, data: run.samples, y: 'accuracy',
    meta: { metricKey: 'eval/accuracy' },
  })),
};

<LegendTable chart={chart} columns={[
  nameColumn(),
  column({ key: 'action', header: 'Run',
    cell: (point, series, api) => (
      <button onClick={() => api.setHighlight(point.seriesId)}>{series.label}</button>
    ) }),
  valueColumn({ format: value => value.toFixed(6) }),
]} />`} />
        <div style={{ height: '12px' }} />
        <LazyMount estHeight="380px"><CustomColumnsDemo /></LazyMount>

        <div style={{ height: '24px' }} />
        <Prose>
          <b>Plain-DOM plugin</b> variant for non-Solid users, same defaults, same class names, edit live below:
        </Prose>
        <Demo
          title="Legend table plugin (live-editable)"
          desc="Renders Step + values in a table below the chart on hover; series-only fallback keeps the layout stable when the cursor leaves."
          data={d_legend()}
          code={`{
  axes: { x: { rangePadding: 0 }, y: { rangePadding: 0.05 } },
  series: [
    { label: 'live-training', y: 'value1', type: 'line', interpolation: 'monotone', lineWidth: 2 },
    { label: 'failed-experiment', y: 'value2', type: 'line', interpolation: 'monotone', lineWidth: 2 },
    { label: 'baseline-resnet50', y: 'value3', type: 'line', interpolation: 'monotone', lineWidth: 2 },
  ],
  plugins: [
    createLegendTablePlugin({
      fallback: 'series-only',
      columns: [nameColumn(), valueColumn({ format: v => v.toFixed(4) })],
    }),
  ],
  tooltip: { show: false },
  cursor: { show: true, snap: true },
}`}
        />

        <div style={{ height: '24px' }} />
        <Prose>
          <b>Headless render-prop</b> mode keeps the cursor + highlight wiring but lets you render anything in place of the table, ideal when your app already has a table component:
        </Prose>
        <CodeBlock code={`<LegendTable chart={chart}>
  {(snapshot, highlight, setHighlight) => (
    <MyCustomTable
      data={snapshot()}
      highlightedRow={highlight()}
      onRowHover={setHighlight}
    />
  )}
</LegendTable>`} />
      </Section>

      <Section id="cross-chart-sync" title="Cross-chart Sync">
        <Prose>
          Pass a group directly to each chart. Cursor and stable-ID highlight synchronization are enabled by default. Opt into viewport synchronization when navigation should move together.
        </Prose>
        <CodeBlock code={`const group = createChartGroup({ viewport: true });

<Chart {...optionsA} data={a} group={group} />
<Chart {...optionsB} data={b} group={group} />

<button onMouseEnter={() => group.setHighlight('run-42')}
        onMouseLeave={() => group.setHighlight(null)}>
  Run #42
</button>`} />
        <div style={{ height: '12px' }} />
        <Prose>
          For stable series identity across charts (<code>series.id</code>), shared and linked Y domains with aligned gutters, see the{' '}
          <DocsLink slug="recipes" id="recipe-linked">Linked Charts recipe</DocsLink>.
        </Prose>
        <LazyMount estHeight="540px"><CrossChartSyncDemo /></LazyMount>

        <div style={{ height: '24px' }} />
        <Prose>
          Pair the group with an external "runs" panel, hover a run and every chart dims everything else:
        </Prose>
        <LazyMount estHeight="420px"><SidepanelHighlightDemo /></LazyMount>

        <div style={{ height: '24px' }} />
        <Prose>
          <b>Performance check</b>, many series + a value-cell update per cursor frame. State snapshots are cached and immutable. Framework subscriptions update when chart state changes; highlight redraws the data layer.
        </Prose>
        <LazyMount estHeight="420px"><BenchmarkDemo /></LazyMount>
      </Section>

      <Section id="cursor-snapshot" title="Cursor Snapshot (Headless)">
        <Prose>
          Both <code>&lt;LegendTable&gt;</code> and the plugin are built on the same primitive: <code>chart.getCursorSnapshot()</code>. Use it directly if you need cursor-synchronised data anywhere else in your UI.
        </Prose>
        <CodeBlock code={`import { createCursorSnapshot } from 'snaplot/solid';
// React: useCursorSnapshot(handle)
const snapshot = createCursorSnapshot(chart);
// snapshot()?.points contain seriesId, row, rowIndex, rowId,
// x, y, formattedX and formattedY.

createEffect(() => {
  group.setHighlight(snapshot()?.activeSeriesId ?? null);
});

// Plain JavaScript:
const unsubscribe = chart.on('cursor:change', snapshot => {
  renderReadout(snapshot.points);
});`} />
        <div style={{ height: '12px' }} />
        <LazyMount estHeight="360px"><HeadlessSnapshotDemo /></LazyMount>
      </Section>

      <Section id="custom-plugins" title="Custom Plugins">
        <Prose>
          Plugins implement the <code>ChartPlugin</code> interface. Subscribe to typed events during installation and release subscriptions during destruction. Draw hooks receive the public chart handle and the corresponding canvas context.
        </Prose>
        <CodeBlock code={`import type { ChartPlugin } from 'snaplot';

const plugin: ChartPlugin = {
  id: 'readout',
  install(chart) { /* subscribe or add application UI */ },
  destroy(chart) { /* remove subscriptions and application UI */ },
  beforeDraw(chart) { /* return false to skip painting */ },
  afterDrawGrid(chart, context) {},
  afterDrawData(chart, context) {},
  afterDrawOverlay(chart, context) {},
  onDataUpdate(chart) {},
  onOptionsUpdate(chart) {},
};`} />
        <div style={{ height: '16px' }} />
        <Prose>
          <b>Example:</b> a plugin reading the current cursor snapshot during overlay painting:
        </Prose>
        <CodeBlock code={`const readout = {
  id: 'readout',
  afterDrawOverlay(chart, context) {
    const point = chart.getCursorSnapshot().points[0];
    if (!point) return;
    const { plot } = chart.getLayout();
    context.save();
    context.fillStyle = chart.getTheme().textColor;
    context.fillText(point.formattedY, plot.left + 8, plot.top + 16);
    context.restore();
  },
};
// Usage: plugins: [readout]`} />
        <div style={{ height: '8px' }} />
        <Prose>
          Return <code>false</code> from <code>beforeDraw</code> to skip painting.
          The <DocsLink slug="recipes" id="recipe-custom-plugin">Custom Plugin recipe</DocsLink>{' '}
          has a live-editable plugin combining a cursor hook with an overlay hook.
        </Prose>
      </Section>
    </>
  );
}
