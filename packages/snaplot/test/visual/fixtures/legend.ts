/**
 * Legend fixtures (M8's interim legend; M12b owns them from W5): the automatic legend of two or
 * more series, its bottom placement and a hidden series.
 */
import type { Fixture } from './types';

function twoLines() {
  const n = 60;
  const x = new Float64Array(n);
  const cpu = new Float64Array(n);
  const mem = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = i;
    cpu[i] = 42 + Math.sin(i / 7) * 12;
    mem[i] = 63 + Math.cos(i / 9) * 8;
  }
  return { columns: { x, cpu, mem } };
}

const series = [
  { y: 'cpu', label: 'CPU' },
  { y: 'mem', label: 'Memory' },
];

export const fixtures: Fixture[] = [
  {
    id: 'legend/two-series',
    title: "legend: 'auto' shows a styled legend above the plot for two series (plan D6)",
    width: 480,
    height: 260,
    dpr2: true,
    options: () => ({ data: twoLines(), x: 'x', series }),
  },
  {
    id: 'legend/bottom',
    title: "legend: { position: 'bottom' } puts the legend below the plot",
    width: 480,
    height: 260,
    options: () => ({ data: twoLines(), x: 'x', series, legend: { position: 'bottom' } }),
  },
  {
    id: 'legend/hidden-series',
    title: 'a hidden series keeps its legend button, shown as off',
    width: 480,
    height: 260,
    options: () => ({ data: twoLines(), x: 'x', series, hiddenSeries: ['mem'] }),
    skip: { paints: 'the hidden series draws nothing' },
  },
];
