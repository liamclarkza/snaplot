import { createSignal } from 'solid-js';
import CodeBlock from '../../../components/CodeBlock';
import { Section, Prose, Demo } from '../../../components/ui';
import { timeSeries } from '../fixtures';
export default function GettingStarted() {
  const [data] = createSignal(timeSeries(100, 1));
  return <>
    <Section id="install" title="Installation">
      <CodeBlock code="npm install snaplot" />
      <div style={{ height: '12px' }} />
      <Prose>The root import is framework-independent. Native components are available from <code>snaplot/react</code> for React 19 and <code>snaplot/solid</code> for Solid 1.9. Install only the framework you use.</Prose>
      <CodeBlock code={`import { createChart } from 'snaplot';
// Or: import { Chart } from 'snaplot/react';
// Or: import { Chart } from 'snaplot/solid';`} />
    </Section>
    <Section id="quick-start" title="Quick Start">
      <Prose>Pass application rows and name the fields to plot. Series default to lines, with labels inferred from field names.</Prose>
      <CodeBlock code={`const samples = [
  { time: new Date('2026-01-01'), cpu: 42 },
  { time: new Date('2026-01-02'), cpu: 51 },
];

const chart = createChart(element, {
  data: samples,
  x: 'time',
  series: [{ y: 'cpu', label: 'CPU' }],
  axes: { y: { title: 'Utilization (%)', min: 0, max: 100 } },
});

// React and Solid use the same direct options:
<Chart data={samples} x="time" series={[{ y: 'cpu' }]} />

// Plain JavaScript cleanup:
chart.destroy();`} />
      <div style={{ height: '16px' }} />
      <Demo title="Live quick start" desc="A simple line chart, edit the options to experiment" data={data()} height="240px" code={`{
  x: 'x',
  axes: { x: { type: 'time' }, y: { type: 'linear' } },
  series: [{ label: 'Metric', y: 'value1', type: 'line', interpolation: 'monotone', lineWidth: 2 }],
  tooltip: { show: true },
}`} />
    </Section>
    <Section id="data-model" title="Data Model">
      <Prose>Rows accept field names or typed accessors. Continuous row data is stably sorted on ingestion without changing your input or losing source-row identity. Dates infer a time axis; strings infer categories. Numeric timestamps use an explicit <code>type: 'time'</code>. Missing metric values create gaps.</Prose>
      <CodeBlock code={`// Named columns reuse your Float64Array buffers.
const data = { columns: {
  time: new Float64Array([1, 2, 3]),
  cpu: new Float64Array([10, NaN, 30]),
  memory: new Float64Array([5, 15, 25]),
} };
const chart = createChart(element, {
  data, x: 'time',
  series: [{ y: 'cpu' }, { y: 'memory' }],
});
chart.update({ data: nextData });`} />
      <Prose>Named columns must have equal lengths and finite X values. Ordered marks require sorted X; scatter coordinates can be unordered. Columns are not sorted or converted during rendering. Treat input buffers as immutable. Use <code>chart.update</code> to replace a snapshot or <code>chart.appendData</code> for an ordered stream.</Prose>
      <Prose>Series can also provide independent datasets, with their own X fields and sample times. Snaplot searches each source directly and retains each sample’s actual X value; no manual joining or interpolation is required.</Prose>
      <CodeBlock code={`createChart(element, {
  x: 'step',
  series: [
    { id: 'baseline', data: baselineRun, y: 'loss' },
    { id: 'augmented', data: augmentedRun, y: 'loss' },
  ],
});`} />
    </Section>
  </>;
}
