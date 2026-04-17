import { createSignal } from 'solid-js';
import { Section, Prose, Demo } from '../../../components/ui';
import { timeSeries, scatterData } from '../fixtures';

export default function Tooltips() {
  const [d_tooltip_mode] = createSignal(timeSeries(200, 3));
  const [d_tooltip_custom] = createSignal(timeSeries(200, 2));
  const [d_tooltip_snap] = createSignal(scatterData(500));

  return (
    <>
      <Section id="tooltip-modes" title="Tooltip Modes">
        <Prose>Three tooltip modes determine how points are selected when the cursor moves:</Prose>
        <ul style={{ color: 'var(--text-secondary)', 'font-size': '14.5px', 'line-height': '1.7', 'margin-bottom': '16px', 'padding-left': '20px' }}>
          <li><code>'index'</code>, shows all series at the same X position. Best for time series where all series share an X axis.</li>
          <li><code>'nearest'</code>, shows the single closest point by euclidean (pixel) distance. Best for scatter plots.</li>
          <li><code>'x'</code>, shows all series at the nearest X value. Similar to index but matches by X data value rather than index.</li>
        </ul>
        <Prose>Tooltips are DOM elements (<code>position: fixed</code>), not canvas, better text rendering, no clipping, and easy styling.</Prose>
        <Demo title="Tooltip mode demo" desc="Change mode to 'nearest' or 'x'"
          data={d_tooltip_mode()}
          code={`{
  axes: { x: { type: 'time' } },
  series: [
    { label: 'CPU', dataIndex: 1, type: 'line', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Memory', dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Disk', dataIndex: 3, type: 'line', interpolation: 'monotone', lineWidth: 1.5 },
  ],
  tooltip: { show: true, mode: 'index' },
}`} />
      </Section>

      <Section id="tooltip-custom" title="Custom Tooltip Renderer">
        <Prose>
          Pass a <code>tooltip.render</code> function for full control over tooltip content.
          It receives an array of <code>TooltipPoint</code> objects and should return an HTML string or an <code>HTMLElement</code>.
        </Prose>
        <Demo title="Custom tooltip HTML" desc="Edit the render function to change tooltip formatting"
          data={d_tooltip_custom()}
          code={`{
  axes: { x: { type: 'time' } },
  series: [
    { label: 'Revenue', dataIndex: 1, type: 'area', interpolation: 'monotone', lineWidth: 2 },
    { label: 'Cost', dataIndex: 2, type: 'line', interpolation: 'monotone', lineWidth: 2 },
  ],
  tooltip: {
    show: true,
    mode: 'index',
    render: (points) =>
      '<div style="font-size:12px">' +
      points.map(p =>
        '<div style="display:flex;gap:8px;align-items:center">' +
        '<span style="width:8px;height:8px;border-radius:50%;background:' + p.color + '"></span>' +
        '<span>' + p.label + '</span>' +
        '<b style="margin-left:auto">$' + Number(p.formattedY).toFixed(1) + '</b>' +
        '</div>'
      ).join('') +
      '</div>',
  },
}`} />
        <Prose>Each <code>TooltipPoint</code> contains: <code>seriesIndex</code>, <code>dataIndex</code>, <code>label</code>, <code>x</code>, <code>y</code>, <code>color</code>, <code>formattedX</code>, <code>formattedY</code>.</Prose>
      </Section>

      <Section id="tooltip-snap" title="Proximity & Snap">
        <Prose>
          <b>Proximity gating:</b> the tooltip only appears when the cursor is within 32px of a data point. Move further away and only the crosshair remains. This prevents tooltip clutter in sparse regions of the chart.
        </Prose>
        <Prose>
          <b>Cursor snap:</b> when <code>cursor.snap</code> is <code>true</code>, the crosshair snaps to the nearest data point rather than following the raw mouse position. This makes it easier to inspect exact values.
        </Prose>
        <Demo title="Proximity and snap" desc="Move the cursor around, tooltip only shows near points. Toggle snap to see the difference."
          data={d_tooltip_snap()}
          code={`{
  series: [{ label: 'Points', dataIndex: 1, type: 'scatter', pointRadius: 3 }],
  cursor: { show: true, snap: true, xLine: true, yLine: true },
  tooltip: { show: true, mode: 'nearest' },
}`} />
      </Section>
    </>
  );
}
