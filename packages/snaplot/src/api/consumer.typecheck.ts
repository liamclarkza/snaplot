/** Compile-only examples of the public surface; never invoked by the library. */
import { createChart, createChartGroup, histogram, type ChartOptions } from '../core';

export function consumerExamples(element: HTMLElement) {
  const samples = [{ time: new Date(), cpu: 42, low: 40, high: 48, phase: 'train', id: 'one' }];
  const group = createChartGroup();
  const chart = createChart(element, {
    data: samples,
    x: 'time',
    rowId: 'id',
    group,
    series: [{ y: 'cpu' }, { id: 'spread', type: 'band', y: 'cpu', lower: 'low', upper: 'high' }],
    axes: { y: { title: 'CPU', format: (value) => String(value) } },
    onPointClick: (point) => {
      point.row?.cpu.toFixed();
      point.rowId?.toString();
    },
  });
  chart.update({ axes: { y: { title: undefined } }, padding: { left: 48 } });
  chart.update({ theme: { axisLabelColor: '#fff' } });
  chart.appendData(samples);
  chart.setViewport({ x: { min: 0, max: 1 } });
  chart.on('point:click', (point) => {
    point.row?.phase.toUpperCase();
  });
  createChart(element, {
    data: { columns: { time: new Float64Array([0, 1]), value: new Float64Array([2, 3]) } },
    x: 'time',
    series: [{ y: 'value' }],
  });
  createChart(element, {
    x: 'time',
    series: [{ id: 'baseline', data: samples, y: 'cpu' }],
  });
  createChart(element, {
    series: [{ id: 'counts', type: 'histogram', data: histogram(new Float64Array([1, 2, 3])) }],
  });
  const options: ChartOptions<(typeof samples)[number]> = {
    data: samples,
    x: 'phase',
    series: [{ type: 'bar', y: 'cpu' }],
    axes: { x: { categories: ['train', 'test'], format: (value) => String(value) } },
  };
  createChart(element, options);
  const invalid: ChartOptions<(typeof samples)[number]> = {
    series: [
      // @ts-expect-error invalid metric field
      { y: 'phase' },
      // @ts-expect-error misspelled field
      { y: 'cpus' },
      // @ts-expect-error band bounds are required
      { type: 'band', y: 'cpu' },
      // @ts-expect-error numeric column indices are not public
      { y: 'cpu', dataIndex: 1 },
    ],
  };
  createChart(element, {
    series: [
      { id: 'a', data: [{ time: 1, value: 2 }], x: 'time', y: 'value' },
      { id: 'b', data: [{ step: 2, value: 3 }], x: 'step', y: 'value' },
    ],
  });
  void invalid;
}
