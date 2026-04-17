import { createSignal } from 'solid-js';
import CodeBlock from '../../../components/CodeBlock';
import { Section, Prose, Demo } from '../../../components/ui';
import { timeSeries } from '../fixtures';

export default function Theming() {
  const [d_theme] = createSignal(timeSeries(200, 2));
  const [d_css_vars] = createSignal(timeSeries(200, 2));

  return (
    <>
      <Section id="themes-builtin" title="Built-in Themes">
        <Prose>The library ships with a curated set of themes, each hand-tuned (palette + background + grid + border chosen together). Dark: <code>darkTheme</code> (slate), <code>oceanTheme</code>, <code>forestTheme</code>, <code>sunsetTheme</code>, <code>violetTheme</code>. Light: <code>lightTheme</code> (paper), <code>fogTheme</code>, <code>ivoryTheme</code>, <code>mintTheme</code>. Back-compat: <code>midnightTheme</code>, <code>marsTheme</code>, <code>refinedDarkTheme</code>. Pass any as the <code>theme</code> property.</Prose>
        <Demo title="Theme switcher" desc="Swap oceanTheme for violetTheme, forestTheme, sunsetTheme, fogTheme, ivoryTheme, mintTheme, darkTheme, or lightTheme"
          data={d_theme()}
          code={`{
  theme: oceanTheme,
  axes: { x: { type: 'time' } },
  series: [
    { label: 'Series A', dataIndex: 1, type: 'area', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Series B', dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 1.5 },
  ],
  tooltip: { show: true, mode: 'index' },
}`} />
      </Section>

      <Section id="themes-custom" title="Custom Theme">
        <Prose>
          Create a custom theme by providing a partial <code>ThemeConfig</code> object. Any properties you omit will fall back to the resolved defaults (CSS variables or the built-in dark theme).
        </Prose>
        <CodeBlock code={`interface ThemeConfig {
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  fontSize: number;
  gridColor: string;
  gridOpacity: number;
  palette: string[];          // series color cycle
  axisLineColor: string;
  borderColor: string;        // plot-area frame
  borderOpacity: number;      // independent of gridOpacity
  tickColor: string;
  crosshairColor: string;
  tooltipBackground: string;
  tooltipTextColor: string;
  tooltipBorderColor: string;
}`} />
        <div style={{ height: '12px' }} />
        <Demo title="Custom palette theme" desc="Edit the palette colors or other theme properties"
          data={d_theme()}
          code={`{
  theme: {
    backgroundColor: '#1a1a2e',
    textColor: '#e0e0e8',
    gridColor: '#2a2a4a',
    palette: ['#e74c3c', '#f39c12', '#2ecc71', '#3498db', '#9b59b6'],
    crosshairColor: '#888',
    tooltipBackground: 'rgba(20, 20, 40, 0.95)',
    tooltipTextColor: '#eee',
  },
  axes: { x: { type: 'time' } },
  series: [
    { label: 'Series A', dataIndex: 1, type: 'area', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Series B', dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 2 },
  ],
  tooltip: { show: true, mode: 'index' },
}`} />
      </Section>

      <Section id="css-vars" title="CSS Variables">
        <Prose>
          When no explicit <code>theme</code> is set in the config, the chart reads CSS custom properties from the container element.
          This integrates naturally with your site's dark/light mode toggle.
        </Prose>
        <CodeBlock code={`:root {
  --chart-bg: #0a0a1a;
  --chart-text: #e0e0e8;
  --chart-grid: #2a2b3d;
  --chart-axis: #555570;
}`} />
        <div style={{ height: '12px' }} />
        <Prose>
          The <code>resolveTheme()</code> function reads these variables at chart creation and on each redraw.
          If a variable is missing, it falls back to the built-in dark theme default. This means every chart on the page inherits your site's
          colors automatically — no per-chart theme config needed.
        </Prose>
        <Demo title="CSS variable theming (no explicit theme)" desc="This chart reads colors from the site's CSS variables"
          data={d_css_vars()}
          code={`{
  axes: { x: { type: 'time' } },
  series: [
    { label: 'Series A', dataIndex: 1, type: 'area', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Series B', dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 1.5 },
  ],
  tooltip: { show: true, mode: 'index' },
}`} />
      </Section>
    </>
  );
}
