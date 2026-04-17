import { createSignal, createMemo, onCleanup } from 'solid-js';
import { Chart, createLegendPlugin, darkTheme, lightTheme } from 'snaplot';
import type { ColumnarData, ChartConfig, ChartInstance } from 'snaplot';
import CodeBlock from '../components/CodeBlock';
import { Button } from '../components/ui';
import { useTheme } from '../ThemeContext';

/**
 * One "day of a developer" — coffee intake paired with bug fixes,
 * observed hourly. The shape tells the joke: morning ramp, post-lunch
 * dip, evening second wind, midnight crash. Fake data, real pattern.
 *
 * The jitter() pass on an interval keeps the chart subtly alive
 * without pretending to stream real data — it's a nod to the fact
 * that the library repaints at 60 fps on any `setData` call.
 */
function generateCoffeeBugs(): ColumnarData {
  const hours = 24;
  const base = new Date();
  base.setHours(0, 0, 0, 0);

  // Hand-tuned curves so the shape actually looks like a day, not noise.
  // Coffee cups per hour: peak 8–10am, smaller 2pm bump, decline after 6.
  const coffeeHourly = [
    0, 0, 0, 0, 0, 0, 0.2, 1.4, 2.1, 2.6, 1.7, 1.0,
    0.6, 1.6, 2.2, 1.1, 0.9, 0.5, 0.3, 0.2, 0.1, 0.4, 0.7, 0.2,
  ];
  // Bugs fixed per hour: ~90 min lag behind coffee, crash after 5pm,
  // small "I just need to finish this" spike around 22:00.
  const bugsHourly = [
    0, 0, 0, 0, 0, 0, 0, 0.3, 1.6, 3.2, 4.2, 3.6,
    1.4, 2.6, 4.1, 3.1, 2.3, 1.4, 0.9, 0.6, 0.5, 1.3, 0.8, 0.1,
  ];

  const x = new Float64Array(hours);
  const coffee = new Float64Array(hours);
  const bugs = new Float64Array(hours);
  for (let i = 0; i < hours; i++) {
    x[i] = base.getTime() + i * 3_600_000;
    coffee[i] = coffeeHourly[i];
    bugs[i] = bugsHourly[i];
  }
  return [x, coffee, bugs];
}

const heroCode = `import { Chart, createLegendPlugin } from 'snaplot';

<Chart
  config={{
    axes: { x: { type: 'time' } },
    series: [
      { label: 'Coffee (cups)', dataIndex: 1, type: 'area', interpolation: 'monotone' },
      { label: 'Bugs fixed',    dataIndex: 2, type: 'line', interpolation: 'monotone' },
    ],
    tooltip: { show: true, mode: 'index' },
    plugins: [createLegendPlugin({ position: 'bottom' })],
  }}
  data={[times, coffee, bugs]}
/>`;

type Stat = { value: string; label: string };
const stats: Stat[] = [
  { value: '200K+', label: 'points, 60 fps' },
  { value: '< 20', label: 'kB gzipped' },
  { value: '0',    label: 'runtime deps' },
  { value: '5',    label: 'lines to a chart' },
];

export default function Home() {
  const [chartData, setChartData] = createSignal(generateCoffeeBugs());
  let heroChart: ChartInstance | undefined;
  const { theme } = useTheme();

  const heroConfig = createMemo<ChartConfig>(() => ({
    theme: theme() === 'light' ? lightTheme : darkTheme,
    axes: {
      x: { type: 'time' },
      y: { type: 'linear', min: 0 },
    },
    series: [
      { label: 'Coffee (cups)', dataIndex: 1, type: 'area', interpolation: 'monotone', lineWidth: 2 },
      { label: 'Bugs fixed',    dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 2 },
    ],
    cursor: { show: true },
    zoom: { enabled: true, x: true },
    tooltip: { show: true, mode: 'index' },
    padding: { top: 24, right: 24, bottom: 36, left: 48 },
    plugins: [createLegendPlugin({ position: 'bottom' })],
  }));

  // Subtle aliveness — re-jitter the curves every 2.5s so a cursor
  // on the page isn't sitting on a frozen screenshot. Repaints cost
  // ~0.1ms; we could do this every frame and nobody would notice.
  const interval = setInterval(() => {
    setChartData((prev) => {
      const [x, c, b] = prev;
      const nc = new Float64Array(c.length);
      const nb = new Float64Array(b.length);
      for (let i = 0; i < c.length; i++) {
        nc[i] = Math.max(0, c[i] * (1 + (Math.random() - 0.5) * 0.08));
        nb[i] = Math.max(0, b[i] * (1 + (Math.random() - 0.5) * 0.08));
      }
      return [x, nc, nb];
    });
    heroChart?.setData(chartData());
  }, 2500);
  onCleanup(() => clearInterval(interval));

  return (
    <main>
      {/* Hero */}
      <section
        style={{
          padding: 'var(--space-9) var(--space-5) var(--space-6)',
          'max-width': 'var(--max-width)',
          margin: '0 auto',
          'text-align': 'center',
        }}
      >
        <h1
          style={{
            'font-size': 'clamp(36px, 6vw, 64px)',
            'font-weight': 700,
            'letter-spacing': '-0.035em',
            'line-height': 1.05,
            'margin-bottom': 'var(--space-4)',
          }}
        >
          200K points.{' '}
          <span style={{ color: 'var(--accent)' }}>60 fps.</span>{' '}
          20 kB.
        </h1>
        <p
          style={{
            'font-size': 'var(--fs-md)',
            color: 'var(--text-secondary)',
            'max-width': '560px',
            margin: '0 auto var(--space-5)',
            'line-height': 1.55,
          }}
        >
          A canvas chart library that ships bytes, not opinions. Columnar typed
          arrays in, interactive plots out — no wrapper tax.
        </p>
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            'justify-content': 'center',
            'flex-wrap': 'wrap',
          }}
        >
          <Button href="#/docs" variant="primary">Get started</Button>
          <Button href="#/demos" variant="secondary">Explore themes</Button>
          <Button
            href="https://github.com/liamclarkza/snaplot"
            target="_blank"
            rel="noopener"
            variant="secondary"
          >
            GitHub
          </Button>
        </div>
      </section>

      {/* Hero chart — a quietly funny panel */}
      <section
        style={{
          padding: '0 var(--space-5)',
          'max-width': 'var(--max-width)',
          margin: '0 auto var(--space-7)',
        }}
      >
        <ChartPanel>
          <div
            style={{
              padding: 'var(--space-4) var(--space-5) 0',
              display: 'flex',
              'align-items': 'baseline',
              'justify-content': 'space-between',
              gap: 'var(--space-4)',
              'flex-wrap': 'wrap',
            }}
          >
            <div>
              <div
                style={{
                  'font-size': 'var(--fs-base)',
                  'font-weight': 600,
                  'letter-spacing': '-0.01em',
                }}
              >
                Coffee intake vs bugs fixed
              </div>
              <div
                style={{
                  'font-size': 'var(--fs-xs)',
                  color: 'var(--text-secondary)',
                  'margin-top': '2px',
                }}
              >
                A working hypothesis — n = 1, tested daily
              </div>
            </div>
            <div
              style={{
                'font-size': 'var(--fs-xs)',
                color: 'var(--text-secondary)',
                'font-variant-numeric': 'tabular-nums',
              }}
            >
              drag to zoom · hover to inspect · double-click to reset
            </div>
          </div>
          <div style={{ height: 'clamp(280px, 44vh, 380px)', padding: '8px 0 4px' }}>
            <Chart config={heroConfig()} data={chartData()} onReady={(c) => { heroChart = c; }} />
          </div>
          <div
            style={{
              padding: '0 var(--space-5) var(--space-4)',
              'font-size': 'var(--fs-xs)',
              color: 'var(--text-secondary)',
              'font-style': 'italic',
              'text-align': 'center',
            }}
          >
            Correlation ≠ causation. Try telling me that at 9 am.
          </div>
        </ChartPanel>
      </section>

      {/* Stats strip — big numbers, small captions */}
      <section
        style={{
          padding: '0 var(--space-5) var(--space-8)',
          'max-width': 'var(--max-width)',
          margin: '0 auto',
        }}
      >
        <div
          style={{
            display: 'grid',
            'grid-template-columns': 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 'var(--space-5)',
            padding: 'var(--space-5) var(--space-4)',
            'border-top': '1px solid var(--border)',
            'border-bottom': '1px solid var(--border)',
          }}
        >
          {stats.map((s) => (
            <div style={{ 'text-align': 'center' }}>
              <div
                style={{
                  'font-size': 'var(--fs-2xl)',
                  'font-weight': 700,
                  'letter-spacing': '-0.02em',
                  'font-variant-numeric': 'tabular-nums',
                  color: 'var(--text)',
                  'line-height': 1.1,
                }}
              >
                {s.value}
              </div>
              <div
                style={{
                  'font-size': 'var(--fs-sm)',
                  color: 'var(--text-secondary)',
                  'margin-top': 'var(--space-1)',
                }}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Code — "here's the chart above" */}
      <section
        style={{
          padding: '0 var(--space-5) var(--space-8)',
          'max-width': 'var(--max-width)',
          margin: '0 auto',
        }}
      >
        <div
          style={{
            'text-align': 'center',
            'margin-bottom': 'var(--space-5)',
          }}
        >
          <h2
            style={{
              'font-size': 'var(--fs-xl)',
              'font-weight': 700,
              'letter-spacing': '-0.02em',
              'margin-bottom': 'var(--space-2)',
            }}
          >
            The chart above, in ten lines
          </h2>
          <p
            style={{
              color: 'var(--text-secondary)',
              'font-size': 'var(--fs-base)',
              'max-width': '520px',
              margin: '0 auto',
            }}
          >
            No wrapper components, no config trees. Pass Float64Arrays,
            describe series, ship.
          </p>
        </div>
        <CodeBlock code={heroCode} lang="tsx" />
      </section>

      {/* CTA strip */}
      <section
        style={{
          padding: '0 var(--space-5) var(--space-9)',
          'max-width': 'var(--max-width)',
          margin: '0 auto',
          'text-align': 'center',
        }}
      >
        <div
          style={{
            'font-size': 'var(--fs-md)',
            color: 'var(--text-secondary)',
            'margin-bottom': 'var(--space-4)',
          }}
        >
          Nine built-in themes. Line, area, scatter, bar, histogram, band, density heatmap.
          All reactive, all interactive, all tiny.
        </div>
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            'justify-content': 'center',
            'flex-wrap': 'wrap',
          }}
        >
          <Button href="#/demos" variant="primary">See it live</Button>
          <Button href="#/docs" variant="secondary">Read the docs</Button>
        </div>
      </section>
    </main>
  );
}

/**
 * Soft-UI panel wrapping the hero chart. Matches the /demos aesthetic:
 * background = chart canvas colour (no seam at the chart edge), depth
 * from inset top highlight + ambient shadow, no hard border.
 */
function ChartPanel(props: { children: any }) {
  return (
    <div
      style={{
        background: 'var(--chart-bg)',
        'border-radius': 'var(--radius-lg)',
        'box-shadow': 'var(--elev-1-inset), var(--elev-1-shadow)',
        overflow: 'hidden',
      }}
    >
      {props.children}
    </div>
  );
}
