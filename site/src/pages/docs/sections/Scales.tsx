import { createSignal } from 'solid-js';
import CodeBlock from '../../../components/CodeBlock';
import { Section, Prose, Demo } from '../../../components/ui';
import { linearData, logData, timeScaleData } from '../fixtures';

export default function Scales() {
  const [d_linear] = createSignal(linearData());
  const [d_log] = createSignal(logData());
  const [d_time] = createSignal(timeScaleData());

  return (
    <>
      <Section id="linear-scale" title="Linear Scale">
        <Prose>
          The default scale type. Uses Heckbert's nice numbers algorithm (with D3's integer-arithmetic trick) to produce clean tick boundaries, 0, 20, 40, 60 instead of 17.3, 34.6, 51.9.
          Y axis auto-ranges to fit the visible data in the current X viewport.
        </Prose>
        <Prose>
          <b>Range control per axis</b>, three knobs combine for any behaviour you need:
        </Prose>
        <ul style={{ color: 'var(--text-secondary)', 'font-size': '14.5px', 'line-height': '1.7', 'margin-bottom': '16px', 'padding-left': '20px' }}>
          <li><code>min</code> / <code>max</code>, pin the bounds. <code>resetZoom()</code> now restores to these values (previously a no-op).</li>
          <li><code>padding</code>, fraction of the data range to pad each side. Default: <code>0</code> for horizontal axes, <code>0.05</code> for vertical.</li>
          <li><code>nice</code>, whether to round bounds outward to clean tick boundaries. Default: <code>true</code>. Set to <code>false</code> for exact-extent rendering (no trailing gap on the right).</li>
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
          Labels use hierarchical formatting, time-of-day labels show hours:minutes, while date boundaries show the date.
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
          Keep it fast, avoid heavy date parsing or string operations in tight loops.
        </Prose>
      </Section>
    </>
  );
}
