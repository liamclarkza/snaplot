import type { ChartOptions } from 'snaplot';

// Source: Copernicus Climate Change Service / ECMWF, ERA5 via Climate Pulse (CC BY 4.0).
// The daily global mean surface air temperature, June 2024, °C.
const temps = [
  16.57, 16.52, 16.48, 16.47, 16.51, 16.49, 16.5, 16.55, 16.61, 16.63,
  16.68, 16.74, 16.81, 16.81, 16.75, 16.72, 16.74, 16.71, 16.67,
  16.63, 16.63, 16.64, 16.67, 16.67, 16.7, 16.76, 16.77, 16.77, 16.77,
  16.76,
];

type Row = { day: number; temp: number };
const rows: Row[] = temps.map((temp, i) => ({ day: i + 1, temp }));

export default {
  data: rows,
  x: 'day',
  series: [{ y: 'temp' }],
  ariaLabel: 'Daily global mean temperature, June 2024',
} satisfies ChartOptions<Row>;
