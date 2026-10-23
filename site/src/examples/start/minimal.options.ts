import type { ChartOptions } from 'snaplot';

// Daily highs in Central Park, New York, June 2025 (°F).
// Source: NOAA NCEI GHCN-Daily, station USW00094728,
// doi:10.7289/V5D21VHZ (a U.S. Government work).
const highs = [
  66, 71, 79, 83, 87, 84, 76, 76, 64, 73, 81, 87, 78, 68, 64, 69, 67,
  84, 88, 82, 86, 88, 96, 99, 96, 85, 72, 83, 89, 90,
];

type Row = { day: number; high: number };
const rows: Row[] = highs.map((high, i) => ({ day: i + 1, high }));

export default {
  data: rows,
  x: 'day',
  series: [{ y: 'high' }],
  ariaLabel: 'Daily high temperature in Central Park, June 2025',
} satisfies ChartOptions<Row>;
