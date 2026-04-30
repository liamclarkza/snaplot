import { createEffect, createSignal, onCleanup } from 'solid-js';
import { Chart, lttb, m4 } from 'snaplot';
import type { ChartInstance, ColumnarData } from 'snaplot';
import CodeBlock from '../../../components/CodeBlock';
import { Section, Prose, Demo } from '../../../components/ui';
import { largeTimeSeries } from '../fixtures';
import { scrollTo } from '../Sidebar';

export default function Data() {
  // LTTB downsampled data
  const lttbOrig = largeTimeSeries(25_000);
  const [lttbDx, lttbDy] = lttb(lttbOrig[0], lttbOrig[1], 500);
  const [d_lttb] = createSignal<ColumnarData>([lttbDx, lttbDy]);

  // M4 downsampled data
  const m4Orig = largeTimeSeries(25_000);
  const [m4Dx, m4Dy] = m4(m4Orig[0], m4Orig[1], 600, m4Orig[0][0], m4Orig[0][m4Orig[0].length - 1]);
  const [d_m4] = createSignal<ColumnarData>([m4Dx, m4Dy]);

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
          The streaming line chart in the{' '}
          <button
            type="button"
            onClick={() => scrollTo('line')}
            style={{
              background: 'none', border: 'none', padding: '0',
              color: 'var(--accent)', cursor: 'pointer', font: 'inherit',
            }}
          >Line</button>{' '}
          section above demonstrates this pattern live.
        </Prose>
        <StreamingDiagnosticsDemo />
      </Section>

      <Section id="downsampling" title="Downsampling">
        <Prose>
          Two downsampling utilities are exported for reducing large datasets before rendering. The library never mutates or downsamples your data automatically, you call these explicitly.
        </Prose>
        <Prose>
          <b>LTTB</b> (Largest Triangle Three Buckets), preserves visual shape by selecting the most visually significant points. Best for general-purpose downsampling where you want the chart to "look right."
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
          <b>M4</b>, pixel-aware aggregation that preserves min/max per pixel column. Best when you know the chart's pixel width and want guaranteed fidelity of peaks and valleys.
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
    </>
  );
}

function streamingSeed(points: number): ColumnarData {
  const x = new Float64Array(points);
  const y = new Float64Array(points);
  for (let i = 0; i < points; i++) {
    x[i] = i;
    y[i] = 50 + Math.sin(i / 12) * 18 + Math.cos(i / 5) * 4;
  }
  return [x, y];
}

function StreamingDiagnosticsDemo() {
  const [chart, setChart] = createSignal<ChartInstance>();
  const [label, setLabel] = createSignal('waiting for chart');
  const data = streamingSeed(240);

  createEffect(() => {
    const c = chart();
    if (!c) return;

    let i = data[0][data[0].length - 1] + 1;
    const timer = window.setInterval(() => {
      const nextY = 50 + Math.sin(i / 12) * 18 + Math.cos(i / 5) * 4;
      c.appendData([new Float64Array([i]), new Float64Array([nextY])]);
      const stats = c.getStats();
      setLabel(
        `append ${stats.appendDataCount} · version ${stats.dataVersion} · ` +
          `draws g/d/o ${stats.renderCount.grid}/${stats.renderCount.data}/${stats.renderCount.overlay}`,
      );
      i++;
    }, 250);

    onCleanup(() => window.clearInterval(timer));
  });

  return (
    <div style={{ 'margin-top': '16px', 'margin-bottom': '20px' }}>
      <h3 style={{ 'font-size': 'var(--fs-sm)', 'font-weight': '600', 'margin-bottom': 'var(--space-1)' }}>
        Streaming diagnostics
      </h3>
      <p style={{ 'font-size': 'var(--fs-sm)', color: 'var(--text-secondary)', 'margin-bottom': '10px' }}>
        Fixed-window append benchmark using <code>getStats()</code>. The buffer caps at 500 points.
      </p>
      <div style={{ border: '1px solid var(--border)', 'border-radius': 'var(--radius-lg)', overflow: 'hidden', background: 'var(--bg-surface)' }}>
        <div style={{ height: '240px' }}>
          <Chart
            data={data}
            onReady={setChart}
            config={{
              debug: { stats: true },
              streaming: { maxLen: 500 },
              axes: { x: { type: 'linear' }, y: { type: 'linear' } },
              series: [{ label: 'stream', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2 }],
              tooltip: { show: true, mode: 'index' },
            }}
          />
        </div>
        <div style={{
          padding: '8px 12px',
          'border-top': '1px solid var(--border)',
          'font-size': '12px',
          color: 'var(--text-secondary)',
          'font-variant-numeric': 'tabular-nums',
        }}>
          {label()}
        </div>
      </div>
    </div>
  );
}
