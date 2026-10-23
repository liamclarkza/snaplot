import type { ChartPoint, LegendItem } from '../api/types';
import type { LegendTableColumn } from './LegendTable';
/** Native Solid cells; safe to render on the server. */
export function swatchColumn<Row>(
  options: { size?: number; shape?: 'dot' | 'bar' } = {},
): LegendTableColumn<Row> {
  const size = options.size ?? 10;
  return {
    key: 'swatch',
    header: '',
    width: `${size + 4}px`,
    cell: (point) => (
      <span
        class="snaplot-legend-swatch"
        style={{
          display: 'inline-block',
          width: `${size}px`,
          height: `${options.shape === 'bar' ? Math.max(2, Math.round(size * 0.4)) : size}px`,
          'border-radius': options.shape === 'bar' ? '1px' : '50%',
          background: point.color,
          'flex-shrink': 0,
        }}
      />
    ),
  };
}
export function nameColumn<Row>(
  options: { swatch?: boolean; truncate?: number } = {},
): LegendTableColumn<Row> {
  return {
    key: 'name',
    header: 'Name',
    cell: (point) => (
      <span
        style={{
          display: 'inline-flex',
          'align-items': 'center',
          gap: '6px',
          'max-width': `${options.truncate ?? 160}px`,
        }}
      >
        {options.swatch !== false && (
          <span
            class="snaplot-legend-swatch"
            style={{
              width: '8px',
              height: '8px',
              'border-radius': '50%',
              background: point.color,
              'flex-shrink': 0,
            }}
          />
        )}
        <span
          title={point.label}
          style={{ overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}
        >
          {point.label}
        </span>
      </span>
    ),
  };
}
export function valueColumn<Row>(
  options: {
    format?: (value: number, point: ChartPoint<Row>) => string;
    placeholder?: string;
    align?: 'left' | 'right' | 'center';
    header?: string;
  } = {},
): LegendTableColumn<Row> {
  return {
    key: 'value',
    header: options.header ?? 'Value',
    align: options.align ?? 'right',
    cell: (point) =>
      Number.isNaN(point.y) || !point.formattedY ? (
        (options.placeholder ?? '—')
      ) : (
        <span style={{ 'font-variant-numeric': 'tabular-nums' }}>
          {options.format?.(point.y, point) ?? point.formattedY}
        </span>
      ),
  };
}
export function metricColumn<Row>(
  resolve: (point: ChartPoint<Row>, series: LegendItem) => string,
  options: { header?: string; truncate?: number } = {},
): LegendTableColumn<Row> {
  return {
    key: 'metric',
    header: options.header ?? 'Metric',
    cell: (point, series) => (
      <span
        title={resolve(point, series)}
        style={{
          display: 'inline-block',
          'max-width': `${options.truncate ?? 160}px`,
          overflow: 'hidden',
          'text-overflow': 'ellipsis',
          'white-space': 'nowrap',
        }}
      >
        {resolve(point, series)}
      </span>
    ),
  };
}
export function column<Row>(spec: LegendTableColumn<Row>): LegendTableColumn<Row> {
  return spec;
}
