import { describe, expect, it } from 'vitest';
import { ColumnarStore } from '../data/ColumnarStore';
import type { Scale, SeriesConfig } from '../types';
import { HitTester } from './HitTester';

const f = (xs: number[]) => Float64Array.from(xs);

function scale(key: string, min: number, max: number, pxMin = 0, pxMax = 100): Scale {
  return {
    type: 'linear',
    key,
    min,
    max,
    dataToPixel(value: number) {
      return pxMin + ((value - min) / (max - min)) * (pxMax - pxMin);
    },
    pixelToData(pixel: number) {
      return min + ((pixel - pxMin) / (pxMax - pxMin)) * (max - min);
    },
    ticks: () => [],
    tickFormat: (value: number) => `${key}:${value}`,
    nice: () => {},
    setPixelRange: () => {},
  };
}

describe('HitTester', () => {
  it('uses each series xAxisKey when resolving index-mode points', () => {
    const store = new ColumnarStore([
      f([0, 50, 100]),
      f([10, 20, 30]),
      f([100, 200, 300]),
    ]);
    const scales = new Map<string, Scale>([
      ['x', scale('x', 0, 100)],
      ['x2', scale('x2', 0, 200)],
      ['y', scale('y', 0, 400)],
    ]);
    const series: SeriesConfig[] = [
      { label: 'primary', dataIndex: 1 },
      { label: 'secondary', dataIndex: 2, xAxisKey: 'x2' },
    ];

    const points = new HitTester(1_000).findPoints(
      store,
      scales,
      series,
      50,
      50,
      'index',
      ['#111', '#222'],
      'mouse',
    );

    expect(points.map((p) => [p.label, p.dataIndex, p.x])).toEqual([
      ['primary', 1, 50],
      ['secondary', 2, 100],
    ]);
  });

  it('uses each series xAxisKey when searching nearest points', () => {
    const store = new ColumnarStore([
      f([0, 50, 100]),
      f([300, 200, 100]),
      f([300, 300, 200]),
    ]);
    const scales = new Map<string, Scale>([
      ['x', scale('x', 0, 100)],
      ['x2', scale('x2', 0, 200)],
      ['y', scale('y', 0, 400)],
    ]);
    const series: SeriesConfig[] = [
      { label: 'primary', dataIndex: 1, visible: false },
      { label: 'secondary', dataIndex: 2, xAxisKey: 'x2' },
    ];

    const points = new HitTester(1_000).findPoints(
      store,
      scales,
      series,
      50,
      50,
      'nearest',
      ['#111', '#222'],
      'mouse',
    );

    expect(points).toHaveLength(1);
    expect(points[0].label).toBe('secondary');
    expect(points[0].dataIndex).toBe(2);
  });

  it('uses scatter xDataIndex, encoded colour, radius, and tooltip fields', () => {
    const store = new ColumnarStore([
      f([0, 1, 2]),
      f([10, 1, 5]),
      f([10, 20, 30]),
      f([0, 1, 0]),
      f([4, 9, 16]),
    ]);
    const scales = new Map<string, Scale>([
      ['x', scale('x', 0, 10)],
      ['y', scale('y', 0, 40)],
    ]);
    const series: SeriesConfig[] = [{
      label: 'runs',
      type: 'scatter',
      xDataIndex: 1,
      yDataIndex: 2,
      colorBy: { dataIndex: 3, type: 'category', palette: ['#111111', '#eeeeee'], label: 'family' },
      sizeBy: { dataIndex: 4, domain: [4, 16], range: [2, 8], label: 'runtime' },
      tooltipFields: [{ dataIndex: 1, label: 'lr' }],
    }];

    const points = new HitTester(12).findPoints(
      store,
      scales,
      series,
      10,
      50,
      'nearest',
      ['#abc'],
      'mouse',
      { categorical: ['#111111', '#eeeeee'] },
      1,
    );

    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({
      dataIndex: 1,
      x: 1,
      y: 20,
      color: '#eeeeee',
      radius: 4.5,
    });
    expect(points[0].fields?.map((field) => [field.label, field.value])).toEqual([
      ['family', 1],
      ['runtime', 9],
      ['lr', 1],
    ]);
  });
});
