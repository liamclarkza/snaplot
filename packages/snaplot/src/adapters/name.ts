/**
 * The chart's accessible name (plan D20), shared by the core (which names a vanilla host) and the
 * React and Solid components (which render it on their host, so server markup is a named figure).
 */
import type { ChartOptions } from 'snaplot';

const MARKS: Record<string, string> = {
  line: 'Line chart',
  area: 'Area chart',
  band: 'Band chart',
  bar: 'Bar chart',
  scatter: 'Scatter chart',
  histogram: 'Histogram',
};

/**
 * The chart's accessible name (plan D20): `ariaLabel`, else a summary of the series, such as
 * "Line chart, 2 series: CPU, Memory".
 */
export function accessibleName(options: Pick<ChartOptions<any>, 'ariaLabel' | 'series'>): string {
  if (options.ariaLabel) return options.ariaLabel;
  const series = (options.series ?? []) as unknown as readonly Record<string, unknown>[];
  const marks = new Set(series.map((item) => (item.type as string | undefined) ?? 'line'));
  const kind = marks.size === 1 ? (MARKS[[...marks][0]] ?? 'Chart') : 'Chart';
  const names = series.map((item) =>
    String(item.label ?? (typeof item.y === 'string' ? item.y : (item.id ?? ''))),
  );
  return `${kind}, ${series.length} series${names.length ? `: ${names.join(', ')}` : ''}`;
}
