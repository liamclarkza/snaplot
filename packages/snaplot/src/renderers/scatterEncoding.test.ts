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
