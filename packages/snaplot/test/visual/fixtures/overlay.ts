/**
 * Overlay fixtures (owned by M12a from W5): tooltip, crosshair, hover and highlight states. Hovers
 * use a real pointer, placed by the spec at a fraction of the plot box, so they survive any change
 * to the cursor and tooltip options.
 */
import { gauss, mulberry, range } from './data';
import type { Fixture } from './types';

function multiLine() {
  const n = 80;
  const x = new Float64Array(n);
  const a = new Float64Array(n);
  const b = new Float64Array(n);
  const c = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    x[i] = i;
    a[i] = 50 + Math.sin(t * Math.PI * 3) * 18;
    b[i] = 40 + Math.cos(t * Math.PI * 2) * 14;
    c[i] = 62 + Math.sin(t * Math.PI * 4 + 1) * 10;
  }
  return { columns: { x, value1: a, value2: b, value3: c } };
}

const lineSeries = [
  { label: 'alpha', y: 'value1', interpolation: 'monotone' as const, lineWidth: 2 },
  { label: 'beta', y: 'value2', interpolation: 'monotone' as const, lineWidth: 2 },
  { label: 'gamma', y: 'value3', interpolation: 'monotone' as const, lineWidth: 2 },
];

export const fixtures: Fixture[] = [
  {
    id: 'overlay/tooltip-open',
    title: '#/visual tooltip-open: index tooltip over three lines (pointer at x ≈ 40)',
    width: 380,
    height: 220,
    dpr2: true,
    hover: { x: 40 / 79, y: 0.3 },
    options: () => ({
      data: multiLine(),
      x: 'x',
      axes: { x: { type: 'linear' }, y: { type: 'linear' } },
      series: lineSeries,
    }),
  },
  {
    id: 'overlay/highlight-dim',
    title: '#/visual highlight-dim: one highlighted series dims the others',
    width: 380,
    height: 220,
    options: () => ({
      data: multiLine(),
      x: 'x',
      axes: { x: { type: 'linear' }, y: { type: 'linear' } },
      series: lineSeries,
    }),
    after: (chart) => chart.update({ highlight: 'value2' }),
  },
  {
    id: 'overlay/hover-bar-line',
    title: 'Hover over a bar + line chart: the tooltip drops the line (interact-03)',
    width: 480,
    height: 260,
    dpr2: true,
    hover: { x: 0.52, y: 0.5 },
    options: () => ({
      data: range(12, (m) => ({
        m,
        orders: 40 + ((m * 17) % 30),
        target: 52 + 6 * Math.sin(m / 2),
      })),
      x: 'm',
      series: [
        { y: 'orders', type: 'bar', label: 'Orders' },
        { y: 'target', type: 'line', label: 'Target' },
      ],
    }),
  },
  {
    id: 'overlay/hover-scatter-3',
    title: 'Hover over 3 scatter series: an index tooltip lists unrelated points (visuals-05)',
    width: 480,
    height: 260,
    hover: { x: 0.5, y: 0.45 },
    options: () => {
      const r = mulberry(42);
      return {
        series: range(3, (i) => {
          const cx = 20 + i * 9;
          const cy = 30 + (i % 3) * 15;
          return {
            type: 'scatter' as const,
            id: `g${i}`,
            label: `Group ${String.fromCharCode(65 + i)}`,
            data: range(150, (k) => ({
              x: cx + gauss(r) * 8,
              y: cy + gauss(r) * 6 + 0.3 * (k % 7),
            })),
            x: 'x',
            y: 'y',
          };
        }),
      };
    },
  },
];
