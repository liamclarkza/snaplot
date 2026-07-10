import CodeBlock from '../../../components/CodeBlock';
import DocsLink from '../DocsLink';
import { Section, Prose } from '../../../components/ui';

export default function Data() {
  return (
    <>
      <Section id="streaming" title="Streaming">
        <Prose>
          Use <code>appendData()</code> for real-time data. It appends new points without replacing the existing dataset.
          The user's zoom state is preserved, new data appears but the viewport stays where the user left it until they double-click to reset.
        </Prose>
        <Prose>
          Set <code>streaming.maxLen</code> on the chart config to cap the retained window. When the buffer overflows, the oldest points are dropped through an internal ring buffer.
        </Prose>
        <Prose>
          Appended chunks must use the same column count and equal column lengths as the current dataset. New X values must be finite and continue in non-decreasing order from the existing tail.
        </Prose>
        <CodeBlock code={`const chart = new ChartCore(container, {
  streaming: { maxLen: 1000 }, // keep max 1000 points
  series: [{ label: 'value', dataIndex: 1, type: 'line' }],
}, initialData);

// Example: append one point per second
setInterval(() => {
  const now = Date.now();
  const value = Math.random() * 100;
  chart.appendData([
    new Float64Array([now]),
    new Float64Array([value]),
  ]);
}, 1000);`} />
        <div style={{ height: '12px' }} />
        <Prose>
          For the full pattern, ring buffer, in-place tail refinement with{' '}
          <code>updateLast</code>, live-follow windows, and a running demo, see the{' '}
          <DocsLink slug="recipes" id="recipe-streaming">Streaming Dashboard recipe</DocsLink>.
        </Prose>
      </Section>

      <Section id="downsampling" title="Downsampling">
        <Prose>
          Two downsampling utilities are exported for reducing large datasets before rendering. The library never mutates or downsamples your data automatically, you call these explicitly.
        </Prose>
        <Prose>
          <b>LTTB</b> (Largest Triangle Three Buckets) targets a point count and preserves visual shape.
          <b> M4</b> is pixel-aware aggregation that keeps the min/max per pixel column, so peaks survive.
        </Prose>
        <CodeBlock code={`import { lttb, m4 } from 'snaplot';

// LTTB: target a point count.
const [lx, ly] = lttb(xData, yData, 500);   // 25K -> 500 points

// M4: pixel-aware, pass the plot width and current X domain.
const [mx, my] = m4(xData, yData, plotWidthPx, xMin, xMax);`} />
        <div style={{ height: '12px' }} />
        <Prose>
          For guidance on choosing between them and live side-by-side charts, see the{' '}
          <DocsLink slug="recipes" id="recipe-downsampling">Downsampling recipe</DocsLink>.
        </Prose>
      </Section>
    </>
  );
}
