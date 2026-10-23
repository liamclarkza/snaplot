/**
 * Layout and sizing fixtures (owned by M11 from W5): the `#/visual` axis-titles fixture and the
 * box sizes where gutters and the tiny-container policy matter (visuals-16, render-25).
 */
import type { ChartOptions } from '../../../src/index';
import { DAY, range, utc } from './data';
import type { Fixture } from './types';

function axisTitleLine() {
  const n = 60;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    x[i] = i;
    y[i] = 400 + Math.sin(t * Math.PI * 2) * 220 + t * 180;
  }
  return { columns: { x, value1: y } };
}

function twoLines(n = 48): ChartOptions<any> {
  return {
    data: range(n, (t) => ({ t, a: 30 + 12 * Math.sin(t / 5), b: 24 + 9 * Math.cos(t / 7) })),
    x: 't',
    series: [
      { y: 'a', label: 'Inbound' },
      { y: 'b', label: 'Outbound' },
    ],
  };
}

export const fixtures: Fixture[] = [
  {
    id: 'layout/axis-titles',
    title: '#/visual axis-titles: titles on both axes, monotone line, lineWidth 2',
    width: 380,
    height: 220,
    dpr2: true,
    options: () => ({
      data: axisTitleLine(),
      x: 'x',
      axes: {
        x: { type: 'linear', title: 'Elapsed (s)' },
        y: { type: 'linear', title: 'Throughput (req/s)' },
      },
      series: [
        { label: 'req/s', y: 'value1', type: 'line', interpolation: 'monotone', lineWidth: 2 },
      ],
    }),
  },
  {
    id: 'layout/tiny-200x120',
    title: 'A 200 × 120 box: fixed gutters leave little plot (visuals-16)',
    width: 200,
    height: 120,
    options: () => twoLines(),
  },
  {
    id: 'layout/wide-1200x200',
    title: 'A wide, short 1200 × 200 box',
    width: 1200,
    height: 200,
    options: () => twoLines(240),
  },
  {
    id: 'layout/phone-390x240',
    title: 'A phone-width 390 × 240 time series with axis titles',
    width: 390,
    height: 240,
    options: () => ({
      data: range(90, (i) => ({
        day: new Date(utc(2026, 0, 1) + i * DAY),
        temp: 12 + 8 * Math.sin(i / 14) + (i % 4) * 0.6,
      })),
      x: 'day',
      axes: { x: { title: 'Date' }, y: { title: 'Temperature (°C)' } },
      series: [{ y: 'temp', label: 'Temperature' }],
    }),
  },
  {
    id: 'layout/tall-320x480',
    title: 'A tall 320 × 480 bar chart',
    width: 320,
    height: 480,
    options: () => ({
      data: range(8, (i) => ({ k: i, v: 12 + ((i * 29) % 40) })),
      x: 'k',
      series: [{ y: 'v', type: 'bar', label: 'Count' }],
    }),
  },
];
