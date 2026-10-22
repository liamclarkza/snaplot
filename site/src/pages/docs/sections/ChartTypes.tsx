import { createSignal, onCleanup } from 'solid-js';
import type { ChartHandle } from 'snaplot';
import CodeBlock from '../../../components/CodeBlock';
import DocsLink from '../DocsLink';
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
  let lineChart: ChartHandle | undefined;
  const last = Object.fromEntries(Object.entries(d_line().columns).map(([key, values]) => [key, values[values.length - 1]]));
  const interval = setInterval(() => {
    if (!lineChart) return;
    last.x += 60_000;
    for (const name of Object.keys(last)) if (name !== 'x') last[name] += (Math.random() - .5) * 10;
    lineChart.appendData({ columns: Object.fromEntries(Object.entries(last).map(([name, value]) => [name, new Float64Array([value])])) });
  }, 1000);
  onCleanup(() => clearInterval(interval));

  return (
    <>
      <Section id="line" title="Line">
        <Prose>Streaming multi-series line chart with monotone cubic interpolation. This chart auto-appends a data point every second via <code>appendData()</code>.</Prose>
        <Demo title="Multi-series streaming line chart" desc="Try changing interpolation to 'linear' or 'step-after'"
          data={d_line()} onReady={(c) => { lineChart = c; }}
          code={`{
  streaming: { maxPoints: 500 },
  axes: { x: { type: 'time' } },
  series: [
    { label: 'CPU %', y: 'value1', type: 'line', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Memory %', y: 'value2', type: 'line', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Network', y: 'value3', type: 'line', interpolation: 'linear', lineWidth: 1.5 },
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
    { label: 'Requests/s', y: 'value1', type: 'area', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Errors/s', y: 'value2', type: 'area', interpolation: 'monotone', lineWidth: 1.5 },
  ],
  tooltip: { show: true, mode: 'index' },
}`} />
      </Section>

      <Section id="band" title="Band (Fill Between)">
        <Prose>
          Use <code>type: 'band'</code> to render a confidence interval, error band, or min/max
          range as a single series. A band series combines three data columns into one visual unit:
          a filled region between <code>upper</code> and <code>lower</code>,
          with a center line at <code>y</code>. The center line is what the tooltip
          and cursor snap to, the fill is purely decorative.
        </Prose>
        <Demo title="Mean line with ±σ confidence band" desc="One series, three columns: mean (1), upper (2), lower (3)"
          data={d_band()}
          code={`{
  axes: { x: { type: 'time' }, y: { type: 'linear' } },
  series: [
    { label: 'Loss', type: 'band', y: 'value1',
      upper: 'value2', lower: 'value3',
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
          For tabular datasets, set <code>x</code> to select the X field independently from row identity, then use <code>colorBy</code>, <code>sizeBy</code>, and <code>tooltipFields</code> for additional encodings.
        </Prose>
        <Prose>
    For value-driven color and size encodings (<code>colorBy</code>, <code>sizeBy</code>), see the{' '}
    <DocsLink slug="recipes" id="recipe-scatter-encoding">Encoded Scatter recipe</DocsLink>.
  </Prose>
        <Demo title="Encoded cohort scatter (1.2K points)" desc="X/Y from tabular columns, colour by cohort, size by volume, score in the tooltip"
          data={d_scatter()}
          code={`{
  axes: { x: { rangePadding: 0.08 }, y: { rangePadding: 0.08 } },
  interaction: 'analytical',
  series: [{
    label: 'Users',
    type: 'scatter',
    x: 'value1', // embedding X
    y: 'value2', // embedding Y
    renderMode: 'points',
    pointShape: 'circle',
    opacity: 0.68,
    colorBy: {
      field: 'value3',
      type: 'category',
      label: 'Cohort',
      format: (value) => ['Core', 'Growth', 'Enterprise', 'Trial'][Math.round(value)] ?? 'Other',
    },
    sizeBy: {
      field: 'value4',
      range: [2, 6.5],
      scale: 'sqrt',
      label: 'Volume',
      format: (value) => \`\${Math.round(value)} events\`,
    },
    tooltipFields: [
      { field: 'value5', label: 'Score', format: (value) => value.toFixed(2) },
    ],
  }],
  zoom: { enabled: true, x: true, y: true },
  tooltip: { show: true, mode: 'nearest' },
}`} />
        <Prose>
          Scatter coordinates and encodings use named fields or accessors. A separate <code>rowId</code> identifies a point without imposing an order on its coordinates.
        </Prose>
        <CodeBlock code={`const data = { columns: {
  x: rowId, value1: embeddingX, value2: embeddingY,
  value3: cohort, value4: volume, value5: score,
} };

const config = {
  axes: { x: { rangePadding: 0.08 }, y: { rangePadding: 0.08 } },
  interaction: 'analytical',
  series: [{
    label: 'Users',
    type: 'scatter',
    x: 'value1',
    y: 'value2',
    renderMode: 'points',
    pointShape: 'circle', // 'circle' | 'square' | 'diamond'
    opacity: 0.68,

    colorBy: {
      field: 'value3',
      type: 'category',   // 'auto' | 'category' | 'continuous' | 'diverging'
      label: 'Cohort',
      format: (value) => ['Core', 'Growth', 'Enterprise', 'Trial'][Math.round(value)] ?? 'Other',
    },

    sizeBy: {
      field: 'value4',
      range: [2, 6.5],    // radius range in CSS pixels
      scale: 'sqrt',      // 'linear' | 'sqrt'
      label: 'Volume',
      format: (value) => \`\${Math.round(value)} events\`,
    },

    tooltipFields: [
      { field: 'value5', label: 'Score', format: (value) => value.toFixed(2) },
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
                ['x', 'Name the scatter X field independently from source-row identity.'],
                ['y', 'Name the scatter Y field or provide an accessor.'],
                ['renderMode', "'points' forces stamped points, 'density' forces aggregate heatmap rendering, and 'auto' switches to density above the large-point threshold."],
                ['pointShape', "Point shape for stamped scatter: 'circle', 'square', or 'diamond'."],
                ['colorBy', 'Colour points from another column. Low-cardinality integer columns work well as categories; numeric columns can use continuous or diverging ramps.'],
                ['sizeBy', 'Map a numeric column to point radius. Use sqrt scaling when the encoded value represents count, duration, or magnitude.'],
                ['tooltipFields', 'Add extra columns to the default nearest-point tooltip without writing a custom tooltip renderer.'],
                ['onSelect', 'Box selections return ranges and selected scatter points when the drag spans both X and Y axes.'],
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
          Density heatmaps auto-trigger when a scatter series exceeds 200K points in <code>renderMode: 'auto'</code>.
          Since density rendering represents aggregate bins rather than individual points, this demo disables cursor and tooltip overlays.
        </Prose>
        <Demo title="300K points, 4 gaussian clusters" data={d_heat()}
          code={`{
  series: [{ label: 'Density', y: 'value1', type: 'scatter', renderMode: 'density', heatmapBinSize: 1 }],
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
    { label: 'Revenue', y: 'value1', type: 'bar' },
    { label: 'Expenses', y: 'value2', type: 'bar' },
  ],
  tooltip: { show: true, mode: 'index' },
}`} />
      </Section>

      <Section id="histogram" title="Histogram">
        <Prose>
          Histograms display pre-computed bins. Use the <code>histogram()</code> utility to compute bins from raw data, then pass the result directly to a histogram series:
        </Prose>
        <CodeBlock code={`import { histogram } from 'snaplot';

const raw = new Float64Array(values);
const bins = histogram(raw, { method: 'freedman-diaconis' });
// bins.edges = Float64Array (N+1 values)
// bins.counts = Float64Array (N values)

const options = { series: [{ id: 'distribution', type: 'histogram', data: bins }] };`} />
        <div style={{ height: '12px' }} />
        <Prose>Three bin methods: <code>freedman-diaconis</code> (IQR, robust to outliers), <code>sturges</code> (assumes normality), <code>scott</code> (std deviation).</Prose>
        <Demo title="Bimodal distribution (5K samples)"
          data={d_hist()}
          code={`{
  series: [{ id: 'distribution', label: 'Response Time', type: 'histogram', data }],
  tooltip: { show: true },
}`} />
      </Section>
    </>
  );
}
