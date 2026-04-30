import { createSignal, onCleanup } from 'solid-js';
import type { ColumnarData, ChartInstance } from 'snaplot';
import CodeBlock from '../../../components/CodeBlock';
import { Section, Prose, Demo } from '../../../components/ui';
import {
  timeSeries,
  encodedScatterData,
  barData,
  histData,
  bandData,
  heatmapData,
} from '../fixtures';

export default function ChartTypes() {
  const [d_line] = createSignal(timeSeries(500, 3));
  const [d_area] = createSignal(timeSeries(300, 2));
  const [d_band] = createSignal(bandData());
  const [d_scatter] = createSignal(encodedScatterData(1200));
  const [d_heat] = createSignal(heatmapData(300_000));
  const [d_bar] = createSignal(barData());
  const [d_hist] = createSignal(histData());

  // Streaming line chart, appends a data point every second so the Line
  // demo is visibly alive when the reader scrolls past it.
  let lineChart: ChartInstance | undefined;
  const interval = setInterval(() => {
    if (!lineChart) return;
    const d = lineChart.getData(); const x = d[0]; if (x.length === 0) return;
    lineChart.appendData([
      new Float64Array([x[x.length - 1] + 60_000]),
      ...Array.from({ length: d.length - 1 }, (_, s) => new Float64Array([d[s + 1][x.length - 1] + (Math.random() - 0.5) * 10])),
    ] as ColumnarData);
  }, 1000);
  onCleanup(() => clearInterval(interval));

  return (
    <>
      <Section id="line" title="Line">
        <Prose>Streaming multi-series line chart with monotone cubic interpolation. This chart auto-appends a data point every second via <code>appendData()</code>.</Prose>
        <Demo title="Multi-series streaming line chart" desc="Try changing interpolation to 'linear' or 'step-after'"
          data={d_line()} onReady={(c) => { lineChart = c; }}
          code={`{
  streaming: { maxLen: 500 },
  axes: { x: { type: 'time' } },
  series: [
    { label: 'CPU %', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Memory %', dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Network', dataIndex: 3, type: 'line', interpolation: 'linear', lineWidth: 1.5 },
  ],
  tooltip: { show: true, mode: 'index' },
}`} />
      </Section>

      <Section id="area" title="Area">
        <Prose>Area charts fill from the line down to the baseline with a gradient: alpha 0.3 at the top fading to 0.05 at the bottom. Use <code>fillGradient</code> to define custom gradient colors.</Prose>
        <Demo title="Gradient area chart" data={d_area()}
          code={`{
  axes: { x: { type: 'time' } },
  series: [
    { label: 'Requests/s', dataIndex: 1, type: 'area', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Errors/s', dataIndex: 2, type: 'area', interpolation: 'monotone', lineWidth: 1.5 },
  ],
  tooltip: { show: true, mode: 'index' },
}`} />
      </Section>

      <Section id="band" title="Band (Fill Between)">
        <Prose>
          Use <code>type: 'band'</code> to render a confidence interval, error band, or min/max
          range as a single series. A band series combines three data columns into one visual unit:
          a filled region between <code>upperDataIndex</code> and <code>lowerDataIndex</code>,
          with a center line at <code>dataIndex</code>. The center line is what the tooltip
          and cursor snap to, the fill is purely decorative.
        </Prose>
        <Demo title="Mean line with ±σ confidence band" desc="One series, three columns: mean (1), upper (2), lower (3)"
          data={d_band()}
          code={`{
  axes: { x: { type: 'time' }, y: { type: 'linear' } },
  series: [
    { label: 'Loss', type: 'band', dataIndex: 1,
      upperDataIndex: 2, lowerDataIndex: 3,
      stroke: '#4f8fea', fill: '#4f8fea', opacity: 0.15,
      lineWidth: 2, interpolation: 'monotone' },
  ],
  tooltip: { show: true, mode: 'index' },
}`} />
      </Section>

      <Section id="scatter" title="Scatter">
        <Prose>
          Scatter plots use stamp-based rendering, a single point shape is pre-rendered to an offscreen canvas, then stamped at each data position. This makes scatter rendering scale to tens of thousands of points with minimal overhead.
          Tooltip mode <code>'nearest'</code> uses euclidean (pixel-space) distance to find the closest point, with a cached screen-space grid for dense clouds.
          For tabular datasets, set <code>xDataIndex</code> to use a column other than column 0 for X, then use <code>colorBy</code>, <code>sizeBy</code>, and <code>tooltipFields</code> for additional encodings.
        </Prose>
        <Demo title="Encoded cohort scatter (1.2K points)" desc="X/Y from tabular columns, colour by cohort, size by volume, score in the tooltip"
          data={d_scatter()}
          code={`{
  axes: { x: { padding: 0.08 }, y: { padding: 0.08 } },
  interaction: 'analytical',
  series: [{
    label: 'Users',
    type: 'scatter',
    xDataIndex: 1, // embedding X
    yDataIndex: 2, // embedding Y
    renderMode: 'points',
    pointShape: 'circle',
    opacity: 0.68,
    colorBy: {
      dataIndex: 3,
      type: 'category',
      label: 'Cohort',
      format: (value) => ['Core', 'Growth', 'Enterprise', 'Trial'][Math.round(value)] ?? 'Other',
    },
    sizeBy: {
      dataIndex: 4,
      range: [2, 6.5],
      scale: 'sqrt',
      label: 'Volume',
      format: (value) => \`\${Math.round(value)} events\`,
    },
    tooltipFields: [
      { dataIndex: 5, label: 'Score', format: (value) => value.toFixed(2) },
    ],
  }],
  zoom: { enabled: true, x: true, y: true },
  tooltip: { show: true, mode: 'nearest' },
}`} />
        <Prose>
          Scatter series can read from arbitrary data columns. Column indexes are absolute indexes into <code>ColumnarData</code>: column <code>0</code> is the default X column, while <code>xDataIndex</code>, <code>yDataIndex</code>, <code>colorBy.dataIndex</code>, <code>sizeBy.dataIndex</code>, and <code>tooltipFields[].dataIndex</code> all point at columns in the same array.
        </Prose>
        <CodeBlock code={`const data = [
  rowId,          // column 0: stable row identity / default X
  embeddingX,     // column 1: scatter X
  embeddingY,     // column 2: scatter Y
  cohort,         // column 3: category id
  volume,         // column 4: numeric size encoding
  score,          // column 5: extra tooltip field
];

const config = {
  axes: { x: { padding: 0.08 }, y: { padding: 0.08 } },
  interaction: 'analytical',
  series: [{
    label: 'Users',
    type: 'scatter',
    xDataIndex: 1,
    yDataIndex: 2,
    renderMode: 'points',
    pointShape: 'circle', // 'circle' | 'square' | 'diamond'
    opacity: 0.68,

    colorBy: {
      dataIndex: 3,
      type: 'category',   // 'auto' | 'category' | 'continuous' | 'diverging'
      label: 'Cohort',
      format: (value) => ['Core', 'Growth', 'Enterprise', 'Trial'][Math.round(value)] ?? 'Other',
    },

    sizeBy: {
      dataIndex: 4,
      range: [2, 6.5],    // radius range in CSS pixels
      scale: 'sqrt',      // 'linear' | 'sqrt'
      label: 'Volume',
      format: (value) => \`\${Math.round(value)} events\`,
    },

    tooltipFields: [
      { dataIndex: 5, label: 'Score', format: (value) => value.toFixed(2) },
    ],
  }],
  tooltip: { show: true, mode: 'nearest' },
  zoom: { enabled: true, x: true, y: true },
};`} />
        <div style={{
          'overflow-x': 'auto',
          'margin-bottom': '20px',
          border: '1px solid var(--border)',
          'border-radius': 'var(--radius-lg)',
        }}>
          <table style={{
            width: '100%',
            'border-collapse': 'collapse',
            'font-size': '13px',
            color: 'var(--text-secondary)',
          }}>
            <thead>
              <tr style={{ 'border-bottom': '1px solid var(--border)' }}>
                <th style={{ padding: '10px 12px', 'text-align': 'left', 'font-weight': '600', color: 'var(--text)' }}>Option</th>
                <th style={{ padding: '10px 12px', 'text-align': 'left', 'font-weight': '600', color: 'var(--text)' }}>Use</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['xDataIndex', 'Use a non-zero column for scatter X values. This is useful for tabular experiment data where column 0 is just row identity.'],
                ['yDataIndex', 'Use an explicit Y column for scatter values. Prefer this over dataIndex for scatter configs.'],
                ['renderMode', "'points' forces stamped points, 'density' forces aggregate heatmap rendering, and 'auto' switches to density above the large-point threshold."],
                ['pointShape', "Point shape for stamped scatter: 'circle', 'square', or 'diamond'."],
                ['colorBy', 'Colour points from another column. Low-cardinality integer columns work well as categories; numeric columns can use continuous or diverging ramps.'],
                ['sizeBy', 'Map a numeric column to point radius. Use sqrt scaling when the encoded value represents count, duration, or magnitude.'],
                ['tooltipFields', 'Add extra columns to the default nearest-point tooltip without writing a custom tooltip renderer.'],
                ['selection.onSelect', 'Box selections return ranges and selected scatter points when the drag spans both X and Y axes.'],
              ].map(([option, use]) => (
                <tr style={{ 'border-bottom': '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', 'font-family': 'var(--font-mono)', 'font-size': '12px', 'white-space': 'nowrap' }}>{option}</td>
                  <td style={{ padding: '8px 12px' }}>{use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Prose>
          Use <code>renderMode: 'density'</code> when the question is about distribution rather than individual runs. Density rendering aggregates points into bins, so cursor dots and nearest-point tooltips are usually less meaningful than they are for stamped point scatter.
        </Prose>
      </Section>

      <Section id="heatmap" title="Density Heatmap">
        <Prose>
          Set <code>renderMode: 'density'</code> on a scatter series for density rendering. Heatmaps use <code>theme.heatmapGradient</code>, then <code>theme.sequentialPalette</code>, and finally the built-in Viridis-style fallback. A series-level <code>heatmapGradient</code> overrides the theme for that one chart. Adjust <code>heatmapBinSize</code> for coarser or finer bins.
          Density heatmaps auto-trigger when a scatter series exceeds 200K points in <code>renderMode: 'auto'</code>. The legacy <code>heatmap: true</code> flag remains supported.
          Since density rendering represents aggregate bins rather than individual points, this demo disables cursor and tooltip overlays.
        </Prose>
        <Demo title="300K points, 4 gaussian clusters" data={d_heat()}
          code={`{
  series: [{ label: 'Density', yDataIndex: 1, type: 'scatter', renderMode: 'density', heatmapBinSize: 1 }],
  zoom: { enabled: true, x: true, y: true },
  cursor: { show: false },
  tooltip: { show: false },
}`} />
      </Section>

      <Section id="bar" title="Bar">
        <Prose>
          Grouped bars with automatic category width calculation. Multiple bar series at the same X value are grouped side by side.
          Hover over a bar to see it highlighted. Category padding is applied at chart edges so bars are never clipped.
        </Prose>
        <Demo title="Grouped bars" data={d_bar()}
          code={`{
  series: [
    { label: 'Revenue', dataIndex: 1, type: 'bar' },
    { label: 'Expenses', dataIndex: 2, type: 'bar' },
  ],
  tooltip: { show: true, mode: 'index' },
}`} />
      </Section>

      <Section id="histogram" title="Histogram">
        <Prose>
          Histograms display pre-computed bins. Use the <code>histogram()</code> utility to compute bins from raw data, then pass the result as chart data:
        </Prose>
        <CodeBlock code={`import { histogram } from 'snaplot';

const raw = new Float64Array(values);
const bins = histogram(raw, { method: 'freedman-diaconis' });
// bins.edges = Float64Array (N+1 values)
// bins.counts = Float64Array (N+1 values, last is padding 0)

const data: ColumnarData = [bins.edges, bins.counts];`} />
        <div style={{ height: '12px' }} />
        <Prose>Three bin methods: <code>freedman-diaconis</code> (IQR, robust to outliers), <code>sturges</code> (assumes normality), <code>scott</code> (std deviation).</Prose>
        <Demo title="Bimodal distribution (5K samples)"
          data={d_hist()}
          code={`{
  series: [{ label: 'Response Time', dataIndex: 1, type: 'histogram' }],
  tooltip: { show: true },
}`} />
      </Section>
    </>
  );
}
