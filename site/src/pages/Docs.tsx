import { Prose } from '../components/ui';
import { Sidebar, scrollTo } from './docs/Sidebar';
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
          Every example below is <b>live and editable</b>. Change the config and the chart updates instantly.
        </Prose>
        <Prose>
          <b>Driving the demos:</b> drag inside a chart to box-zoom, pinch or cmd-scroll over the plot to zoom, shift+drag to pan, double-click to reset, hover for tooltips. Axis controls are opt-in. Full reference under{' '}
          <button
            type="button"
            onClick={() => scrollTo('interaction-modes')}
            style={{
              background: 'none', border: 'none', padding: '0',
              color: 'var(--accent)', cursor: 'pointer', font: 'inherit',
            }}
          >Interactions</button>.
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
