import { describe, expect, it } from 'vitest';
import { ColumnarStore } from '../../data/ColumnarStore';
import { LinearScale } from '../../scales/LinearScale';
import type { HeatmapSpec } from '../../spec';
import {
  cellAt,
  pixelCells,
  rowSpans,
  spansFromCenters,
  spansFromEdges,
  spansFromStep,
} from './cells';
import { buildLut, type ColorMapping, LUT_SIZE, packPixel, pixelOf } from './colors';
import { fillCells } from './draw';

const f = (values: number[]) => Float64Array.from(values);
const spans = (centers: number[]) => {
  const lo = new Float64Array(centers.length);
  const hi = new Float64Array(centers.length);
  spansFromCenters(centers.length, (i) => centers[i], lo, hi);
  return [...lo].map((low, i) => [low, hi[i]]);
};

describe('heatmap cells', () => {
  it('reaches half way to each neighbour on a regular or a gently growing grid', () => {
    expect(spans([0, 1, 2])).toEqual([
      [-0.5, 0.5],
      [0.5, 1.5],
      [1.5, 2.5],
    ]);
    // A log-spaced grid (each step 1.5 times the last) has no gaps.
    expect(spans([1, 2, 3.5, 5.75])).toEqual([
      [0.5, 1.5],
      [1.5, 2.75],
      [2.75, 4.625],
      [4.625, 6.875],
    ]);
  });

  it('leaves a missing bin empty: the cells beside a wide step keep their other half step', () => {
    // 2424 and 2425, then 2429 and 2430: 2426 to 2428 are missing.
    expect(spans([2424, 2425, 2429, 2430])).toEqual([
      [2423.5, 2424.5],
      [2424.5, 2425.5],
      [2428.5, 2429.5],
      [2429.5, 2430.5],
    ]);
  });

  it('gives a cell between two gaps the smallest step, and a lone cell the whole axis', () => {
    expect(spans([0, 1, 5, 9, 10])[2]).toEqual([4.5, 5.5]);
    expect(spans([7])).toEqual([[-Infinity, Infinity]]);
  });

  it('reads edges and regular steps', () => {
    const edges = spansFromEdges([0, 10, 20, 50]);
    expect([...edges.lo]).toEqual([0, 10, 20]);
    expect([...edges.hi]).toEqual([10, 20, 50]);
    const steps = spansFromStep(2404, 1, 3);
    expect([...steps.lo]).toEqual([2403.5, 2404.5, 2405.5]);
  });

  it('finds the cell holding a value, an upper cell on a shared edge, -1 in a gap', () => {
    const lo = f([0, 1, 5]);
    const hi = f([1, 2, 6]);
    expect(cellAt(lo, hi, 3, 0.5)).toBe(0);
    expect(cellAt(lo, hi, 3, 1)).toBe(1);
    expect(cellAt(lo, hi, 3, 3)).toBe(-1);
    expect(cellAt(lo, hi, 3, -1)).toBe(-1);
    expect(cellAt(lo, hi, 3, 7)).toBe(-1);
  });

  it('maps each device pixel to the cell under its centre', () => {
    const scale = new LinearScale('x', 0, 4);
    scale.setPixelRange(0, 8);
    const out = pixelCells(f([0, 1, 3]), f([1, 2, 4]), 3, scale, 0, 8, new Int32Array(8));
    // Two device pixels per unit: cell 0, cell 1, a gap, cell 2.
    expect([...out]).toEqual([0, 0, 1, 1, -1, -1, 2, 2]);
  });

  it("spans a stream's rows against their typical step: jitter never opens a gap", () => {
    const spec = { rows: 'y' } as HeatmapSpec;
    // Rows every 100 ms, one 180 ms late, then 20 ms early; then a 1 s pause.
    const x = f([0, 100, 200, 380, 400, 500, 1500, 1600]);
    const store = new ColumnarStore([x]);
    const lo = new Float64Array(x.length);
    const hi = new Float64Array(x.length);
    rowSpans(store, spec, 0, x.length - 1, lo, hi);
    expect([...lo]).toEqual([-50, 50, 150, 290, 390, 450, 1450, 1550]);
    expect([...hi]).toEqual([50, 150, 290, 390, 450, 550, 1550, 1650]);
  });

  it("uses a grid's own row spans, the last rows of them when a ring keeps fewer", () => {
    const spec = { rows: 'x', rowLo: f([0, 1, 2]), rowHi: f([1, 2, 4]) } as HeatmapSpec;
    const store = new ColumnarStore([f([1.5, 3])]);
    const lo = new Float64Array(2);
    const hi = new Float64Array(2);
    rowSpans(store, spec, 0, 1, lo, hi);
    expect([...lo]).toEqual([1, 2]);
    expect([...hi]).toEqual([2, 4]);
  });
});

describe('heatmap colours', () => {
  const mapping = (overrides: Partial<ColorMapping> = {}): ColorMapping => ({
    lut: buildLut(['#000000', '#ffffff'], false),
    empty: packPixel(1, 2, 3),
    stops: ['#000000', '#ffffff'],
    emptyColor: 'rgb(1, 2, 3)',
    min: 0,
    max: 10,
    cyclic: false,
    clamp: true,
    ...overrides,
  });
  const grey = (v: number) => packPixel(v, v, v);

  it('interpolates its stops in sRGB, low to high', () => {
    const lut = buildLut(['#000000', '#ffffff'], false);
    expect(lut.length).toBe(LUT_SIZE);
    expect(lut[0]).toBe(grey(0));
    expect(lut[LUT_SIZE - 1]).toBe(grey(255));
    expect(lut[128]).toBe(grey(128));
  });

  it('closes a cyclic map on its first stop', () => {
    const lut = buildLut(['#000000', '#ffffff'], true);
    expect(lut[0]).toBe(grey(0));
    expect(lut[LUT_SIZE / 2]).toBe(grey(255));
    // The last entry is one step short of the full turn: nearly back to black.
    expect(lut[LUT_SIZE - 1]).toBe(grey(2));
  });

  it('draws NaN (null) in the empty colour, not as the low end', () => {
    const m = mapping();
    expect(pixelOf(m, Number.NaN, 0.1)).toBe(m.empty);
    expect(pixelOf(m, 0, 0.1)).toBe(grey(0));
  });

  it('clamps values past the domain, or leaves them undrawn without clamp', () => {
    expect(pixelOf(mapping(), 20, 0.1)).toBe(grey(255));
    expect(pixelOf(mapping(), -5, 0.1)).toBe(grey(0));
    expect(pixelOf(mapping({ clamp: false }), 20, 0.1)).toBe(0);
    expect(pixelOf(mapping({ clamp: false }), 10, 0.1)).toBe(grey(255));
  });

  it('wraps a cyclic map: a turn past the domain is the same colour', () => {
    const m = mapping({ lut: buildLut(['#000000', '#ffffff'], true), cyclic: true });
    expect(pixelOf(m, 12.5, 0.1)).toBe(pixelOf(m, 2.5, 0.1));
    expect(pixelOf(m, -7.5, 0.1)).toBe(pixelOf(m, 2.5, 0.1));
  });
});

describe('heatmap bitmap', () => {
  it('fills a run of pixels per cell, copies repeated rows, and leaves gaps transparent', () => {
    const pixels = new Uint32Array(4 * 3);
    // Columns: cell 0, cell 0, a gap, cell 1. Rows: cell 0, cell 0, cell 1.
    const columns = Int32Array.from([0, 0, -1, 1]);
    const rows = Int32Array.from([0, 0, 1]);
    let calls = 0;
    fillCells(pixels, 4, 3, columns, rows, 2, (v, out) => {
      calls++;
      for (let h = 0; h < 2; h++) out[h] = 10 * (v + 1) + h + 1;
    });
    expect([...pixels]).toEqual([11, 11, 0, 12, 11, 11, 0, 12, 21, 21, 0, 22]);
    // One call per distinct pixel row: the copied row asks for nothing.
    expect(calls).toBe(2);
  });
});
