import { createSignal } from 'solid-js';
import { Section, Prose, Demo } from '../../../components/ui';
import {
  timeSeries,
  interpData,
  stylingData,
  gappedData,
  dualAxisData,
} from '../fixtures';

export default function SeriesOptions() {
  const [d_interp] = createSignal(interpData());
  const [d_styling] = createSignal(stylingData());
  const [d_dash] = createSignal(timeSeries(300, 3));
  const [d_gap] = createSignal(gappedData());
  const [d_dual] = createSignal(dualAxisData());

  return (
    <>
      <Section id="interpolation" title="Interpolation">
        <Prose>Five interpolation modes for line and area series:</Prose>
        <ul style={{ color: 'var(--text-secondary)', 'font-size': '14.5px', 'line-height': '1.7', 'margin-bottom': '16px', 'padding-left': '20px' }}>
          <li><code>linear</code>, straight segments between points. Best for raw data where you want no smoothing.</li>
          <li><code>monotone</code>, Fritsch-Carlson monotone cubic. No overshoot. Best for continuous metrics (CPU, latency, temperature).</li>
          <li><code>step-before</code>, vertical transition before each point. The value holds until the next point.</li>
          <li><code>step-after</code>, vertical transition after each point. Best for event/state data (deployments, status changes).</li>
          <li><code>step-middle</code>, vertical transition at the midpoint between adjacent X values.</li>
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
          Canvas <code>setLineDash()</code> spec, an array of segment lengths alternating
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
    </>
  );
}
