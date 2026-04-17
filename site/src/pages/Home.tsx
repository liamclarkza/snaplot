import CodeBlock from '../components/CodeBlock';
import { Card, Button } from '../components/ui';
import HeroDashboard from '../components/HeroDashboard';

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
          <div style={{ display: 'flex', gap: 'var(--space-3)', 'justify-content': 'center', 'flex-wrap': 'wrap' }}>
            <Button href="#/docs" variant="primary">Get Started</Button>
            <Button href="https://github.com/liamclarkza/snaplot" target="_blank" rel="noopener" variant="secondary">GitHub</Button>
          </div>
        </div>

        {/* Hero dashboard — theme-switchable, multi-panel showcase */}
        <div style={{ 'margin-bottom': '48px' }}>
          <HeroDashboard />
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
            <Card>
              <div style={{
                'font-size': 'var(--fs-xl)',
                'font-weight': '700',
                color: 'var(--accent)',
                'margin-bottom': 'var(--space-2)',
                'font-variant-numeric': 'tabular-nums',
              }}>
                {f.icon}
              </div>
              <div style={{ 'font-weight': '600', 'margin-bottom': '6px', 'font-size': 'var(--fs-base)' }}>
                {f.title}
              </div>
              <div style={{ color: 'var(--text-secondary)', 'font-size': 'var(--fs-sm)', 'line-height': '1.5' }}>
                {f.desc}
              </div>
            </Card>
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
