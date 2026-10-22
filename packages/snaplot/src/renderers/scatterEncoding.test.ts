import { describe, expect, it } from 'vitest';
import type { SeriesConfig } from '../types';
import { createScatterStyleResolver } from './scatterEncoding';

function resolverFor(series: SeriesConfig, columns: Float64Array[]) {
  return createScatterStyleResolver({
    series,
    fallbackColor: '#4e79a7',
    fallbackRadius: 3,
    palettes: { categorical: ['#111', '#222', '#333'] },
    columnCount: columns.length,
    ranges: [{ startIdx: 0, endIdx: columns[0].length - 1 }],
    valueAt: (columnIdx, index) => columns[columnIdx]?.[index] ?? Number.NaN,
  });
}

describe('scatter style resolver maxRadius', () => {
  const x = Float64Array.from([0, 1, 2, 3]);
  const y = Float64Array.from([0, 1, 2, 3]);
  const size = Float64Array.from([1, 5, 10, 40]);

  it('reports the fallback radius when there is no size encoding', () => {
    const resolver = resolverFor(
      { label: 's', type: 'scatter', xDataIndex: 0, yDataIndex: 1 },
      [x, y],
    );
    expect(resolver.variableRadius).toBe(false);
    expect(resolver.maxRadius).toBe(3);
  });

  it('reports the size range upper bound so the render cull margin covers big bubbles', () => {
    const resolver = resolverFor(
      {
        label: 's',
        type: 'scatter',
        xDataIndex: 0,
        yDataIndex: 1,
        sizeBy: { dataIndex: 2, range: [4, 40] },
      },
      [x, y, size],
    );
    expect(resolver.variableRadius).toBe(true);
    expect(resolver.maxRadius).toBe(40);
    // No point should ever exceed the advertised maxRadius.
    for (let i = 0; i < x.length; i++) {
      expect(resolver.radiusAt(i)).toBeLessThanOrEqual(resolver.maxRadius);
    }
  });

  it('reports the default size range max when range is omitted', () => {
    const resolver = resolverFor(
      { label: 's', type: 'scatter', xDataIndex: 0, yDataIndex: 1, sizeBy: 2 },
      [x, y, size],
    );
    expect(resolver.maxRadius).toBe(7);
  });
});

describe('scatter color bins match colorAt', () => {
  it('category bins resolve to the same color as colorAt', () => {
    const x = Float64Array.from([0, 1, 2, 3, 4, 5]);
    const y = Float64Array.from([0, 1, 2, 3, 4, 5]);
    const cat = Float64Array.from([0, 1, 2, 0, 1, 2]);
    const resolver = resolverFor(
      {
        label: 's',
        type: 'scatter',
        xDataIndex: 0,
        yDataIndex: 1,
        colorBy: { dataIndex: 2, type: 'category' },
      },
      [x, y, cat],
    );
    for (let i = 0; i < x.length; i++) {
      expect(resolver.colorForBin(resolver.colorBinAt(i))).toBe(resolver.colorAt(i));
    }
  });
});


describe('stable prepared categorical encodings', () => {
  it('keeps the palette slot when earlier categories leave retained data', () => {
    const series: SeriesConfig = { label: 'sample', type: 'scatter', xDataIndex: 0, yDataIndex: 1,
      colorBy: { dataIndex: 2, type: 'category', categoryValues: [0, 1, 2] } };
    const before = resolverFor(series, [new Float64Array([0, 1, 2]), new Float64Array(3), new Float64Array([0, 1, 2])]);
    const after = resolverFor(series, [new Float64Array([2]), new Float64Array(1), new Float64Array([2])]);
    expect(before.colorAt(2)).toBe('#333');
    expect(after.colorAt(0)).toBe(before.colorAt(2));
    expect(after.colorForBin(after.colorBinAt(0))).toBe('#333');
  });

  it('renders more than twelve explicitly categorical values', () => {
    const values = Float64Array.from({ length: 20 }, (_, index) => index);
    const style = resolverFor({ label: 'sample', type: 'scatter', xDataIndex: 0, yDataIndex: 1,
      colorBy: { dataIndex: 2, type: 'category' } }, [values, values, values]);
    expect(style.colorBinAt(19)).toBe(19);
    expect(style.colorAt(19)).toBe('#222');
  });
});
