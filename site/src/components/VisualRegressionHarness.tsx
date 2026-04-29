import { Chart } from 'snaplot';
import type { ChartConfig, ColumnarData } from 'snaplot';
import type { JSX } from 'solid-js';

const f = (xs: number[]) => Float64Array.from(xs);

function gapData(): ColumnarData {
  return [
    f([0, 1, 2, 3, 4, 5, 6, 7]),
    f([10, 14, NaN, NaN, 18, 16, 20, 17]),
    f([12, 15, NaN, NaN, 16, 18, 19, 18]),
    f([8, 10, NaN, NaN, 12, 13, 15, 14]),
  ];
}

function heatmapData(points = 18_000): ColumnarData {
  const x = new Float64Array(points);
  const y = new Float64Array(points);
  for (let i = 0; i < points; i++) {
    const t = i / points;
    x[i] = t * 100;
    y[i] = 50 + Math.sin(t * Math.PI * 16) * 22 + Math.cos(i * 0.17) * 8;
  }
  return [x, y];
}

function multiAxisData(): ColumnarData {
  const points = 160;
  const x = new Float64Array(points);
  const a = new Float64Array(points);
  const b = new Float64Array(points);
  for (let i = 0; i < points; i++) {
    x[i] = i;
    a[i] = 50 + Math.sin(i / 12) * 20;
    b[i] = 800 + Math.cos(i / 9) * 180;
  }
  return [x, a, b];
}

const areaBandConfig: ChartConfig = {
  axes: { x: { type: 'linear', nice: false }, y: { type: 'linear' } },
  series: [
    { label: 'area gaps', dataIndex: 1, type: 'area', lineWidth: 2 },
    {
      label: 'band gaps',
      dataIndex: 1,
      upperDataIndex: 2,
      lowerDataIndex: 3,
      type: 'band',
      opacity: 0.18,
      lineWidth: 1.5,
    },
  ],
  tooltip: { show: true, mode: 'index' },
};

const heatmapConfig: ChartConfig = {
  axes: { x: { type: 'linear', nice: false }, y: { type: 'linear', nice: false } },
  series: [{ label: 'density', dataIndex: 1, type: 'scatter', heatmap: true, heatmapBinSize: 2 }],
  tooltip: { show: false },
};

const multiAxisConfig: ChartConfig = {
  axes: {
    x: { type: 'linear', nice: false },
    y: { type: 'linear', position: 'left' },
    y2: { type: 'linear', position: 'right' },
  },
  series: [
    { label: 'left axis', dataIndex: 1, type: 'line', yAxisKey: 'y', lineWidth: 2 },
    { label: 'right axis', dataIndex: 2, type: 'line', yAxisKey: 'y2', lineWidth: 2 },
  ],
  tooltip: { show: true, mode: 'index' },
};

function Panel(props: { title: string; children: JSX.Element }) {
  return (
    <section>
      <h3 style={{ 'font-size': '13px', 'font-weight': 650, margin: '0 0 8px' }}>{props.title}</h3>
      <div style={{ height: '220px', border: '1px solid var(--border)', 'border-radius': '8px', overflow: 'hidden' }}>
        {props.children}
      </div>
    </section>
  );
}

export default function VisualRegressionHarness() {
  return (
    <section style={{ padding: '32px clamp(16px, 4vw, 48px)', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ 'max-width': '1180px', margin: '0 auto' }}>
        <h2 style={{ 'font-size': '18px', 'font-weight': 700, margin: '0 0 8px' }}>
          Visual Regression Fixtures
        </h2>
        <p style={{ margin: '0 0 18px', color: 'var(--text-secondary)', 'font-size': '13px' }}>
          Deterministic charts for manual screenshot checks of renderer edge cases.
        </p>
        <div style={{
          display: 'grid',
          'grid-template-columns': 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '18px',
        }}>
          <Panel title="Area and band gaps">
            <Chart data={gapData()} config={areaBandConfig} />
          </Panel>
          <Panel title="Scatter heatmap cache">
            <Chart data={heatmapData()} config={heatmapConfig} />
          </Panel>
          <Panel title="Multi-axis lines">
            <Chart data={multiAxisData()} config={multiAxisConfig} />
          </Panel>
        </div>
      </div>
    </section>
  );
}
