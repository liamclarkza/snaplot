import { createSignal } from 'solid-js';
import CodeBlock from '../../../components/CodeBlock';
import { Section, Prose, Demo } from '../../../components/ui';
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
          The reference lines plugin renders horizontal or vertical marker lines at fixed data values.
          Use it for thresholds, baselines, targets, or event markers. Lines respond to zoom/pan and
          scale changes. Labels are positioned automatically within the plot area.
        </Prose>
        <Demo title="Threshold and baseline markers" desc="Horizontal lines at y=75 (target) and y=40 (floor), with a dashed style"
          data={d_line()}
          code={`{
  axes: { x: { type: 'time' }, y: { type: 'linear' } },
  series: [
    { label: 'Metric A', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Metric B', dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 1.5 },
  ],
  plugins: [
    createReferenceLinesPlugin({
      lines: [
        { axis: 'y', value: 75, label: 'Target', color: '#e74c3c', dash: [6, 3], lineWidth: 1.5 },
        { axis: 'y', value: 40, label: 'Floor', color: '#888', lineWidth: 1 },
      ],
    }),
  ],
  tooltip: { show: true, mode: 'index' },
}`} />
        <Prose>
          Call <code>refLines.setLines(newLines)</code> to update lines dynamically after creation.
          The plugin renders in the <code>afterDrawData</code> hook, above series data but below
          the overlay (crosshair, selection box).
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
    { label: 'Alpha', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Beta', dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Gamma', dataIndex: 3, type: 'line', interpolation: 'monotone', lineWidth: 2 },
  ],
  plugins: [createLegendPlugin({ position: 'bottom' })],
  tooltip: { show: true, mode: 'index' },
}`} />
      </Section>

      <Section id="legend-table" title="Legend Table">
        <Prose>
          A cursor-synchronised table that shows the value of every visible series at the cursor's X position, the common ML-dashboard pattern for comparing many runs. Available in two forms with feature parity:
        </Prose>
        <ul style={{ color: 'var(--text-secondary)', 'margin-bottom': '16px', 'font-size': '14.5px', 'line-height': '1.7', 'padding-left': '20px' }}>
          <li><code>createLegendTablePlugin()</code>, DOM-only, attaches to any chart.</li>
          <li><code>&lt;LegendTable&gt;</code>, SolidJS component with JSX cells, typed <code>meta</code>, and a render-prop escape hatch.</li>
        </ul>
        <Prose>
          Both share the same column helpers and the same CSS class names. Zero configuration produces a sensible default:
        </Prose>
        <CodeBlock code={`import { LegendTable } from 'snaplot';
import 'snaplot/legend-table.css';

<LegendTable chart={chart} />`} />
        <div style={{ height: '12px' }} />
        <DefaultLegendTableDemo />

        <div style={{ height: '24px' }} />
        <Prose>
          <b>Custom columns</b> via the typed <code>meta</code> field on each series. Column helpers (<code>nameColumn</code>, <code>valueColumn</code>, <code>metricColumn</code>, <code>swatchColumn</code>, <code>column</code>) cover the common cases:
        </Prose>
        <CodeBlock code={`type RunMeta = { runId: string; metricKey: string; epoch: number };

const config: ChartConfig<RunMeta> = {
  series: runs.map(r => ({
    label: r.name,
    dataIndex: r.idx,
    type: 'line',
    meta: { runId: r.id, metricKey: 'eval/accuracy', epoch: r.epoch },
  })),
};

<LegendTable<RunMeta>
  chart={chart}
  columns={[
    swatchColumn(),
    nameColumn({ swatch: false }),
    metricColumn(p => p.meta.metricKey),  // p.meta is RunMeta, fully typed
    column({ key: 'epoch', header: 'Epoch', align: 'right',
             cell: p => String(p.meta.epoch) }),
    valueColumn({ format: v => v.toFixed(6) }),
  ]}
/>`} />
        <div style={{ height: '12px' }} />
        <CustomColumnsDemo />

        <div style={{ height: '24px' }} />
        <Prose>
          <b>Plain-DOM plugin</b> variant for non-Solid users, same defaults, same class names, edit live below:
        </Prose>
        <Demo
          title="Legend table plugin (live-editable)"
          desc="Renders Step + values in a table below the chart on hover; series-only fallback keeps the layout stable when the cursor leaves."
          data={d_legend()}
          code={`{
  // nice: false keeps the X axis tight to the data extent.
  axes: { x: { nice: false }, y: { padding: 0.05 } },
  series: [
    { label: 'live-training', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2 },
    { label: 'failed-experiment', dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 2 },
    { label: 'baseline-resnet50', dataIndex: 3, type: 'line', interpolation: 'monotone', lineWidth: 2 },
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
          <code>createChartGroup()</code> mints a fresh sync key and exposes <code>group.bind()</code> or <code>group.apply(config)</code> to spread into each chart's config. Cursor position, series highlight, and zoom/pan viewport all propagate automatically across every chart in the group. Zooming one chart zooms all peers to the same X range; double-click reset propagates too.
        </Prose>
        <CodeBlock code={`const group = createChartGroup();

// group.apply(config) merges the sync keys into cursor/highlight
// without clobbering your own cursor config (show, snap, indicators…).
<Chart config={group.apply(myConfigA)} data={a} />
<Chart config={group.apply(myConfigB)} data={b} />

// External controls (e.g. a sidepanel):
<button onMouseEnter={() => group.highlight(2)}
        onMouseLeave={() => group.highlight(null)}>
  Run #2
</button>`} />
        <div style={{ height: '12px' }} />
        <CrossChartSyncDemo />

        <div style={{ height: '24px' }} />
        <Prose>
          Pair the group with an external "runs" panel, hover a run and every chart dims everything else:
        </Prose>
        <SidepanelHighlightDemo />

        <div style={{ height: '24px' }} />
        <Prose>
          <b>Performance check</b>, many series + a value-cell update per cursor frame. The legend table reuses row DOM (text-content swaps only on cursor moves), highlight redraws only the data canvas, and the snapshot is read into a single reused buffer.
        </Prose>
        <BenchmarkDemo />
      </Section>

      <Section id="cursor-snapshot" title="Cursor Snapshot (Headless)">
        <Prose>
          Both <code>&lt;LegendTable&gt;</code> and the plugin are built on the same primitive: <code>chart.getCursorSnapshot()</code>. Use it directly if you need cursor-synchronised data anywhere else in your UI.
        </Prose>
        <CodeBlock code={`import { createCursorSnapshot } from 'snaplot';

const snapshot = createCursorSnapshot(chart);
// Accessor<CursorSnapshot | null>:
//   {
//     source: 'cursor' | 'latest' | 'first' | 'none',
//     dataIndex, dataX, formattedX,
//     activeSeriesIndex,  // series nearest the cursor in pixel space
//     points: [{ seriesIndex, label, color, value, formattedValue, meta }]
//   }

// Focus the line under the cursor in every chart in a group:
createEffect(() => {
  const s = snapshot();
  group.highlight(s?.activeSeriesIndex ?? null);
});

// Imperative, zero-alloc variant for hot paths:
const buf = chart.getCursorSnapshot();
chart.on('cursor:move', () => {
  chart.getCursorSnapshotInto(buf, { fallback: 'latest' });
  // mutate the same buf each frame
});`} />
        <div style={{ height: '12px' }} />
        <HeadlessSnapshotDemo />
      </Section>

      <Section id="custom-plugins" title="Custom Plugins">
        <Prose>
          Plugins hook into the chart lifecycle. Implement any subset of hooks on the <code>Plugin</code> interface:
        </Prose>
        <CodeBlock code={`interface Plugin {
  id: string;

  // Lifecycle
  install?(chart: ChartInstance): void;
  destroy?(chart: ChartInstance): void;

  // Layout
  beforeLayout?(chart: ChartInstance): void;
  afterLayout?(chart: ChartInstance, layout: Layout): void;

  // Grid layer (axes, gridlines)
  beforeDrawGrid?(chart: ChartInstance, ctx: CanvasRenderingContext2D): boolean | void;
  afterDrawGrid?(chart: ChartInstance, ctx: CanvasRenderingContext2D): void;

  // Data layer (series marks)
  beforeDrawData?(chart: ChartInstance, ctx: CanvasRenderingContext2D): boolean | void;
  afterDrawData?(chart: ChartInstance, ctx: CanvasRenderingContext2D): void;

  // Overlay layer (crosshair, selection)
  beforeDrawOverlay?(chart: ChartInstance, ctx: CanvasRenderingContext2D): boolean | void;
  afterDrawOverlay?(chart: ChartInstance, ctx: CanvasRenderingContext2D): void;

  // Events
  onCursorMove?(chart: ChartInstance, dataX: number | null, dataIdx: number | null): void;
  onZoom?(chart: ChartInstance, scaleKey: string, range: ScaleRange): void;
  onClick?(chart: ChartInstance, dataX: number, dataIdx: number): void;
  onSetData?(chart: ChartInstance, data: ColumnarData): void;
}`} />
        <div style={{ height: '16px' }} />
        <Prose>
          <b>Example:</b> an annotation plugin that draws a horizontal threshold line on the data layer:
        </Prose>
        <CodeBlock code={`const thresholdPlugin = (yValue: number, color = '#e74c3c'): Plugin => ({
  id: 'threshold',
  afterDrawData(chart, ctx) {
    const layout = chart.getLayout();
    const yScale = chart.getAxis('y');
    if (!yScale) return;
    const py = yScale.dataToPixel(yValue);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(layout.plot.left, py);
    ctx.lineTo(layout.plot.left + layout.plot.width, py);
    ctx.stroke();
    ctx.restore();
  },
});

// Usage:
plugins: [thresholdPlugin(75, '#e74c3c')]`} />
        <div style={{ height: '8px' }} />
        <Prose>
          Return <code>true</code> from any <code>before*</code> hook to skip the default rendering for that layer, giving you full control over what gets drawn.
        </Prose>
      </Section>
    </>
  );
}
