import { createSignal } from 'solid-js';
import CodeBlock from '../../../components/CodeBlock';
import { Section, Prose, Demo } from '../../../components/ui';
import { timeSeries } from '../fixtures';
import { scrollTo } from '../Sidebar';

export default function Interactions() {
  const [d_interaction] = createSignal(timeSeries(400, 2));
  const [d_zoom] = createSignal(timeSeries(500, 2));
  const [d_pan] = createSignal(timeSeries(800, 2));
  const [d_cursor] = createSignal(timeSeries(300, 2));

  return (
    <>
      <Section id="interaction-modes" title="Interaction Modes">
        <Prose>
          Three interaction presets define default gesture-to-action mappings. Set via <code>interaction</code> on the config.
        </Prose>
        <div style={{
          'overflow-x': 'auto',
          'margin-bottom': '20px',
          border: '1px solid var(--border)',
          'border-radius': 'var(--radius-lg)',
        }}>
          <table style={{
            width: '100%',
            'border-collapse': 'collapse',
            'font-size': '13px',
            color: 'var(--text-secondary)',
          }}>
            <thead>
              <tr style={{ 'border-bottom': '1px solid var(--border)' }}>
                <th style={{ padding: '10px 12px', 'text-align': 'left', 'font-weight': '600', color: 'var(--text)' }}>Gesture</th>
                <th style={{ padding: '10px 12px', 'text-align': 'center', 'font-weight': '600', color: 'var(--text)' }}>timeseries</th>
                <th style={{ padding: '10px 12px', 'text-align': 'center', 'font-weight': '600', color: 'var(--text)' }}>analytical</th>
                <th style={{ padding: '10px 12px', 'text-align': 'center', 'font-weight': '600', color: 'var(--text)' }}>readonly</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Mouse drag', 'Box zoom', 'Box zoom', '\u2014'],
                ['Shift+drag', 'Pan', 'Pan', '\u2014'],
                ['Pinch', 'Zoom X', 'Zoom XY', '\u2014'],
                ['Touch drag', 'Cursor', 'Cursor', 'Cursor'],
                ['Double-tap+drag', 'Box zoom', 'Box zoom', '\u2014'],
                ['Tap', 'Tooltip', 'Tooltip', 'Tooltip'],
                ['Double-tap/click', 'Reset', 'Reset', '\u2014'],
                ['Scroll', 'Page', 'Page', 'Page'],
                ['Axis scroll', 'Opt-in', 'Opt-in', '\u2014'],
                ['Axis drag', 'Opt-in', 'Opt-in', '\u2014'],
              ].map(([gesture, ts, an, ro]) => (
                <tr style={{ 'border-bottom': '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', 'font-weight': '500' }}>{gesture}</td>
                  <td style={{ padding: '8px 12px', 'text-align': 'center' }}>{ts}</td>
                  <td style={{ padding: '8px 12px', 'text-align': 'center' }}>{an}</td>
                  <td style={{ padding: '8px 12px', 'text-align': 'center' }}>{ro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Prose>
          <b>Touch checks</b>: iOS Safari and Android Chrome should support one-finger cursor movement, two-finger pinch zoom, tap tooltip, double-tap reset, and double-tap-drag selection. Axis labels and tick gutters are inert unless explicitly enabled.
        </Prose>
        <Demo title="Interaction mode demo" desc="Change 'timeseries' to 'analytical' (enables Y zoom + XY pinch) or 'readonly' (tooltip only)"
          data={d_interaction()}
          code={`{
  interaction: 'timeseries',
  axes: { x: { type: 'time' }, y: { type: 'linear' } },
  series: [
    { label: 'Series A', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Series B', dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 2 },
  ],
  tooltip: { show: true, mode: 'index' },
}`} />
      </Section>

      <Section id="zoom" title="Zoom & Selection">
        <Prose>
          Drag to select a region to zoom into. For time series (<code>zoom.y: false</code>), the selection is a full-height band constraining only X.
          For scatter plots (<code>zoom.y: true</code>), you get a free rectangle selecting both axes. Drag endpoints are clamped to the plot rectangle, so releasing far outside the chart still zooms to within the data.
        </Prose>
        <Prose>
          <b>Double-click</b> (or double-tap) resets zoom to the full data extent.
          Use <code>minRange</code> and <code>maxRange</code> to set zoom limits. <code>wheelStep</code> controls the zoom fraction per max wheel / pinch tick (default <code>0.1</code>; <code>0</code> disables wheel zoom).
          When both axes are zoomable, touch pinch uses a uniform map/image-style 2D zoom by default; use <code>pinchMode: 'axis-lock'</code> for direction-based locking.
          Axis-gutter wheel zoom is opt-in with <code>zoom.axis: true</code>.
          The <code>onZoom</code> callback fires whenever the viewport changes.
        </Prose>
        <Prose>
          <b>Bounds</b>, by default, pan and zoom are clamped to the data extent so users can't navigate past the data. Override via <code>zoom.bounds</code>:
        </Prose>
        <CodeBlock code={`zoom: { bounds: true }                             // default (clamp X to data, Y unbounded)
zoom: { bounds: false }                            // or 'unbounded', classic infinite nav
zoom: { bounds: 'data' }                           // clamp every axis to data extent
zoom: { bounds: { x: 'data', y: 'unbounded' } }    // per-axis
zoom: { bounds: { x: { min: 0, max: 100 } } }      // custom hard walls`} />
        <Prose>
          Bounds are evaluated on every viewport change. Panning into the edge stops at the edge (range preserved); zoom-out past the full extent collapses to the full extent. The <code>'data'</code> bound tracks what <code>resetZoom()</code> would produce, including padding, any explicit <code>nice: true</code> expansion, and axis pins, so the zoom-out limit matches the initial view.
        </Prose>
        <Demo title="Zoom controls" desc="Drag to zoom, double-click to reset. Try zooming out past the edges, bounds prevent you from escaping the data."
          data={d_zoom()}
          code={`{
  axes: { x: { type: 'time' } },
  series: [
    { label: 'Throughput', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Latency', dataIndex: 2, type: 'area', interpolation: 'monotone', lineWidth: 1.5 },
  ],
  zoom: { enabled: true, x: true, y: false, wheelStep: 0.05, bounds: true },
  tooltip: { show: true, mode: 'index' },
}`} />
      </Section>

      <Section id="pan" title="Pan">
        <Prose>
          Enable panning with <code>pan: {'{ enabled: true, x: true, y: true }'}</code>. In the <code>timeseries</code> interaction mode, shift+drag activates pan. Axis-gutter panning is opt-in with <code>pan.axis: true</code>.
        </Prose>
        <Demo title="Pan demo" desc="Hold shift and drag to pan"
          data={d_pan()}
          code={`{
  axes: { x: { type: 'time' } },
  series: [
    { label: 'Series A', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Series B', dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 2 },
  ],
  zoom: { enabled: true, x: true },
  pan: { enabled: true, x: true, y: false },
  tooltip: { show: true, mode: 'index' },
}`} />
      </Section>

      <Section id="cursor" title="Cursor & Crosshair">
        <Prose>
          Configure the cursor crosshair with <code>cursor</code>. Options include <code>show</code>, <code>snap</code> (snap to nearest data point),
          <code>xLine</code>/<code>yLine</code> (toggle each crosshair line), <code>color</code>, <code>dash</code> (dash pattern array), and <code>indicators</code> (the per-series dot+ring drawn at each hit-tested point on hover, disable when a legend table already shows the values).
        </Prose>
        <Prose>
          <b>Cross-chart cursor sync:</b> set the same <code>cursor.syncKey</code> on multiple charts to synchronize their crosshair positions. See also{' '}
          <button
            type="button"
            onClick={() => scrollTo('cross-chart-sync')}
            style={{
              background: 'none', border: 'none', padding: '0',
              color: 'var(--accent)', cursor: 'pointer', font: 'inherit',
            }}
          >Cross-chart Sync</button>{' '}
          for a more ergonomic one-line helper that bundles cursor + highlight sync together.
        </Prose>
        <Demo title="Crosshair config" desc="Try disabling indicators, or enabling yLine"
          data={d_cursor()}
          code={`{
  axes: { x: { type: 'time' } },
  series: [
    { label: 'Series A', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Series B', dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 2 },
  ],
  cursor: { show: true, snap: true, xLine: true, yLine: false, dash: [4, 3], indicators: true },
  tooltip: { show: true, mode: 'index' },
}`} />
      </Section>

      <Section id="touch" title="Touch Gestures">
        <Prose>Touch-specific interaction behaviors:</Prose>
        <ul style={{ color: 'var(--text-secondary)', 'font-size': '14.5px', 'line-height': '1.7', 'margin-bottom': '16px', 'padding-left': '20px' }}>
          <li><b>One-finger drag</b>, move the cursor and tooltip by default; set <code>drag: 'pan'</code> for one-finger panning</li>
          <li><b>Two-finger pinch</b>, zoom (X-only in timeseries mode, uniform XY in analytical mode). Direction-based axis locking is opt-in.</li>
          <li><b>Double-tap + drag</b>, activates box selection or box zoom when selection is enabled</li>
          <li><b>Tap</b>, shows tooltip at the nearest data point</li>
          <li><b>Double-tap</b>, resets zoom to full data extent</li>
          <li><b>Long-press + drag</b>, available only with <code>selectionGesture: 'long-press'</code></li>
        </ul>
        <Prose>
          Configure touch behavior with the <code>touch</code> config:
        </Prose>
        <CodeBlock code={`touch: {
  hitRadius: 44,    // CSS pixels. Defaults: 44 for touch, 32 for mouse
                    // (per WCAG 2.5.5). Set here to override both.
  drag: 'cursor',   // or 'pan' for one-finger panning
  selectionGesture: 'double-tap-drag', // default unless drag is 'pan';
                                       // use 'long-press' or 'none' as needed
}`} />
      </Section>
    </>
  );
}
