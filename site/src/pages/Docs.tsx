import { Prose } from '../components/ui';
import { Sidebar } from './docs/Sidebar';
import {
  GettingStarted,
  ChartTypes,
  SeriesOptions,
  Scales,
  Interactions,
  Tooltips,
  Theming,
  Data,
  Plugins,
  ApiReference,
} from './docs/sections';
// In dev/build the site aliases `snaplot` → src/index.ts, so we import the CSS
// directly from the package source. Published consumers use `'snaplot/legend-table.css'`.
import '../../../packages/snaplot/src/styles/legendTable.css';

export default function Docs() {
  return (
    <div style={{ display: 'flex', 'max-width': 'var(--max-width)', margin: '0 auto', padding: '48px 24px 80px', gap: '48px' }}>
      <Sidebar />

      {/* Content */}
      <div style={{ flex: '1', 'min-width': '0' }}>
        <h1 style={{ 'font-size': '28px', 'font-weight': '700', 'margin-bottom': '8px' }}>Documentation</h1>
        <Prose>
          Every example below is <b>live and editable</b> — change the config and the chart updates instantly.
          Built-in theme variables are available in the editor: <code>lightTheme</code>, <code>darkTheme</code>, <code>oceanTheme</code>, <code>marsTheme</code>, <code>forestTheme</code>, <code>sunsetTheme</code>, <code>midnightTheme</code>, <code>refinedDarkTheme</code>.
        </Prose>

        <GettingStarted />
        <ChartTypes />
        <SeriesOptions />
        <Scales />
        <Interactions />
        <Tooltips />
        <Theming />
        <Data />
        <Plugins />
        <ApiReference />
      </div>
    </div>
  );
}
