import { createSignal, createMemo, onCleanup } from 'solid-js';
import { Chart, darkTheme, lightTheme } from 'snaplot';
import type { ColumnarData, ChartConfig, ChartInstance } from 'snaplot';
import CodeBlock from '../components/CodeBlock';
import { useTheme } from '../ThemeContext';

function generateHeroData(points: number): ColumnarData {
  const now = Date.now();
  const x = new Float64Array(points);
  const y1 = new Float64Array(points);
  const y2 = new Float64Array(points);
  for (let i = 0; i < points; i++) {
    x[i] = now - (points - i) * 60_000;
    const t = i / points;
    y1[i] = 50 + 25 * Math.sin(t * Math.PI * 4) + 8 * Math.sin(t * Math.PI * 13) + (Math.random() - 0.5) * 5;
    y2[i] = 35 + 20 * Math.cos(t * Math.PI * 3 + 1) + 6 * Math.sin(t * Math.PI * 9) + (Math.random() - 0.5) * 5;
  }
  return [x, y1, y2];
}

const quickExample = `import { Chart } from 'snaplot';

const data = [
  new Float64Array(timestamps),  // X: sorted timestamps
  new Float64Array(cpuValues),   // Y: series 1
  new Float64Array(memValues),   // Y: series 2
];

<Chart
  config={{
    axes: { x: { type: 'time' }, y: { type: 'linear' } },
    series: [
      { label: 'CPU %', dataIndex: 1, type: 'line' },
      { label: 'Memory %', dataIndex: 2, type: 'area' },
    ],
  }}
  data={data}
/>`;

const features = [
  { icon: '5', title: 'Chart Types', desc: 'Line, area, scatter, bar, histogram with smooth interpolation and density heatmaps' },
  { icon: '60', title: 'fps Streaming', desc: 'Canvas rendering with rAF batching, viewport culling, and layered dirty-flag updates' },
  { icon: '0', title: 'Dependencies', desc: 'Zero runtime deps. Under 20KB gzipped. Just snaplot and solid-js.' },
  { icon: '2D', title: 'Interactions', desc: 'Drag-to-zoom, pinch, proximity tooltips, cross-chart cursor sync, double-click reset' },
];

export default function Home() {
  const [heroData] = createSignal(generateHeroData(300));
  let heroChart: ChartInstance | undefined;
  const { theme } = useTheme();

  // Theme-reactive hero config. Returning a new config object when theme()
  // flips triggers `<Chart>`'s createEffect → setOptions(), which re-resolves
  // the theme and redraws the canvas. Without this accessor the hero stayed
  // dark even when the page was in light mode.
  const heroConfig = createMemo<ChartConfig>(() => ({
    theme: {
      ...(theme() === 'light' ? lightTheme : darkTheme),
      gridOpacity: 0.25,
    },
    axes: { x: { type: 'time' }, y: { type: 'linear' } },
    series: [
      { label: 'Throughput', dataIndex: 1, type: 'area', interpolation: 'monotone', lineWidth: 2, stroke: '#4f8fea' },
      { label: 'Latency', dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 1.5, stroke: '#e69f00' },
    ],
    cursor: { show: true },
    zoom: { enabled: true, x: true },
    tooltip: { show: true, mode: 'index' },
    padding: { top: 20, right: 20, bottom: 36, left: 48 },
  }));

  const interval = setInterval(() => {
    if (!heroChart) return;
    const d = heroChart.getData();
    const x = d[0]; if (x.length === 0) return;
    const last = x[x.length - 1];
    heroChart.appendData([
      new Float64Array([last + 60_000]),
      new Float64Array([d[1][x.length - 1] + (Math.random() - 0.5) * 8]),
      new Float64Array([d[2][x.length - 1] + (Math.random() - 0.5) * 6]),
    ] as ColumnarData);
  }, 1500);
  onCleanup(() => clearInterval(interval));

  return (
    <main>
      {/* Hero */}
      <section style={{
        position: 'relative',
        padding: '80px 24px 0',
        'max-width': 'var(--max-width)',
        margin: '0 auto',
      }}>
        <div style={{ 'text-align': 'center', 'margin-bottom': '48px' }}>
          <h1 style={{
            'font-size': 'clamp(32px, 5vw, 52px)',
            'font-weight': '700',
            'letter-spacing': '-0.03em',
            'line-height': '1.15',
            'margin-bottom': '16px',
          }}>
            High-performance charts{' '}
            <span style={{ color: 'var(--accent)' }}>for SolidJS</span>
          </h1>
          <p style={{
            'font-size': '17px',
            color: 'var(--text-secondary)',
            'max-width': '560px',
            margin: '0 auto 32px',
            'line-height': '1.6',
          }}>
            Canvas-based chart library built for interactive realtime dashboards.
            Columnar typed arrays, layered rendering, zero dependencies.
          </p>
          <div style={{ display: 'flex', gap: '12px', 'justify-content': 'center', 'flex-wrap': 'wrap' }}>
            <a href="#/docs" style={{
              background: 'var(--accent)',
              color: '#fff',
              padding: '10px 24px',
              'border-radius': '8px',
              'font-weight': '600',
              'font-size': '14px',
              transition: 'background 0.15s',
            }}>
              Get Started
            </a>
            <a href="https://github.com/liamclarkza/snaplot" target="_blank" rel="noopener" style={{
              background: 'rgba(255,255,255,0.06)',
              color: 'var(--text)',
              padding: '10px 24px',
              'border-radius': '8px',
              'font-weight': '600',
              'font-size': '14px',
              border: '1px solid var(--border)',
            }}>
              GitHub
            </a>
          </div>
        </div>

        {/* Hero chart */}
        <div style={{
          // Responsive height: portrait mobile shrinks gracefully, desktop
          // keeps the generous reading height.
          height: 'clamp(240px, 40vh, 320px)',
          'border-radius': 'var(--radius-lg)',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          'margin-bottom': '48px',
        }}>
          <Chart config={heroConfig()} data={heroData()} onReady={(c) => { heroChart = c; }} />
        </div>

        {/* Install */}
        <div style={{
          'max-width': '440px',
          margin: '0 auto 64px',
        }}>
          <CodeBlock code="npm install snaplot" />
        </div>
      </section>

      {/* Features */}
      <section style={{
        padding: '0 24px 64px',
        'max-width': 'var(--max-width)',
        margin: '0 auto',
      }}>
        <div style={{
          display: 'grid',
          'grid-template-columns': 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px',
        }}>
          {features.map(f => (
            <div style={{
              background: 'var(--bg-surface)',
              'border-radius': 'var(--radius-lg)',
              padding: 'var(--space-5)',
              // Elevation via layered shadow + inner top highlight — no 1px
              // border, per the design guide (pick one signal for depth).
              'box-shadow': 'var(--elev-1-inset), var(--elev-1-shadow)',
            }}>
              <div style={{
                'font-size': '28px',
                'font-weight': '700',
                color: 'var(--accent)',
                'margin-bottom': '8px',
                'font-variant-numeric': 'tabular-nums',
              }}>
                {f.icon}
              </div>
              <div style={{ 'font-weight': '600', 'margin-bottom': '6px', 'font-size': '15px' }}>
                {f.title}
              </div>
              <div style={{ color: 'var(--text-secondary)', 'font-size': '13px', 'line-height': '1.5' }}>
                {f.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Quick example */}
      <section style={{
        padding: '0 24px 80px',
        'max-width': 'var(--max-width)',
        margin: '0 auto',
      }}>
        <h2 style={{
          'font-size': '24px',
          'font-weight': '700',
          'margin-bottom': '16px',
          'text-align': 'center',
        }}>
          Simple API, powerful output
        </h2>
        <p style={{
          color: 'var(--text-secondary)',
          'text-align': 'center',
          'margin-bottom': '24px',
          'font-size': '15px',
        }}>
          Columnar Float64Arrays in, interactive canvas chart out. One component.
        </p>
        <CodeBlock code={quickExample} lang="tsx" />
      </section>
    </main>
  );
}
