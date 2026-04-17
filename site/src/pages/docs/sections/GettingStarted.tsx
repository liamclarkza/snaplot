import { createSignal } from 'solid-js';
import CodeBlock from '../../../components/CodeBlock';
import { Section, Prose, Demo } from '../../../components/ui';
import { timeSeries } from '../fixtures';

export default function GettingStarted() {
  const [d_quickstart] = createSignal(timeSeries(100, 1));

  return (
    <>
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
        <Demo title="Live quick start" desc="A simple line chart, edit the config to experiment"
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
          <b>Render pipeline:</b> data change or resize triggers scale recomputation and marks all 3 canvas layers dirty. Scale change (zoom) marks data + grid dirty. Pointer events only mark the overlay dirty. A single <code>requestAnimationFrame</code> fires per frame, redrawing only the dirty layers. This means cursor movement at 60fps only redraws one lightweight overlay canvas, the data canvas with 100K+ points remains untouched.
        </Prose>
      </Section>
    </>
  );
}
