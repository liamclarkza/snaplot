import { createSignal, onCleanup } from 'solid-js';
import type { ColumnarData, ChartInstance } from 'snaplot';
import CodeBlock from '../../../components/CodeBlock';
import { Section, Prose, Demo } from '../../../components/ui';
import {
  timeSeries,
  scatterData,
  barData,
  histData,
  bandData,
  heatmapData,
} from '../fixtures';

export default function ChartTypes() {
  const [d_line] = createSignal(timeSeries(500, 3));
  const [d_area] = createSignal(timeSeries(300, 2));
  const [d_band] = createSignal(bandData());
  const [d_scatter] = createSignal(scatterData(2000));
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
          Tooltip mode <code>'nearest'</code> uses euclidean (pixel-space) distance to find the closest point.
        </Prose>
        <Demo title="Clustered scatter (2K points)" data={d_scatter()}
          code={`{
  series: [{ label: 'Latency vs Load', dataIndex: 1, type: 'scatter', pointRadius: 3 }],
  zoom: { enabled: true, x: true, y: true },
  tooltip: { show: true, mode: 'nearest' },
}`} />
      </Section>

      <Section id="heatmap" title="Density Heatmap">
        <Prose>
          Set <code>heatmap: true</code> on a scatter series for Viridis colormap density rendering. Adjust <code>heatmapBinSize</code> for coarser or finer bins.
          Density heatmaps auto-trigger when a scatter series exceeds 200K points, but you can opt in at any count with <code>heatmap: true</code>.
        </Prose>
        <Demo title="300K points, 4 gaussian clusters" data={d_heat()}
          code={`{
  series: [{ label: 'Density', dataIndex: 1, type: 'scatter', heatmap: true, heatmapBinSize: 1 }],
  zoom: { enabled: true, x: true, y: true },
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
