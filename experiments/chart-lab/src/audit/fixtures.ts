import type { ChartSpec } from '../types';

export const auditCases = [
  ['baseline', 'Short labels'],
  ['titles', 'Long axis titles'],
  ['ticks', 'Long formatted ticks'],
  ['dual', 'Two Y axes / mixed units'],
  ['categories', 'Long category labels'],
  ['precision', 'Very small differences'],
  ['large', 'Large values'],
  ['single', 'One observation'],
  ['constant', 'Constant readings'],
  ['empty', 'No observations'],
] as const;
export type AuditCase = typeof auditCases[number][0];

export function auditSpec(id: AuditCase): ChartSpec {
  const spec: ChartSpec = {
    id, title: 'Sensor observations', subtitle: 'Required semantics, no spacing adjustments',
    xLabel: 'Elapsed time (s)', yLabel: 'Temperature (°C)',
    series: [{ id: 'reading', label: 'Sensor reading', color: '#168a84', kind: 'line' }],
    rows: Array.from({ length: 12 }, (_, i) => ({ x: i, reading: 20 + 8 * Math.sin(i / 2), other: 100000 + i * 73000 })),
  };
  if (id === 'titles') {
    spec.xLabel = 'Elapsed experiment time since the first validated baseline observation (seconds)';
    spec.yLabel = 'Ambient-compensated temperature at the primary measurement location (degrees Celsius)';
  }
  if (id === 'ticks') {
    spec.xFormat = (value) => `Window ${value.toFixed(1)} seconds`;
    spec.yFormat = (value) => `${value.toFixed(2)} milligrams per litre`;
    spec.yLabel = 'Concentration';
  }
  if (id === 'dual') {
    spec.rightLabel = 'Cumulative observations (count)';
    spec.series.push({ id: 'other', label: 'Observations', color: '#c5772b', kind: 'line', axis: 'right' });
  }
  if (id === 'categories') {
    const names = ['International arrivals', 'Domestic departures', 'Transfer connections', 'Remote aircraft stands'];
    spec.xLabel = 'Terminal operations area';
    spec.yLabel = 'Flights';
    spec.xFormat = (value) => Number.isInteger(value) ? names[value] ?? '' : '';
    spec.rows = spec.rows.slice(0, 4);
    spec.series[0].kind = 'bar';
  }
  if (id === 'precision') spec.rows = spec.rows.map((row) => ({ ...row, reading: 1 + row.reading! / 1e7 }));
  if (id === 'large') spec.rows = spec.rows.map((row) => ({ ...row, reading: row.reading! * 1e8 }));
  if (id === 'single') spec.rows = spec.rows.slice(0, 1);
  if (id === 'constant') spec.rows = spec.rows.map((row) => ({ ...row, reading: 20 }));
  if (id === 'empty') spec.rows = [];
  return spec;
}
