import { describe, expect, it } from 'vitest';
import {
  barRectForCategory,
  categoryWidthFromCenters,
  categoryWidthFromData,
} from './barGeometry';

describe('bar geometry helpers', () => {
  it('uses local neighbor spacing for irregular categories', () => {
    expect(categoryWidthFromData((idx) => [0, 1, 10][idx], 1, 3)).toBe(1);
    expect(categoryWidthFromData((idx) => [0, 1, 10][idx], 2, 3)).toBe(9);
    expect(categoryWidthFromCenters([0, 12, 120], 1, 50)).toBe(12);
  });

  it('computes grouped bar slots from the same category width', () => {
    const left = barRectForCategory({
      centerX: 100,
      categoryWidth: 40,
      series: { label: 'a', dataIndex: 1, type: 'bar' },
      barSeriesIndex: 0,
      totalBarSeries: 2,
    });
    const right = barRectForCategory({
      centerX: 100,
      categoryWidth: 40,
      series: { label: 'b', dataIndex: 2, type: 'bar' },
      barSeriesIndex: 1,
      totalBarSeries: 2,
    });

    expect(left.left).toBeLessThan(100);
    expect(right.left).toBeGreaterThan(left.left);
    expect(left.width).toBe(right.width);
  });
});
