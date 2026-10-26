import { describe, expect, it, vi } from 'vitest';
import type { ChartType, SeriesSpec } from '../spec';
import { markOf, TOOLTIP_RANKS, xColumnOf } from './index';

const TYPES: ChartType[] = ['line', 'area', 'band', 'scatter', 'bar', 'histogram'];
const series = (type: ChartType | undefined, extra: Partial<SeriesSpec> = {}): SeriesSpec => ({
  type,
  label: String(type),
  yColumn: 1,
  ...extra,
});

describe('the mark registry (plan §3.1)', () => {
  it('has one mark per series type, and a series without a type is a line', () => {
    for (const type of TYPES) expect(markOf(series(type)).type).toBe(type);
    expect(markOf(series(undefined))).toBe(markOf(series('line')));
  });

  it('keeps the traits the engine modules branched on', () => {
    const trait = (type: ChartType) => {
      const { draw, hit } = markOf(series(type));
      return [draw.x, draw.zeroBased, draw.cloud, draw.interaction, hit.tooltipRank];
    };
    expect(Object.fromEntries(TYPES.map((type) => [type, trait(type)]))).toEqual({
      line: ['continuous', false, false, 'decimate', 0],
      // Areas fill to zero, so their domain includes it (visuals-02).
      area: ['continuous', true, false, 'decimate', 0],
      band: ['continuous', false, false, 'none', 0],
      scatter: ['continuous', false, true, 'sample', 0],
      bar: ['slot', true, false, 'none', 1],
      histogram: ['bin', true, false, 'none', 2],
    });
    expect(TOOLTIP_RANKS).toEqual([1, 2]);
  });

  it('reads X from the store unless a scatter names its own column', () => {
    for (const type of TYPES)
      expect(xColumnOf(series(type, { xColumn: 3 }))).toBe(type === 'scatter' ? 3 : 0);
    expect(xColumnOf(series('scatter'))).toBe(0);
  });

  it('spans the band bounds, upper first, and nothing else', () => {
    const extent = (s: SeriesSpec) => [...markOf(s).draw.extentColumns(s)];
    expect(extent(series('band', { upperColumn: 2, lowerColumn: 3 }))).toEqual([2, 3]);
    expect(extent(series('band', { lowerColumn: 3 }))).toEqual([3]);
    expect(extent(series('band'))).toEqual([]);
    expect(extent(series('line', { upperColumn: 2, lowerColumn: 3 }))).toEqual([]);
  });

  it('gives stroke marks no legend fill', () => {
    const fills = TYPES.map((type) => markOf(series(type)).draw.legendFill('#123456'));
    expect(fills).toEqual([null, '#123456', '#123456', null, '#123456', '#123456']);
  });

  it('builds the registry whichever mark half is imported first (no load-order cycle)', async () => {
    const halves = [
      './line/draw',
      './line/hit',
      './area/draw',
      './area/hit',
      './band/draw',
      './band/hit',
      './scatter/draw',
      './scatter/hit',
      './bar/draw',
      './bar/hit',
      './histogram/draw',
      './histogram/hit',
      '../hit',
      '../cursor',
    ];
    for (const half of halves) {
      vi.resetModules();
      await import(half);
      const registry = await import('./index');
      expect(registry.markOf(series('bar')).hit.tooltipRank, half).toBe(1);
    }
  });
});
