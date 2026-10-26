// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColumnarData } from '../src/engine/spec';
import { dataPoint, drag, type EngineFakes, f, installEngineFakes, tapAt } from './fakes/engine';

// Ported from src/core/Chart.append.test.ts (plan M2).

let fakes: EngineFakes;
beforeEach(() => {
  fakes = installEngineFakes();
});
afterEach(() => fakes.uninstall());

const sources = (): ColumnarData[] => [
  [f([0, 2, 4]), f([1, 2, 3])],
  [f([1, 3, 7, 9]), f([10, 30, 70, 90])],
];
const config = () => ({
  autoResize: false,
  axes: { x: { nice: false }, y: { nice: false, padding: 0 } },
  series: [
    { label: 'a', yColumn: 1 },
    { label: 'b', yColumn: 1 },
  ],
});

describe('engine independent data sources', () => {
  it('ranges across independent sources without padding or joining their rows', () => {
    const input = sources();
    const chart = fakes.engine(config(), { sources: input, seriesSources: [0, 1] });
    expect(chart.getAxis('x')?.min).toBe(0);
    expect(chart.getAxis('x')?.max).toBe(9);
    expect(chart.getAxis('y')?.max).toBe(90);
    expect(chart.getSourceData(0)[0]).toBe(input[0][0]);
    expect(chart.getSourceData(1)[0]).toBe(input[1][0]);
    chart.setAxis('x', { min: 0, max: 3 });
    expect(chart.getAxis('y')?.max).toBeLessThan(90);
  });

  it('samples every source at its own nearest X and latest index', () => {
    const chart = fakes.engine(config(), { sources: sources(), seriesSources: [0, 1] });
    chart.setCursorDataX(3.2);
    const snapshot = chart.getCursorSnapshot();
    expect(snapshot.source).toBe('cursor');
    expect(snapshot.dataX).toBe(3.2);
    expect(snapshot.points.map((p) => [p.dataIndex, p.dataX, p.value])).toEqual([
      [2, 4, 3],
      [1, 3, 30],
    ]);
    chart.setCursorDataX(null);
    expect(
      chart.getCursorSnapshot({ fallback: 'latest' }).points.map((p) => [p.dataX, p.value]),
    ).toEqual([
      [4, 3],
      [9, 90],
    ]);
  });

  it('supports an empty first source while other series draw and provide snapshots', () => {
    const chart = fakes.engine(config(), {
      sources: [[f([]), f([])], sources()[1]],
      seriesSources: [0, 1],
    });
    expect(chart.getAxis('x')?.max).toBe(9);
    chart.setCursorDataX(7);
    expect(chart.getCursorSnapshot().points.map((p) => p.value)).toEqual([70]);
  });

  it('appends to only the chosen bounded source and follows the newest source', () => {
    const chart = fakes.engine(
      { ...config(), streaming: { maxPoints: 3, followWindow: 4 } },
      { sources: sources(), seriesSources: [0, 1] },
    );
    chart.appendToSource(1, [f([10, 12]), f([100, 120])]);
    expect(Array.from(chart.getSourceData(0)[0])).toEqual([0, 2, 4]);
    expect(Array.from(chart.getSourceData(1)[0])).toEqual([9, 10, 12]);
    expect(chart.getAxis('x')?.max).toBe(12);
    expect(chart.getSourceLength(1)).toBe(3);
    expect(chart.getSourceValue(1, 1, 2)).toBe(120);
  });

  it('atomically rejects bad replacements and preserves a manual viewport across valid replacements', () => {
    const chart = fakes.engine(config(), { sources: sources(), seriesSources: [0, 1] });
    chart.setAxis('x', { min: 1, max: 3 });
    chart.setSelection({ x: { min: 1, max: 2 } });
    expect(() => chart.replaceSources(config(), [[f([0]), f([])]], [0, 0])).toThrow();
    expect(chart.getSourceLength(1)).toBe(4);
    expect(chart.getOptions().series[1].label).toBe('b');
    chart.replaceSources({ ...config(), selection: { dataChange: 'preserve' } }, sources(), [1, 0]);
    expect(chart.getAxis('x')?.min).toBe(1);
    expect(chart.getAxis('x')?.max).toBe(3);
    expect(chart.getSelection()?.x).toEqual({ min: 1, max: 2 });
    expect(chart.isFollowing()).toBe(false);
  });

  it('uses each scatter source for selection and encoded coordinates', () => {
    const onSelect = vi.fn();
    const chart = fakes.engine(
      {
        ...config(),
        zoom: { enabled: false, x: true, y: true },
        selection: { onSelect },
        series: [
          { label: 'a', type: 'scatter', xColumn: 1, yColumn: 2 },
          { label: 'b', type: 'scatter', xColumn: 1, yColumn: 2 },
        ],
      },
      {
        sources: [
          [f([0, 1]), f([4, 1]), f([10, 20])],
          [f([0, 1, 2]), f([6, 2, 8]), f([30, 40, 50])],
        ],
        seriesSources: [0, 1],
      },
    );
    // A box drag from (1.5, 45) to (7, 5); the end lies below the plot and is clamped.
    drag(chart, dataPoint(chart, 1.5, 45), dataPoint(chart, 7, 5));
    expect(
      onSelect.mock.calls[0][0].points.map(
        (p: { seriesIndex: number; dataIndex: number; x: number }) => [
          p.seriesIndex,
          p.dataIndex,
          p.x,
        ],
      ),
    ).toEqual([
      [0, 0, 4],
      [1, 0, 6],
      [1, 1, 2],
    ]);
    chart.setCursorDataX(2.1);
    expect(chart.getCursorSnapshot().points.map((p) => [p.dataX, p.value])).toEqual([
      [1, 20],
      [2, 40],
    ]);
  });

  it('rejects a malformed updateLast tail before changing the source', () => {
    const chart = fakes.engine(config(), { sources: sources(), seriesSources: [0, 1] });
    expect(() =>
      chart.appendToSource(1, [f([9, 8]), f([900, 800])], { updateLast: true }),
    ).toThrow();
    expect(chart.getSourceValue(1, 1, 3)).toBe(90);
    expect(chart.getSourceLength(1)).toBe(4);
  });

  it('emits a point-click payload with the independent series and source-local row', () => {
    const chart = fakes.engine(config(), { sources: sources(), seriesSources: [0, 1] });
    const onClick = vi.fn();
    chart.on('point:click', onClick);
    tapAt(chart, dataPoint(chart, 7, 70));
    expect(onClick).toHaveBeenCalledWith(
      expect.objectContaining({ seriesIndex: 1, dataIndex: 2, x: 7, y: 70 }),
    );
    tapAt(chart, dataPoint(chart, 9, 30));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
