import { createSignal, onCleanup } from 'solid-js';
import { lttb, m4, createLegendPlugin } from 'snaplot';
import type { ColumnarData, ChartInstance } from 'snaplot';
import CodeBlock from '../components/CodeBlock';
import { Section, Prose, Demo } from '../components/ui';
import {
  DefaultLegendTableDemo,
  CustomColumnsDemo,
  CrossChartSyncDemo,
  SidepanelHighlightDemo,
  BenchmarkDemo,
  HeadlessSnapshotDemo,
} from '../components/LegendTableDemos';
import { Sidebar, scrollTo } from './docs/Sidebar';
import {
  timeSeries,
  scatterData,
  barData,
  histData,
  bandData,
  interpData,
  logData,
  gappedData,
  dualAxisData,
  heatmapData,
  largeTimeSeries,
  linearData,
  timeScaleData,
  stylingData,
  legendData,
} from './docs/fixtures';
// In dev/build the site aliases `snaplot` → src/index.ts, so we import the CSS
// directly from the package source. Published consumers use `'snaplot/legend-table.css'`.
import '../../../packages/snaplot/src/styles/legendTable.css';

// ─── Page ───────────────────────────────────────────────────────

export default function Docs() {
  // Data signals
  const [d_line] = createSignal(timeSeries(500, 3));
  const [d_area] = createSignal(timeSeries(300, 2));
  const [d_scatter] = createSignal(scatterData(2000));
  const [d_bar] = createSignal(barData());
  const [d_hist] = createSignal(histData());
  const [d_interp] = createSignal(interpData());
  const [d_log] = createSignal(logData());
  const [d_gap] = createSignal(gappedData());
  const [d_dual] = createSignal(dualAxisData());
  const [d_heat] = createSignal(heatmapData(300_000));
  const [d_theme] = createSignal(timeSeries(200, 2));
  const [d_linear] = createSignal(linearData());
  const [d_time] = createSignal(timeScaleData());
  const [d_band] = createSignal(bandData());
  const [d_styling] = createSignal(stylingData());
  const [d_dash] = createSignal(timeSeries(300, 3));
  const [d_legend] = createSignal(legendData());
  const [d_interaction] = createSignal(timeSeries(400, 2));
  const [d_zoom] = createSignal(timeSeries(500, 2));
  const [d_pan] = createSignal(timeSeries(800, 2));
  const [d_cursor] = createSignal(timeSeries(300, 2));
  const [d_tooltip_mode] = createSignal(timeSeries(200, 3));
  const [d_tooltip_custom] = createSignal(timeSeries(200, 2));
  const [d_tooltip_snap] = createSignal(scatterData(500));
  const [d_css_vars] = createSignal(timeSeries(200, 2));
  const [d_quickstart] = createSignal(timeSeries(100, 1));

  // LTTB downsampled data
  const lttbOrig = largeTimeSeries(25_000);
  const [lttbDx, lttbDy] = lttb(lttbOrig[0], lttbOrig[1], 500);
  const [d_lttb] = createSignal<ColumnarData>([lttbDx, lttbDy]);

  // M4 downsampled data
  const m4Orig = largeTimeSeries(25_000);
  const [m4Dx, m4Dy] = m4(m4Orig[0], m4Orig[1], 600, m4Orig[0][0], m4Orig[0][m4Orig[0].length - 1]);
  const [d_m4] = createSignal<ColumnarData>([m4Dx, m4Dy]);

  // Streaming line chart
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
    <div style={{ display: 'flex', 'max-width': 'var(--max-width)', margin: '0 auto', padding: '48px 24px 80px', gap: '48px' }}>
      <Sidebar />

      {/* Content */}
      <div style={{ flex: '1', 'min-width': '0' }}>
        <h1 style={{ 'font-size': '28px', 'font-weight': '700', 'margin-bottom': '8px' }}>Documentation</h1>
        <Prose>
          Every example below is <b>live and editable</b> — change the config and the chart updates instantly.
          Built-in theme variables are available in the editor: <code>darkTheme</code>, <code>lightTheme</code>, <code>oceanTheme</code>, <code>midnightTheme</code>, <code>refinedDarkTheme</code>.
        </Prose>

        {/* ═══════════════════════════════════════════════════════
            GETTING STARTED
            ═══════════════════════════════════════════════════════ */}

        <Section id="install" title="Installation">
          <CodeBlock code="npm install snaplot" />
          <div style={{ height: '12px' }} />
          <Prose>Zero runtime dependencies. Requires <code>solid-js ^1.9.0</code> as a peer dependency.</Prose>
          <CodeBlock code={`import { Chart } from 'snaplot';
import type { ColumnarData, ChartConfig } from 'snaplot';`} />
        </Section>

        <Section id="quick-start" title="Quick Start">
          <Prose>A minimal working chart: create columnar data, define a config, and render with <code>&lt;Chart&gt;</code>.</Prose>
          <CodeBlock code={`import { Chart } from 'snaplot';
import type { ColumnarData, ChartConfig } from 'snaplot';

const data: ColumnarData = [
  new Float64Array(timestamps),  // X values (sorted)
  new Float64Array(values),      // Y series 1
];

const config: ChartConfig = {
  series: [
    { label: 'Metric', dataIndex: 1, type: 'line' },
  ],
};

<Chart config={config} data={data} />`} />
          <div style={{ height: '16px' }} />
          <Demo title="Live quick start" desc="A simple line chart — edit the config to experiment"
            data={d_quickstart()} height="240px"
            code={`{
  axes: { x: { type: 'time' }, y: { type: 'linear' } },
  series: [
    { label: 'Metric', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2 },
  ],
  tooltip: { show: true },
}`} />
        </Section>

        <Section id="data-model" title="Data Model">
          <Prose>
            snaplot uses a <b>columnar data format</b> built on <code>Float64Array</code>s. Index 0 is always the X axis (must be sorted ascending).
            Indices 1+ are Y series. All arrays must be the same length. <code>NaN</code> in any Y array creates a gap in that series.
          </Prose>
          <CodeBlock code={`// Columnar format: [x, y1, y2, ...]
const data: ColumnarData = [
  new Float64Array([1, 2, 3, 4, 5]),     // X values (sorted)
  new Float64Array([10, 20, NaN, 40, 50]), // Y series 1 (NaN = gap)
  new Float64Array([5, 15, 25, 35, 45]),   // Y series 2
];`} />
          <Prose>
            <b>Why typed arrays?</b> Float64Arrays are contiguous in memory, giving excellent cache locality.
            No boxing overhead, no GC pressure from per-point objects. Combined with binary search for O(log n) viewport culling and hit-testing, this enables smooth 60fps rendering even with hundreds of thousands of points.
          </Prose>
          <Prose>
            <b>Immutable contract:</b> the library never mutates your data arrays. It reads from them during render passes.
            When you want to update data, call <code>setData()</code> with new arrays or use <code>appendData()</code> for streaming.
          </Prose>
          <Prose>
            <b>Render pipeline:</b> data change or resize triggers scale recomputation and marks all 3 canvas layers dirty. Scale change (zoom) marks data + grid dirty. Pointer events only mark the overlay dirty. A single <code>requestAnimationFrame</code> fires per frame, redrawing only the dirty layers. This means cursor movement at 60fps only redraws one lightweight overlay canvas — the data canvas with 100K+ points remains untouched.
          </Prose>
        </Section>

        {/* ═══════════════════════════════════════════════════════
            CHART TYPES
            ═══════════════════════════════════════════════════════ */}

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
            and cursor snap to — the fill is purely decorative.
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
            Scatter plots use stamp-based rendering — a single point shape is pre-rendered to an offscreen canvas, then stamped at each data position. This makes scatter rendering scale to tens of thousands of points with minimal overhead.
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

        {/* ═══════════════════════════════════════════════════════
            SERIES OPTIONS
            ═══════════════════════════════════════════════════════ */}

        <Section id="interpolation" title="Interpolation">
          <Prose>Five interpolation modes for line and area series:</Prose>
          <ul style={{ color: 'var(--text-secondary)', 'font-size': '14.5px', 'line-height': '1.7', 'margin-bottom': '16px', 'padding-left': '20px' }}>
            <li><code>linear</code> — straight segments between points. Best for raw data where you want no smoothing.</li>
            <li><code>monotone</code> — Fritsch-Carlson monotone cubic. No overshoot. Best for continuous metrics (CPU, latency, temperature).</li>
            <li><code>step-before</code> — vertical transition before each point. The value holds until the next point.</li>
            <li><code>step-after</code> — vertical transition after each point. Best for event/state data (deployments, status changes).</li>
            <li><code>step-middle</code> — vertical transition at the midpoint between adjacent X values.</li>
          </ul>
          <Demo title="Edit the interpolation mode" desc="Change 'monotone' to 'step-after', 'linear', 'step-before', or 'step-middle'"
            data={d_interp()} height="220px"
            code={`{
  series: [{ label: 'Signal', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2.5 }],
}`} />
        </Section>

        <Section id="styling" title="Styling">
          <Prose>
            Control appearance per-series with <code>stroke</code>, <code>fill</code>, <code>opacity</code>, <code>lineWidth</code>, and <code>pointRadius</code>.
            For area charts, use <code>fillGradient</code> to specify custom top/bottom gradient colors.
          </Prose>
          <Demo title="Custom series styling" desc="Edit colors, opacity, and line widths"
            data={d_styling()}
            code={`{
  series: [
    { label: 'Thick', dataIndex: 1, type: 'line', stroke: '#e74c3c', lineWidth: 3, interpolation: 'monotone' },
    { label: 'Dashed area', dataIndex: 2, type: 'area', stroke: '#2ecc71', opacity: 0.6, fillGradient: { top: 'rgba(46,204,113,0.3)', bottom: 'rgba(46,204,113,0.02)' }, interpolation: 'monotone', lineWidth: 2 },
    { label: 'Points', dataIndex: 3, type: 'scatter', stroke: '#9b59b6', pointRadius: 4 },
  ],
  tooltip: { show: true, mode: 'index' },
}`} />
        </Section>

        <Section id="line-dash" title="Line Dash">
          <Prose>
            Use <code>lineDash</code> to render dashed or dotted lines. The value follows the
            Canvas <code>setLineDash()</code> spec — an array of segment lengths alternating
            between dash and gap. Applied to both line strokes and area outlines.
          </Prose>
          <Demo title="Dash patterns" desc="Solid, dashed, and dotted lines side by side"
            data={d_dash()}
            code={`{
  axes: { x: { type: 'time' }, y: { type: 'linear' } },
  series: [
    { label: 'Solid', dataIndex: 1, type: 'line', stroke: '#4f8fea', lineWidth: 2 },
    { label: 'Dashed', dataIndex: 2, type: 'line', stroke: '#e69f00', lineWidth: 2, lineDash: [8, 4] },
    { label: 'Dotted', dataIndex: 3, type: 'line', stroke: '#2ecc71', lineWidth: 2, lineDash: [2, 3] },
  ],
  tooltip: { show: true, mode: 'index' },
}`} />
        </Section>

        <Section id="nan-gaps" title="NaN Gaps">
          <Prose>
            <code>NaN</code> values in Y arrays create gaps in the line. The library detects gaps with <code>value !== value</code> (the fastest NaN check).
            Combined with step interpolation, this is ideal for sensor data with dropouts or event streams with missing intervals.
          </Prose>
          <Demo title="Sensor data with dropouts" desc="Step interpolation with NaN gaps at indices 12-16, 30-33, and 48-50"
            data={d_gap()}
            code={`{
  series: [{ label: 'Sensor', dataIndex: 1, type: 'line', interpolation: 'step-after', lineWidth: 2 }],
}`} />
        </Section>

        <Section id="dual-axis" title="Dual Y-Axis">
          <Prose>
            Bind series to different Y axes using <code>yAxisKey</code>. Define a second Y axis with <code>position: 'right'</code> to render its axis on the right edge of the chart.
          </Prose>
          <Demo title="Temperature + Humidity" data={d_dual()}
            code={`{
  axes: {
    x: { type: 'time' },
    y: { type: 'linear' },
    y2: { type: 'linear', position: 'right' },
  },
  series: [
    { label: 'Temp (\u00b0C)', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2, yAxisKey: 'y' },
    { label: 'Humidity (%)', dataIndex: 2, type: 'area', interpolation: 'monotone', lineWidth: 1.5, yAxisKey: 'y2' },
  ],
  tooltip: { show: true, mode: 'index' },
}`} />
        </Section>

        {/* ═══════════════════════════════════════════════════════
            SCALES & AXES
            ═══════════════════════════════════════════════════════ */}

        <Section id="linear-scale" title="Linear Scale">
          <Prose>
            The default scale type. Uses Heckbert's nice numbers algorithm (with D3's integer-arithmetic trick) to produce clean tick boundaries — 0, 20, 40, 60 instead of 17.3, 34.6, 51.9.
            Y axis auto-ranges to fit the visible data in the current X viewport.
          </Prose>
          <Prose>
            <b>Range control per axis</b> — three knobs combine for any behaviour you need:
          </Prose>
          <ul style={{ color: 'var(--text-secondary)', 'font-size': '14.5px', 'line-height': '1.7', 'margin-bottom': '16px', 'padding-left': '20px' }}>
            <li><code>min</code> / <code>max</code> — pin the bounds. <code>resetZoom()</code> now restores to these values (previously a no-op).</li>
            <li><code>padding</code> — fraction of the data range to pad each side. Default: <code>0</code> for horizontal axes, <code>0.05</code> for vertical.</li>
            <li><code>nice</code> — whether to round bounds outward to clean tick boundaries. Default: <code>true</code>. Set to <code>false</code> for exact-extent rendering (no trailing gap on the right).</li>
          </ul>
          <CodeBlock code={`axes: {
  x: { nice: false, padding: 0 },      // exact data extent
  y: { nice: true,  padding: 0.1 },    // 10% pad + nice tick boundaries
}`} />
          <div style={{ height: '12px' }} />
          <Demo title="Linear scale with nice ticks" data={d_linear()} height="240px"
            code={`{
  series: [{ label: 'Value', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2 }],
  tooltip: { show: true },
}`} />
        </Section>

        <Section id="log-scale" title="Log Scale">
          <Prose>
            Logarithmic Y axis compresses exponential growth into a readable range. Ticks are placed at powers of 10 with sub-ticks at 2x and 5x intervals.
            Use when your data spans multiple orders of magnitude (e.g. request latency percentiles, population growth).
          </Prose>
          <Demo title="Exponential growth on log scale" data={d_log()}
            code={`{
  axes: { y: { type: 'log' } },
  series: [{ label: 'Growth', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2 }],
}`} />
        </Section>

        <Section id="time-scale" title="Time Scale">
          <Prose>
            Time scale automatically selects tick intervals (seconds, minutes, hours, days, months) based on the visible range.
            Labels use hierarchical formatting — time-of-day labels show hours:minutes, while date boundaries show the date.
          </Prose>
          <Demo title="Time scale with auto intervals" desc="Zoom in to see time intervals change from hours to minutes"
            data={d_time()}
            code={`{
  axes: { x: { type: 'time' } },
  series: [{ label: 'Requests', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2 }],
  zoom: { enabled: true, x: true },
  tooltip: { show: true },
}`} />
        </Section>

        <Section id="tick-format" title="Custom Tick Formatting">
          <Prose>
            Override the default tick label formatting with a <code>tickFormat</code> function on an axis config.
            This receives the raw numeric value and returns a display string.
          </Prose>
          <CodeBlock code={`// In your chart config
axes: {
  bottom: {
    position: 'bottom',
    scaleKey: 'x',
    tickFormat: (value) => new Date(value).toLocaleDateString(),
  },
  left: {
    position: 'left',
    scaleKey: 'y',
    tickFormat: (value) => \`\${value.toFixed(1)}%\`,
  },
}`} />
          <div style={{ height: '8px' }} />
          <Prose>
            The <code>tickFormat</code> function is called for every visible tick label on each redraw.
            Keep it fast — avoid heavy date parsing or string operations in tight loops.
          </Prose>
        </Section>

        {/* ═══════════════════════════════════════════════════════
            INTERACTIONS
            ═══════════════════════════════════════════════════════ */}

        <Section id="interaction-modes" title="Interaction Modes">
          <Prose>
            Three interaction presets define default gesture-to-action mappings. Set via <code>interaction</code> on the config.
          </Prose>
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
                  <th style={{ padding: '10px 12px', 'text-align': 'left', 'font-weight': '600', color: 'var(--text)' }}>Gesture</th>
                  <th style={{ padding: '10px 12px', 'text-align': 'center', 'font-weight': '600', color: 'var(--text)' }}>timeseries</th>
                  <th style={{ padding: '10px 12px', 'text-align': 'center', 'font-weight': '600', color: 'var(--text)' }}>analytical</th>
                  <th style={{ padding: '10px 12px', 'text-align': 'center', 'font-weight': '600', color: 'var(--text)' }}>readonly</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Mouse drag', 'Box zoom', 'Box zoom', '\u2014'],
                  ['Shift+drag', 'Pan', 'Pan', '\u2014'],
                  ['Pinch', 'Zoom X', 'Zoom XY', '\u2014'],
                  ['Touch drag', 'Pan', 'Pan', '\u2014'],
                  ['Long-press+drag', 'Box zoom', 'Box zoom', '\u2014'],
                  ['Tap', 'Tooltip', 'Tooltip', 'Tooltip'],
                  ['Double-tap/click', 'Reset', 'Reset', '\u2014'],
                  ['Scroll', 'Page', 'Page', 'Page'],
                  ['Axis scroll', 'Zoom axis', 'Zoom axis', '\u2014'],
                  ['Axis drag', 'Pan axis', 'Pan axis', '\u2014'],
                ].map(([gesture, ts, an, ro]) => (
                  <tr style={{ 'border-bottom': '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', 'font-weight': '500' }}>{gesture}</td>
                    <td style={{ padding: '8px 12px', 'text-align': 'center' }}>{ts}</td>
                    <td style={{ padding: '8px 12px', 'text-align': 'center' }}>{an}</td>
                    <td style={{ padding: '8px 12px', 'text-align': 'center' }}>{ro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Demo title="Interaction mode demo" desc="Change 'timeseries' to 'analytical' (enables Y zoom + XY pinch) or 'readonly' (tooltip only)"
            data={d_interaction()}
            code={`{
  interaction: 'timeseries',
  axes: { x: { type: 'time' }, y: { type: 'linear' } },
  series: [
    { label: 'Series A', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Series B', dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 2 },
  ],
  tooltip: { show: true, mode: 'index' },
}`} />
        </Section>

        <Section id="zoom" title="Zoom & Selection">
          <Prose>
            Drag to select a region to zoom into. For time series (<code>zoom.y: false</code>), the selection is a full-height band constraining only X.
            For scatter plots (<code>zoom.y: true</code>), you get a free rectangle selecting both axes. Drag endpoints are clamped to the plot rectangle, so releasing far outside the chart still zooms to within the data.
          </Prose>
          <Prose>
            <b>Double-click</b> (or double-tap) resets zoom to the full data extent.
            Use <code>minRange</code> and <code>maxRange</code> to set zoom limits. <code>wheelFactor</code> controls trackpad pinch sensitivity.
            The <code>onZoom</code> callback fires whenever the viewport changes.
          </Prose>
          <Prose>
            <b>Bounds</b> — by default, pan and zoom are clamped to the data extent so users can't navigate past the data. Override via <code>zoom.bounds</code>:
          </Prose>
          <CodeBlock code={`zoom: { bounds: true }                             // default (clamp X to data, Y unbounded)
zoom: { bounds: false }                            // or 'unbounded' — classic infinite nav
zoom: { bounds: 'data' }                           // clamp every axis to data extent
zoom: { bounds: { x: 'data', y: 'unbounded' } }    // per-axis
zoom: { bounds: { x: { min: 0, max: 100 } } }      // custom hard walls`} />
          <Prose>
            Bounds are evaluated on every viewport change. Panning into the edge stops at the edge (range preserved); zoom-out past the full extent collapses to the full extent. The <code>'data'</code> bound tracks what <code>resetZoom()</code> would produce — including <code>nice()</code> expansion and any axis pins — so the zoom-out limit matches the initial view.
          </Prose>
          <Demo title="Zoom controls" desc="Drag to zoom, double-click to reset. Try zooming out past the edges — bounds prevent you from escaping the data."
            data={d_zoom()}
            code={`{
  axes: { x: { type: 'time' } },
  series: [
    { label: 'Throughput', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Latency', dataIndex: 2, type: 'area', interpolation: 'monotone', lineWidth: 1.5 },
  ],
  zoom: { enabled: true, x: true, y: false, wheelFactor: 0.5, bounds: true },
  tooltip: { show: true, mode: 'index' },
}`} />
        </Section>

        <Section id="pan" title="Pan">
          <Prose>
            Enable panning with <code>pan: {'{ enabled: true, x: true, y: true }'}</code>. In the <code>timeseries</code> interaction mode, shift+drag activates pan. You can also drag on the axis areas to pan along a single axis.
          </Prose>
          <Demo title="Pan demo" desc="Hold shift and drag to pan, or drag on an axis"
            data={d_pan()}
            code={`{
  axes: { x: { type: 'time' } },
  series: [
    { label: 'Series A', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Series B', dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 2 },
  ],
  zoom: { enabled: true, x: true },
  pan: { enabled: true, x: true, y: false },
  tooltip: { show: true, mode: 'index' },
}`} />
        </Section>

        <Section id="cursor" title="Cursor & Crosshair">
          <Prose>
            Configure the cursor crosshair with <code>cursor</code>. Options include <code>show</code>, <code>snap</code> (snap to nearest data point),
            <code>xLine</code>/<code>yLine</code> (toggle each crosshair line), <code>color</code>, <code>dash</code> (dash pattern array), and <code>indicators</code> (the per-series dot+ring drawn at each hit-tested point on hover — disable when a legend table already shows the values).
          </Prose>
          <Prose>
            <b>Cross-chart cursor sync:</b> set the same <code>cursor.syncKey</code> on multiple charts to synchronize their crosshair positions. See also <a href="javascript:void(0)" onClick={() => scrollTo('cross-chart-sync')}>Cross-chart Sync</a> for a more ergonomic one-line helper that bundles cursor + highlight sync together.
          </Prose>
          <Demo title="Crosshair config" desc="Try disabling indicators, or enabling yLine"
            data={d_cursor()}
            code={`{
  axes: { x: { type: 'time' } },
  series: [
    { label: 'Series A', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Series B', dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 2 },
  ],
  cursor: { show: true, snap: true, xLine: true, yLine: false, dash: [4, 3], indicators: true },
  tooltip: { show: true, mode: 'index' },
}`} />
        </Section>

        <Section id="touch" title="Touch Gestures">
          <Prose>Touch-specific interaction behaviors:</Prose>
          <ul style={{ color: 'var(--text-secondary)', 'font-size': '14.5px', 'line-height': '1.7', 'margin-bottom': '16px', 'padding-left': '20px' }}>
            <li><b>One-finger drag</b> — pan along the X axis</li>
            <li><b>Two-finger pinch</b> — zoom (X-only in timeseries mode, XY in analytical mode). Axis locking is automatic based on the pinch direction.</li>
            <li><b>Long-press + drag</b> — activates box zoom (same as mouse drag)</li>
            <li><b>Tap</b> — shows tooltip at the nearest data point</li>
            <li><b>Double-tap</b> — resets zoom to full data extent</li>
          </ul>
          <Prose>
            Configure touch behavior with the <code>touch</code> config:
          </Prose>
          <CodeBlock code={`touch: {
  hitRadius: 24,    // CSS pixels — larger radius for fat-finger tolerance
  longPressMs: 400, // ms before long-press activates box zoom
}`} />
        </Section>

        {/* ═══════════════════════════════════════════════════════
            TOOLTIPS
            ═══════════════════════════════════════════════════════ */}

        <Section id="tooltip-modes" title="Tooltip Modes">
          <Prose>Three tooltip modes determine how points are selected when the cursor moves:</Prose>
          <ul style={{ color: 'var(--text-secondary)', 'font-size': '14.5px', 'line-height': '1.7', 'margin-bottom': '16px', 'padding-left': '20px' }}>
            <li><code>'index'</code> — shows all series at the same X position. Best for time series where all series share an X axis.</li>
            <li><code>'nearest'</code> — shows the single closest point by euclidean (pixel) distance. Best for scatter plots.</li>
            <li><code>'x'</code> — shows all series at the nearest X value. Similar to index but matches by X data value rather than index.</li>
          </ul>
          <Prose>Tooltips are DOM elements (<code>position: fixed</code>), not canvas — better text rendering, no clipping, and easy styling.</Prose>
          <Demo title="Tooltip mode demo" desc="Change mode to 'nearest' or 'x'"
            data={d_tooltip_mode()}
            code={`{
  axes: { x: { type: 'time' } },
  series: [
    { label: 'CPU', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Memory', dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Disk', dataIndex: 3, type: 'line', interpolation: 'monotone', lineWidth: 1.5 },
  ],
  tooltip: { show: true, mode: 'index' },
}`} />
        </Section>

        <Section id="tooltip-custom" title="Custom Tooltip Renderer">
          <Prose>
            Pass a <code>tooltip.render</code> function for full control over tooltip content.
            It receives an array of <code>TooltipPoint</code> objects and should return an HTML string or an <code>HTMLElement</code>.
          </Prose>
          <Demo title="Custom tooltip HTML" desc="Edit the render function to change tooltip formatting"
            data={d_tooltip_custom()}
            code={`{
  axes: { x: { type: 'time' } },
  series: [
    { label: 'Revenue', dataIndex: 1, type: 'area', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Cost', dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 2 },
  ],
  tooltip: {
    show: true,
    mode: 'index',
    render: (points) =>
      '<div style="font-size:12px">' +
      points.map(p =>
        '<div style="display:flex;gap:8px;align-items:center">' +
        '<span style="width:8px;height:8px;border-radius:50%;background:' + p.color + '"></span>' +
        '<span>' + p.label + '</span>' +
        '<b style="margin-left:auto">$' + Number(p.formattedY).toFixed(1) + '</b>' +
        '</div>'
      ).join('') +
      '</div>',
  },
}`} />
          <Prose>Each <code>TooltipPoint</code> contains: <code>seriesIndex</code>, <code>dataIndex</code>, <code>label</code>, <code>x</code>, <code>y</code>, <code>color</code>, <code>formattedX</code>, <code>formattedY</code>.</Prose>
        </Section>

        <Section id="tooltip-snap" title="Proximity & Snap">
          <Prose>
            <b>Proximity gating:</b> the tooltip only appears when the cursor is within 32px of a data point. Move further away and only the crosshair remains. This prevents tooltip clutter in sparse regions of the chart.
          </Prose>
          <Prose>
            <b>Cursor snap:</b> when <code>cursor.snap</code> is <code>true</code>, the crosshair snaps to the nearest data point rather than following the raw mouse position. This makes it easier to inspect exact values.
          </Prose>
          <Demo title="Proximity and snap" desc="Move the cursor around — tooltip only shows near points. Toggle snap to see the difference."
            data={d_tooltip_snap()}
            code={`{
  series: [{ label: 'Points', dataIndex: 1, type: 'scatter', pointRadius: 3 }],
  cursor: { show: true, snap: true, xLine: true, yLine: true },
  tooltip: { show: true, mode: 'nearest' },
}`} />
        </Section>

        {/* ═══════════════════════════════════════════════════════
            THEMING
            ═══════════════════════════════════════════════════════ */}

        <Section id="themes-builtin" title="Built-in Themes">
          <Prose>Five built-in themes are available: <code>darkTheme</code>, <code>lightTheme</code>, <code>oceanTheme</code>, <code>midnightTheme</code>, and <code>refinedDarkTheme</code>. Pass any as the <code>theme</code> property in your config.</Prose>
          <Demo title="Theme switcher" desc="Change oceanTheme to refinedDarkTheme, darkTheme, lightTheme, or midnightTheme"
            data={d_theme()}
            code={`{
  theme: oceanTheme,
  axes: { x: { type: 'time' } },
  series: [
    { label: 'Series A', dataIndex: 1, type: 'area', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Series B', dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 1.5 },
  ],
  tooltip: { show: true, mode: 'index' },
}`} />
        </Section>

        <Section id="themes-custom" title="Custom Theme">
          <Prose>
            Create a custom theme by providing a partial <code>ThemeConfig</code> object. Any properties you omit will fall back to the resolved defaults (CSS variables or the built-in dark theme).
          </Prose>
          <CodeBlock code={`interface ThemeConfig {
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  fontSize: number;
  gridColor: string;
  gridOpacity: number;
  palette: string[];          // series color cycle
  axisLineColor: string;
  tickColor: string;
  crosshairColor: string;
  tooltipBackground: string;
  tooltipTextColor: string;
  tooltipBorderColor: string;
}`} />
          <div style={{ height: '12px' }} />
          <Demo title="Custom palette theme" desc="Edit the palette colors or other theme properties"
            data={d_theme()}
            code={`{
  theme: {
    backgroundColor: '#1a1a2e',
    textColor: '#e0e0e8',
    gridColor: '#2a2a4a',
    palette: ['#e74c3c', '#f39c12', '#2ecc71', '#3498db', '#9b59b6'],
    crosshairColor: '#888',
    tooltipBackground: 'rgba(20, 20, 40, 0.95)',
    tooltipTextColor: '#eee',
  },
  axes: { x: { type: 'time' } },
  series: [
    { label: 'Series A', dataIndex: 1, type: 'area', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Series B', dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 2 },
  ],
  tooltip: { show: true, mode: 'index' },
}`} />
        </Section>

        <Section id="css-vars" title="CSS Variables">
          <Prose>
            When no explicit <code>theme</code> is set in the config, the chart reads CSS custom properties from the container element.
            This integrates naturally with your site's dark/light mode toggle.
          </Prose>
          <CodeBlock code={`:root {
  --chart-bg: #0a0a1a;
  --chart-text: #e0e0e8;
  --chart-grid: #2a2b3d;
  --chart-axis: #555570;
}`} />
          <div style={{ height: '12px' }} />
          <Prose>
            The <code>resolveTheme()</code> function reads these variables at chart creation and on each redraw.
            If a variable is missing, it falls back to the built-in dark theme default. This means every chart on the page inherits your site's
            colors automatically — no per-chart theme config needed.
          </Prose>
          <Demo title="CSS variable theming (no explicit theme)" desc="This chart reads colors from the site's CSS variables"
            data={d_css_vars()}
            code={`{
  axes: { x: { type: 'time' } },
  series: [
    { label: 'Series A', dataIndex: 1, type: 'area', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Series B', dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 1.5 },
  ],
  tooltip: { show: true, mode: 'index' },
}`} />
        </Section>

        {/* ═══════════════════════════════════════════════════════
            DATA
            ═══════════════════════════════════════════════════════ */}

        <Section id="streaming" title="Streaming">
          <Prose>
            Use <code>appendData()</code> for real-time data. It appends new points without replacing the existing dataset.
            The user's zoom state is preserved — new data appears but the viewport stays where the user left it until they double-click to reset.
          </Prose>
          <Prose>
            Pass <code>maxLen</code> as the second argument to cap the buffer size. When the buffer overflows, the oldest points are dropped.
          </Prose>
          <CodeBlock code={`// appendData signature
chart.appendData(newData: ColumnarData, maxLen?: number);

// Example: append one point per second
const chart = /* ChartInstance from onReady */;
setInterval(() => {
  const now = Date.now();
  const value = Math.random() * 100;
  chart.appendData([
    new Float64Array([now]),
    new Float64Array([value]),
  ], 1000); // keep max 1000 points
}, 1000);`} />
          <div style={{ height: '12px' }} />
          <Prose>The streaming line chart in the <a href="javascript:void(0)" onClick={() => scrollTo('line')} style={{ color: 'var(--accent)' }}>Line</a> section above demonstrates this pattern live.</Prose>
        </Section>

        <Section id="downsampling" title="Downsampling">
          <Prose>
            Two downsampling utilities are exported for reducing large datasets before rendering. The library never mutates or downsamples your data automatically — you call these explicitly.
          </Prose>
          <Prose>
            <b>LTTB</b> (Largest Triangle Three Buckets) — preserves visual shape by selecting the most visually significant points. Best for general-purpose downsampling where you want the chart to "look right."
          </Prose>
          <CodeBlock code={`import { lttb } from 'snaplot';
const [downX, downY] = lttb(xData, yData, 500);  // 25K \u2192 500 points`} />
          <div style={{ height: '12px' }} />
          <Demo title="LTTB downsampled (500 points from 25K)" data={d_lttb()}
            code={`{
  axes: { x: { type: 'time' } },
  series: [{ label: '500 pts (LTTB)', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2 }],
  tooltip: { show: true },
}`} />
          <Prose>
            <b>M4</b> — pixel-aware aggregation that preserves min/max per pixel column. Best when you know the chart's pixel width and want guaranteed fidelity of peaks and valleys.
          </Prose>
          <CodeBlock code={`import { m4 } from 'snaplot';
const [downX, downY] = m4(xData, yData, pixelWidth, xMin, xMax);`} />
          <div style={{ height: '12px' }} />
          <Demo title="M4 downsampled (pixel-aware)" data={d_m4()}
            code={`{
  axes: { x: { type: 'time' } },
  series: [{ label: 'M4', dataIndex: 1, type: 'line', interpolation: 'linear', lineWidth: 1.5 }],
  tooltip: { show: true },
}`} />
        </Section>

        {/* ═══════════════════════════════════════════════════════
            PLUGINS
            ═══════════════════════════════════════════════════════ */}

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
            The plugin renders in the <code>afterDrawData</code> hook — above series data but below
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

        {/* ═══════════════════════════════════════════════════════
            CURSOR SNAPSHOT, LEGEND TABLE, CROSS-CHART SYNC
            ═══════════════════════════════════════════════════════ */}

        <Section id="legend-table" title="Legend Table">
          <Prose>
            A cursor-synchronised table that shows the value of every visible series at the cursor's X position — the common ML-dashboard pattern for comparing many runs. Available in two forms with feature parity:
          </Prose>
          <ul style={{ color: 'var(--text-secondary)', 'margin-bottom': '16px', 'font-size': '14.5px', 'line-height': '1.7', 'padding-left': '20px' }}>
            <li><code>createLegendTablePlugin()</code> — DOM-only, attaches to any chart.</li>
            <li><code>&lt;LegendTable&gt;</code> — SolidJS component with JSX cells, typed <code>meta</code>, and a render-prop escape hatch.</li>
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
            <b>Plain-DOM plugin</b> variant for non-Solid users — same defaults, same class names, edit live below:
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
            <b>Headless render-prop</b> mode keeps the cursor + highlight wiring but lets you render anything in place of the table — ideal when your app already has a table component:
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
            Pair the group with an external "runs" panel — hover a run and every chart dims everything else:
          </Prose>
          <SidepanelHighlightDemo />

          <div style={{ height: '24px' }} />
          <Prose>
            <b>Performance check</b> — many series + a value-cell update per cursor frame. The legend table reuses row DOM (text-content swaps only on cursor moves), highlight redraws only the data canvas, and the snapshot is read into a single reused buffer.
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

// Imperative — zero-alloc variant for hot paths:
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

        {/* ═══════════════════════════════════════════════════════
            API REFERENCE
            ═══════════════════════════════════════════════════════ */}

        <Section id="api-methods" title="ChartInstance Methods">
          <Prose>The <code>ChartInstance</code> object is returned by the <code>onReady</code> callback on <code>&lt;Chart&gt;</code>:</Prose>
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
                  <th style={{ padding: '10px 12px', 'text-align': 'left', 'font-weight': '600', color: 'var(--text)' }}>Method</th>
                  <th style={{ padding: '10px 12px', 'text-align': 'left', 'font-weight': '600', color: 'var(--text)' }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['setData(data: ColumnarData)', 'Replace all chart data'],
                  ['appendData(data: ColumnarData, maxLen?: number)', 'Append data for streaming; maxLen caps buffer'],
                  ['getData(): ColumnarData', 'Get current data arrays'],
                  ['setAxis(key: string, range: Partial<ScaleRange>)', 'Set axis domain (min/max)'],
                  ['getAxis(key: string): Scale | undefined', 'Get a scale instance by key'],
                  ['setOptions(config: DeepPartial<ChartConfig>)', 'Deep-merge config updates'],
                  ['getOptions(): ChartConfig', 'Get resolved config'],
                  ['getLayout(): Layout', 'Get current layout dimensions'],
                  ['redraw()', 'Force full redraw of all layers'],
                  ['resize(width: number, height: number)', 'Resize the chart'],
                  ['destroy()', 'Clean up all resources and event listeners'],
                  ['use(plugin: Plugin)', 'Register a plugin at runtime'],
                  ['on(event, handler): () => void', 'Subscribe to events; returns unsubscribe fn'],
                  ['setCursorDataX(dataX: number | null)', 'Set cursor position externally (for sync)'],
                  ['getCursorSnapshot(opts?): CursorSnapshot', 'Snapshot of every visible series at the cursor'],
                  ['getCursorSnapshotInto(target, opts?): CursorSnapshot', 'Zero-alloc variant that mutates a reused buffer'],
                  ['setHighlight(seriesIndex: number | null)', 'Focus a series; dims the others (data-layer only)'],
                  ['getHighlight(): number | null', 'Current highlighted series index, or null'],
                ].map(([method, desc]) => (
                  <tr style={{ 'border-bottom': '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', 'font-family': 'var(--font-mono)', 'font-size': '12px', 'white-space': 'nowrap' }}>{method}</td>
                    <td style={{ padding: '8px 12px' }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="api-events" title="Events">
          <Prose>Subscribe to chart events with <code>chart.on(event, handler)</code>. The returned function unsubscribes.</Prose>
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
                  <th style={{ padding: '10px 12px', 'text-align': 'left', 'font-weight': '600', color: 'var(--text)' }}>Event</th>
                  <th style={{ padding: '10px 12px', 'text-align': 'left', 'font-weight': '600', color: 'var(--text)' }}>Payload</th>
                  <th style={{ padding: '10px 12px', 'text-align': 'left', 'font-weight': '600', color: 'var(--text)' }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['cursor:move', '(dataX: number | null, dataIdx: number | null)', 'Cursor moved over chart or left'],
                  ['highlight:change', '(seriesIndex: number | null)', 'Highlighted series changed (local or synced)'],
                  ['viewport:change', '(scaleKey: string, range: ScaleRange)', 'Scale domain changed (zoom/pan)'],
                  ['data:update', '(data: ColumnarData)', 'Data replaced or appended'],
                  ['resize', '(width: number, height: number)', 'Chart container resized'],
                  ['click', '(dataX: number, dataIdx: number)', 'Click on the plot area'],
                  ['drawData', '(ctx: CanvasRenderingContext2D, layout: Layout)', 'After data layer draw (custom overlay)'],
                  ['drawOverlay', '(ctx: CanvasRenderingContext2D, layout: Layout)', 'After overlay layer draw'],
                ].map(([event, payload, desc]) => (
                  <tr style={{ 'border-bottom': '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', 'font-family': 'var(--font-mono)', 'font-size': '12px', 'white-space': 'nowrap' }}>{event}</td>
                    <td style={{ padding: '8px 12px', 'font-family': 'var(--font-mono)', 'font-size': '11.5px' }}>{payload}</td>
                    <td style={{ padding: '8px 12px' }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CodeBlock code={`// Example: log viewport changes
const unsub = chart.on('viewport:change', (key, range) => {
  console.log(\`\${key}: \${range.min.toFixed(2)} \u2013 \${range.max.toFixed(2)}\`);
});

// Later: unsubscribe
unsub();`} />
        </Section>

        <Section id="api-types" title="Types">
          <Prose>Key type exports from <code>snaplot</code>:</Prose>
          <CodeBlock code={`import type {
  // Core
  ChartInstance,       // Public chart API (methods table above)
  ChartConfig,         // Top-level configuration object (generic in TMeta)
  ChartType,           // 'line' | 'area' | 'scatter' | 'bar' | 'histogram'
  ColumnarData,        // [xValues: Float64Array, ...yValues: Float64Array[]]
  DeepPartial,         // Recursive partial utility type

  // Scales
  Scale,               // Scale instance (dataToPixel, pixelToData, ticks, etc.)
  ScaleType,           // 'linear' | 'log' | 'time'
  ScaleRange,          // { min: number; max: number }

  // Series
  SeriesConfig,        // Per-series configuration (generic in TMeta)
  InterpolationMode,   // 'linear' | 'monotone' | 'step-before' | 'step-after' | 'step-middle'

  // Axes
  AxisConfig,          // Axis configuration (min, max, padding, nice, auto)
  AxisPosition,        // 'top' | 'bottom' | 'left' | 'right'

  // Interactions
  InteractionMode,     // 'timeseries' | 'analytical' | 'readonly'
  CursorConfig,        // Crosshair config (show, snap, indicators, syncKey, ...)
  ZoomConfig,          // Zoom/selection config (bounds, wheelFactor, ...)
  ZoomBoundsSpec,      // 'data' | 'unbounded' | { min?, max? }
  PanConfig,           // Pan configuration
  TouchConfig,         // Touch gesture configuration
  TooltipConfig,       // Tooltip configuration
  TooltipPoint,        // Point data passed to tooltip renderer

  // Cursor snapshot (legend table data source)
  CursorSnapshot,      // { source, dataIndex, dataX, formattedX,
                       //   activeSeriesIndex, points: CursorSeriesPoint[] }
  CursorSeriesPoint,   // { seriesIndex, dataIndex, label, color,
                       //   value, formattedValue, meta }
  CursorSnapshotOptions, // { fallback?: 'hide' | 'latest' | 'first' }

  // Highlight (cross-chart series focus)
  HighlightConfig,     // { enabled, dimOpacity, syncKey }

  // Theme & Layout
  ThemeConfig,         // Full theme object
  Layout,              // Computed layout dimensions

  // Plugins & Rendering
  Plugin,              // Plugin lifecycle interface
  ChartEventMap,       // Event name \u2192 handler signature map
  RenderContext,       // Internal render context (for advanced plugins)

  // Legend table
  LegendTableOptions,  // createLegendTablePlugin options
  LegendTableColumn,   // Column spec shared by plugin and <LegendTable>
  LegendCellContent,   // string | Node returned by cell()

  // SolidJS component
  LegendTableProps,        // <LegendTable> props
  LegendTableSolidColumn,  // JSX-flavored column (cell returns JSX.Element)
  LegendTableFallback,     // 'hide' | 'latest' | 'first' | 'series-only'

  // Chart groups (multi-chart sync helpers)
  ChartGroup,          // createChartGroup() handle
  ChartGroupBindings,  // What bind() returns
} from 'snaplot';`} />
        </Section>
      </div>
    </div>
  );
}
