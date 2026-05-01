import CodeBlock from '../../../components/CodeBlock';
import { Section, Prose } from '../../../components/ui';

export default function ApiReference() {
  return (
    <>
      <Section id="api-methods" title="ChartInstance Methods">
        <Prose>The <code>ChartInstance</code> object is returned by the <code>onReady</code> callback on <code>&lt;Chart&gt;</code>:</Prose>
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
                <th style={{ padding: '10px 12px', 'text-align': 'left', 'font-weight': '600', color: 'var(--text)' }}>Method</th>
                <th style={{ padding: '10px 12px', 'text-align': 'left', 'font-weight': '600', color: 'var(--text)' }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['setData(data: ColumnarData)', 'Replace all chart data'],
                ['appendData(data: ColumnarData)', 'Append data for streaming; config.streaming.maxLen caps retained points'],
                ['getData(): ColumnarData', 'Get current data arrays'],
                ['setAxis(key: string, range: Partial<ScaleRange>)', 'Set axis domain (min/max)'],
                ['getAxis(key: string): Scale | undefined', 'Get a scale instance by key'],
                ['setOptions(config: DeepPartial<ChartConfig>)', 'Deep-merge config updates'],
                ['getOptions(): ChartConfig', 'Get resolved config'],
                ['getLayout(): Layout', 'Get current layout dimensions'],
                ['redraw()', 'Force full redraw of all layers'],
                ['resize(width: number, height: number)', 'Resize the chart'],
                ['destroy()', 'Clean up all resources and event listeners'],
                ['use(plugin: Plugin)', 'Register a plugin at runtime'],
                ['on(event, handler): () => void', 'Subscribe to events; returns unsubscribe fn'],
                ['setCursorDataX(dataX: number | null, origin?: CursorEventOrigin)', 'Set cursor position externally (sync/programmatic)'],
                ['getCursorSnapshot(opts?): CursorSnapshot', 'Snapshot of every visible series at the cursor'],
                ['getCursorSnapshotInto(target, opts?): CursorSnapshot', 'Zero-alloc variant that mutates a reused buffer'],
                ['setHighlight(seriesIndex: number | null)', 'Focus a series; dims the others (data-layer only)'],
                ['getHighlight(): number | null', 'Current highlighted series index, or null'],
                ['getStats(): ChartStats', 'Read diagnostic counters for local perf debugging'],
              ].map(([method, desc]) => (
                <tr style={{ 'border-bottom': '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', 'font-family': 'var(--font-mono)', 'font-size': '12px', 'white-space': 'nowrap' }}>{method}</td>
                  <td style={{ padding: '8px 12px' }}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="api-events" title="Events">
        <Prose>Subscribe to chart events with <code>chart.on(event, handler)</code>. The returned function unsubscribes.</Prose>
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
                <th style={{ padding: '10px 12px', 'text-align': 'left', 'font-weight': '600', color: 'var(--text)' }}>Event</th>
                <th style={{ padding: '10px 12px', 'text-align': 'left', 'font-weight': '600', color: 'var(--text)' }}>Payload</th>
                <th style={{ padding: '10px 12px', 'text-align': 'left', 'font-weight': '600', color: 'var(--text)' }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['cursor:move', "(dataX: number | null, dataIdx: number | null, origin: 'local' | 'sync' | 'programmatic')", 'Cursor moved over chart or left'],
                ['highlight:change', '(seriesIndex: number | null)', 'Highlighted series changed (local or synced)'],
                ['viewport:change', '(scaleKey: string, range: ScaleRange)', 'Scale domain changed (zoom/pan)'],
                ['data:update', '(data: ColumnarData)', 'Data replaced or appended'],
                ['resize', '(width: number, height: number)', 'Chart container resized'],
                ['click', '(dataX: number, dataIdx: number)', 'Click on the plot area'],
                ['select', '(selection: SelectionResult)', 'Box selection resolved; scatter selections include selected points'],
                ['drawData', '(ctx: CanvasRenderingContext2D, layout: Layout)', 'After data layer draw (custom overlay)'],
                ['drawOverlay', '(ctx: CanvasRenderingContext2D, layout: Layout)', 'After overlay layer draw'],
              ].map(([event, payload, desc]) => (
                <tr style={{ 'border-bottom': '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', 'font-family': 'var(--font-mono)', 'font-size': '12px', 'white-space': 'nowrap' }}>{event}</td>
                  <td style={{ padding: '8px 12px', 'font-family': 'var(--font-mono)', 'font-size': '11.5px' }}>{payload}</td>
                  <td style={{ padding: '8px 12px' }}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CodeBlock code={`// Example: log viewport changes
const unsub = chart.on('viewport:change', (key, range) => {
  console.log(\`\${key}: \${range.min.toFixed(2)} \u2013 \${range.max.toFixed(2)}\`);
});

// Later: unsubscribe
unsub();`} />
      </Section>

      <Section id="api-scatter-options" title="Scatter Series Options">
        <Prose>
          Scatter series support additional encodings for tabular data. All scatter column references are absolute <code>ColumnarData</code> indexes: <code>0</code> is the default X column, and <code>1</code> onward are value columns.
        </Prose>
        <CodeBlock code={`type ScatterRenderMode = 'points' | 'density' | 'auto';
type ScatterPointShape = 'circle' | 'square' | 'diamond';

interface SeriesConfig {
  type: 'scatter';
  xDataIndex?: number;    // X column, defaults to 0
  yDataIndex: number;     // Y column
  renderMode?: ScatterRenderMode;
  pointShape?: ScatterPointShape;
  colorBy?: number | ScatterColorEncoding;
  sizeBy?: number | ScatterSizeEncoding;
  tooltipFields?: Array<number | ScatterTooltipField>;
}`} />
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
                <th style={{ padding: '10px 12px', 'text-align': 'left', 'font-weight': '600', color: 'var(--text)' }}>Option</th>
                <th style={{ padding: '10px 12px', 'text-align': 'left', 'font-weight': '600', color: 'var(--text)' }}>Type</th>
                <th style={{ padding: '10px 12px', 'text-align': 'left', 'font-weight': '600', color: 'var(--text)' }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['xDataIndex', 'number', 'Absolute column index for X values. Defaults to 0.'],
                ['yDataIndex', 'number', 'Absolute column index for Y values. Preferred for scatter series.'],
                ['renderMode', "'points' | 'density' | 'auto'", 'Controls whether scatter renders individual stamped points, aggregate density bins, or switches automatically for very large clouds.'],
                ['pointShape', "'circle' | 'square' | 'diamond'", 'Shape used by point rendering. Density rendering ignores this.'],
                ['colorBy', 'number | ScatterColorEncoding', 'Maps another column to point colour. Object form adds type, palette, domain, nullColor, label, and format.'],
                ['sizeBy', 'number | ScatterSizeEncoding', 'Maps another column to point radius. Object form adds domain, range, sqrt/linear scale, label, and format.'],
                ['tooltipFields', 'Array<number | ScatterTooltipField>', 'Additional columns rendered by the built-in nearest-point tooltip.'],
                ['heatmap', 'boolean', "Legacy alias for renderMode: 'density'. Prefer renderMode for new code."],
                ['heatmapBinSize', 'number', 'Density bin size in CSS pixels. Larger values are coarser and cheaper to render.'],
                ['heatmapGradient', 'string[]', 'Per-series density colour ramp. Overrides theme heatmap/sequential palettes for that series.'],
              ].map(([option, type, desc]) => (
                <tr style={{ 'border-bottom': '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', 'font-family': 'var(--font-mono)', 'font-size': '12px', 'white-space': 'nowrap' }}>{option}</td>
                  <td style={{ padding: '8px 12px', 'font-family': 'var(--font-mono)', 'font-size': '11.5px', 'white-space': 'nowrap' }}>{type}</td>
                  <td style={{ padding: '8px 12px' }}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CodeBlock code={`colorBy: {
  dataIndex: 3,
  type: 'category',       // 'auto' | 'category' | 'continuous' | 'diverging'
  palette: ['#4f8fea', '#58b884', '#e6a23c'],
  label: 'Model family',
  format: (value) => MODEL_FAMILIES[Math.round(value)] ?? 'Other',
}

sizeBy: {
  dataIndex: 4,
  domain: [0, 600],
  range: [2, 8],          // radius in CSS pixels
  scale: 'sqrt',
  label: 'Runtime',
  format: (value) => \`\${(value / 60).toFixed(1)} min\`,
}

tooltipFields: [
  { dataIndex: 5, label: 'Accuracy', format: (v) => \`\${(v * 100).toFixed(1)}%\` },
]`} />
      </Section>

      <Section id="api-types" title="Types">
        <Prose>Key type exports from <code>snaplot</code>:</Prose>
        <CodeBlock code={`import type {
  // Core
  ChartInstance,       // Public chart API (methods table above)
  ChartConfig,         // Top-level configuration object (generic in TMeta)
  ChartType,           // 'line' | 'area' | 'band' | 'scatter' | 'bar' | 'histogram'
  ColumnarData,        // [xValues: Float64Array, ...yValues: Float64Array[]]
  DeepPartial,         // Recursive partial utility type

  // Scales
  Scale,               // Scale instance (dataToPixel, pixelToData, ticks, etc.)
  ScaleType,           // 'linear' | 'log' | 'time'
  ScaleRange,          // { min: number; max: number }

  // Series
  SeriesConfig,        // Per-series configuration (generic in TMeta)
  ScatterRenderMode,   // 'points' | 'density' | 'auto'
  ScatterColorEncoding,// colorBy object form
  ScatterSizeEncoding, // sizeBy object form
  ScatterTooltipField, // tooltipFields object form
  InterpolationMode,   // 'linear' | 'monotone' | 'step-before' | 'step-after' | 'step-middle'

  // Axes
  AxisConfig,          // Axis configuration (min, max, padding, nice, auto)
  AxisPosition,        // 'top' | 'bottom' | 'left' | 'right'

  // Interactions
  InteractionMode,     // 'timeseries' | 'analytical' | 'readonly'
  CursorConfig,        // Crosshair config (show, snap, indicators, syncKey, ...)
  StreamingConfig,     // { maxLen?: number } for fixed-window appends
  ZoomConfig,          // Zoom/selection config (bounds, wheelStep, ...)
  ZoomBoundsSpec,      // 'data' | 'unbounded' | { min?, max? }
  PanConfig,           // Pan configuration
  TouchConfig,         // Touch gesture configuration
  TooltipConfig,       // Tooltip configuration
  TooltipPoint,        // Point data passed to tooltip renderer
  SelectionResult,     // Box-selection range plus selected scatter points
  SelectedPoint,       // One selected scatter point
  DebugConfig,         // { stats?: boolean }
  ChartStats,          // Counters returned by chart.getStats()

  // Cursor snapshot (legend table data source)
  CursorSnapshot,      // { source, dataIndex, dataX, formattedX,
                       //   activeSeriesIndex, points: CursorSeriesPoint[] }
  CursorSeriesPoint,   // { seriesIndex, dataIndex, label, color,
                       //   value, formattedValue, meta }
  CursorSnapshotOptions, // { fallback?: 'hide' | 'latest' | 'first' }

  // Highlight (cross-chart series focus)
  HighlightConfig,     // { enabled, dimOpacity, syncKey, getKey }
  HighlightSyncKey,    // string | number stable series identity

  // Theme & Layout
  ThemeConfig,         // Full theme object
  Layout,              // Computed layout dimensions

  // Plugins & Rendering
  Plugin,              // Plugin lifecycle interface
  ChartEventMap,       // Event name \u2192 handler signature map
  RenderContext,       // Internal render context (for advanced plugins)

  // Legend table
  LegendTableOptions,  // createLegendTablePlugin options
  LegendTableColumn,   // Column spec shared by plugin and <LegendTable>
  LegendCellContent,   // string | Node returned by cell()

} from 'snaplot';

import type {
  // SolidJS component
  LegendTableProps,        // <LegendTable> props
  LegendTableSolidColumn,  // JSX-flavored column (cell returns JSX.Element)
  LegendTableFallback,     // 'hide' | 'latest' | 'first' | 'series-only'

  // Chart groups (multi-chart sync helpers)
  ChartGroup,          // createChartGroup() handle
  ChartGroupBindings,  // What bind() returns
} from 'snaplot/solid';`} />
      </Section>
    </>
  );
}
