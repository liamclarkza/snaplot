import { createSignal } from 'solid-js';
import CodeBlock from '../../../components/CodeBlock';
import DocsLink from '../DocsLink';
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
          The default scale type. Automatic linear ranges round outward to evenly spaced tick boundaries by default.
          Y axis auto-ranges to fit the visible data in the current X viewport.
        </Prose>
        <Prose>
          <b>Range control per axis</b>, three knobs combine for any behaviour you need:
        </Prose>
        <ul style={{ color: 'var(--text-secondary)', 'font-size': '14.5px', 'line-height': '1.7', 'margin-bottom': '16px', 'padding-left': '20px' }}>
          <li><code>min</code> / <code>max</code>, pin the bounds. <code>resetViewport()</code> restores these configured bounds.</li>
          <li><code>rangePadding</code>, fraction of the data range to pad each side. Default: <code>0</code> for horizontal axes, <code>0.05</code> for vertical.</li>
          <li><code>roundBounds</code>, whether to round bounds outward to clean tick boundaries. Default: <code>true</code> for linear axes. Set to <code>false</code> for tight automatic bounds; explicit min/max and zoom ranges remain exact.</li>
        </ul>
        <CodeBlock code={`axes: {
  x: { rangePadding: 0, roundBounds: false }, // exact data extent
  y: { rangePadding: 0.1 }, // 10% padding, then rounded bounds
  // y: { min: 0, max: 100 }, // explicit bounds stay exact
}`} />
        <div style={{ height: '12px' }} />
        <Demo title="Linear scale with readable ticks" data={d_linear()} height="240px"
          code={`{
  series: [{ label: 'Value', y: 'value1', type: 'line', interpolation: 'monotone', lineWidth: 2 }],
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
  series: [{ label: 'Growth', y: 'value1', type: 'line', interpolation: 'monotone', lineWidth: 2 }],
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
  series: [{ label: 'Requests', y: 'value1', type: 'line', interpolation: 'monotone', lineWidth: 2 }],
  zoom: { enabled: true, x: true },
  tooltip: { show: true },
}`} />
      </Section>

      <Section id="category-scale" title="Category Scale">
        <Prose>String X fields infer a category axis. Categories retain their first-seen order across updates, with new labels appended. Supply <code>categories</code> to pin the order and keep empty slots; unknown labels then produce an error.</Prose>
        <CodeBlock code={`createChart(element, {
  data: [{ airport: 'JHB', arrivals: 12 }, { airport: 'CPT', arrivals: 18 }],
  x: 'airport',
  series: [{ y: 'arrivals', type: 'bar' }],
  axes: { x: { categories: ['JHB', 'CPT', 'DUR'] } },
});`} />
        <Prose>Bars require one observation per category per series. Aggregate repeated categories explicitly, or use scatter marks for multiple observations. Formatters, annotations and point events use category labels; programmatic viewports use numeric category-slot indices.</Prose>
      </Section>

      <Section id="tick-format" title="Custom Tick Formatting">
        <Prose>
          Override the default tick label formatting with a <code>format</code> function on an axis config.
          This receives the raw numeric value and returns a display string.
        </Prose>
        <CodeBlock code={`// In your chart config
axes: {
  x: {
    type: 'time',
    format: (value) => new Date(value).toLocaleDateString(),
  },
  y: {
    format: (value) => \`\${value.toFixed(1)}%\`,
  },
}`} />
        <div style={{ height: '8px' }} />
        <Prose>
          The <code>format</code> function is called for every visible tick label on each redraw.
          Keep it fast, avoid heavy date parsing or string operations in tight loops.
        </Prose>
        <Prose>
          Worked examples: the{' '}
          <DocsLink slug="recipes" id="recipe-axis-titles">Axis Titles recipe</DocsLink>{' '}
          pairs <code>format</code> with axis labels, and the{' '}
          <DocsLink slug="recipes" id="recipe-ticks">Ticks and Gridlines recipe</DocsLink>{' '}
          covers <code>tickCount</code>, explicit <code>ticks</code>, and per-axis grid styling.
        </Prose>
      </Section>
    </>
  );
}
