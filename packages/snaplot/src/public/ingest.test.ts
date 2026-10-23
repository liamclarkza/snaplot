import { describe, expect, it, vi } from 'vitest';
import { type IngestContext, ingest, parseIso } from './ingest';
import { normalize } from './normalize';
import type { ChartOptions } from './types';

function run<Row = Record<string, any>>(
  options: ChartOptions<Row>,
  context: Partial<IngestContext<Row>> = {},
) {
  return ingest(normalize(options), { counters: { xValidations: 0 }, ...context });
}

const values = (column: ArrayLike<number>) => Array.from(column);

describe('ingest (plan §3.2, D18, D23)', () => {
  it('stable-sorts rows by X and keeps each row, its original index and its id', () => {
    const rows = Object.freeze([
      Object.freeze({ time: 3, value: 30, id: 'c' }),
      Object.freeze({ time: 1, value: null, id: 'a' }),
      Object.freeze({ time: 1, value: 12, id: 'b' }),
    ]);
    const result = run({ data: rows, x: 'time', rowId: 'id', series: [{ y: 'value' }] });
    const source = result.sources[0];
    expect(values(source.columns[0])).toEqual([1, 1, 3]);
    expect(values(source.columns[1])).toEqual([Number.NaN, 12, 30]);
    expect(source.index).toEqual([1, 2, 0]);
    expect(source.rows?.[0]).toBe(rows[1]);
    expect(source.rowIds).toEqual(['a', 'b', 'c']);
    expect(rows[0].time).toBe(3);
  });

  it('does not invent row ids', () => {
    expect(run({ data: [{ x: 1, y: 2 }], x: 'x', series: [{ y: 'y' }] }).sources[0].rowIds).toBe(
      undefined,
    );
  });

  it('shares one source between series with the same data and X', () => {
    const a = [
      { x: 0, a: 1, b: 2 },
      { x: 2, a: 3, b: 4 },
    ];
    const b = [
      { x: 1, a: 7 },
      { x: 4, a: 9 },
    ];
    const result = run<Record<string, number>>({
      data: a,
      x: 'x',
      series: [{ y: 'a' }, { y: 'b' }, { id: 'other', data: b, y: 'a' }],
    });
    expect(result.seriesSources).toEqual([0, 0, 1]);
    expect(result.sources.map((source) => source.declared)).toEqual([a, b]);
    expect(result.spec.series.map((series) => series.yColumn)).toEqual([1, 2, 1]);
  });

  it('keeps an unordered scatter source in row order with an index column', () => {
    const data = [
      { x: 9, y: 1 },
      { x: 2, y: 3 },
    ];
    const result = run({ data, x: 'x', series: [{ type: 'scatter', y: 'y' }] });
    const source = result.sources[0];
    expect(source.sortedX).toBe(false);
    expect(values(source.columns[0])).toEqual([0, 1]);
    expect(values(source.columns[result.spec.series[0].xColumn!])).toEqual([9, 2]);
    expect(source.rows).toEqual(data);
  });

  it('stores a sorted scatter source by X (the sorted-X flag)', () => {
    const result = run({
      data: [
        { x: 1, y: 1 },
        { x: 2, y: 3 },
      ],
      x: 'x',
      series: [{ type: 'scatter', y: 'y' }],
    });
    expect(result.sources[0].sortedX).toBe(true);
    expect(result.spec.series[0].xColumn ?? 0).toBe(0);
  });

  it('uses typed columns in place, with one X pass per source', () => {
    const x = new Float64Array([1, 2]);
    const y = new Float64Array([5, Number.NaN]);
    const counters = { xValidations: 0 };
    const result = run<Record<string, number>>(
      {
        data: { columns: { x, y }, rowIds: ['a', 'b'] },
        x: 'x',
        series: [{ y: 'y' }, { y: 'y', id: 'again' }],
      },
      { counters },
    );
    expect(result.sources[0].columns[0]).toBe(x);
    expect(result.sources[0].columns[1]).toBe(y);
    expect(result.sources[0].rowIds).toEqual(['a', 'b']);
    expect(counters.xValidations).toBe(1);
  });

  it('keeps unselected named columns, in name order, for later series', () => {
    const columns = {
      x: new Float64Array([1]),
      shown: new Float64Array([2]),
      later: new Float64Array([3]),
    };
    const result = run<Record<string, number>>({
      data: { columns },
      x: 'x',
      series: [{ y: 'shown' }],
    });
    const fields = result.sources[0].fields;
    expect(fields.map((field) => (field.kind === 'field' ? field.name : field.kind))).toEqual([
      'x',
      'later',
      'shown',
    ]);
    const reordered = run<Record<string, number>>({
      data: { columns: { shown: columns.shown, later: columns.later, x: columns.x } },
      x: 'x',
      series: [{ y: 'shown' }],
    });
    expect(reordered.sources[0].fields).toEqual(fields);
  });

  it('keeps unsorted scatter columns zero-copy and rejects unsorted line columns', () => {
    const columns = {
      row: new Float64Array([10, 20, 30]),
      embeddingX: new Float64Array([8, -2, 3]),
      embeddingY: new Float64Array([2, 4, 6]),
    };
    const result = run<Record<string, number>>({
      data: { columns, rowIds: ['a', 'b', 'c'] },
      x: 'embeddingX',
      series: [{ type: 'scatter', y: 'embeddingY' }],
    });
    const series = result.spec.series[0];
    expect(result.sources[0].columns[series.xColumn!]).toBe(columns.embeddingX);
    expect(result.sources[0].columns[series.yColumn!]).toBe(columns.embeddingY);
    expect(() =>
      run<Record<string, number>>({
        data: { columns },
        x: 'embeddingX',
        series: [{ y: 'embeddingY' }],
      }),
    ).toThrow('columns must be sorted by x; pass rows to have them sorted.');
  });

  it('validates typed-column schemas', () => {
    const x = new Float64Array([1, 2]);
    const y = new Float64Array([5, 6]);
    const base = { x: 'x', series: [{ y: 'y' }] } as const;
    expect(() => run({ ...base, data: { columns: { x, y: new Float64Array(1) } } })).toThrow(
      /column "y" has 1 values; x has 2/,
    );
    expect(() => run({ ...base, data: { columns: { x, y }, rowIds: ['short'] } })).toThrow(
      /rowIds has 1 ids for 2 rows/,
    );
    expect(() => run({ ...base, data: { columns: { x, y }, rowIds: ['same', 'same'] } })).toThrow(
      /rowId "same" appears twice/,
    );
    expect(() => run({ ...base, data: { columns: { time: x, y } } })).toThrow(
      /no Float64Array column "x" for x/,
    );
  });

  it('reads each row id accessor with the original row index', () => {
    const rows = [
      { x: 2, y: 4, name: 'later' },
      { x: 1, y: 2, name: 'first' },
    ];
    const rowId = vi.fn((row: (typeof rows)[number], index: number) => `${row.name}:${index}`);
    const result = run({ data: rows, x: 'x', rowId, series: [{ y: 'y' }] });
    expect(result.sources[0].rowIds).toEqual(['first:1', 'later:0']);
  });

  it('infers time from Dates and ISO strings, and honours an explicit time axis', () => {
    const dates = run({
      data: [
        { x: new Date(2000), y: 1 },
        { x: new Date(1000), y: 2 },
      ],
      x: 'x',
      series: [{ y: 'y' }],
    });
    expect(dates.spec.axes?.x.type).toBe('time');
    expect(values(dates.sources[0].columns[0])).toEqual([1000, 2000]);
    const mixed = run<{ x: number | Date; y: number }>({
      data: [
        { x: new Date(2000), y: 2 },
        { x: 1000, y: 1 },
      ],
      x: 'x',
      series: [{ y: 'y' }],
      axes: { x: { type: 'time' } },
    });
    expect(values(mixed.sources[0].columns[0])).toEqual([1000, 2000]);
    expect(parseIso('2026-03-01T00:00:00Z', 'local')).toBe(Date.UTC(2026, 2, 1));
    expect(parseIso('2026-03-01T01:30:00+01:30', 'local')).toBe(Date.UTC(2026, 2, 1));
    expect(parseIso('2026-03-01', 'UTC')).toBe(Date.UTC(2026, 2, 1));
    expect(parseIso('2026-03-01', 'local')).toBe(new Date(2026, 2, 1).getTime());
    expect(parseIso('2026-13-01', 'UTC')).toBeNaN();
  });

  it('keeps an inferred time axis across empty data, unless the type is explicit', () => {
    const previousTypes = new Map([['x', 'time' as const]]);
    const options: ChartOptions<{ x: Date; y: number }> = {
      data: [],
      x: 'x',
      series: [{ y: 'y' }],
    };
    expect(run(options, { previousTypes }).spec.axes?.x.type).toBe('time');
  });

  it('rejects invalid X values and an axis that mixes kinds, naming the row', () => {
    for (const value of [null, undefined, Number.NaN, Infinity]) {
      expect(() =>
        run({
          data: [
            { x: value, y: 1 },
            { x: 1, y: 1 },
          ],
          x: 'x',
          series: [{ y: 'y' }],
        } as ChartOptions<any>),
      ).toThrow(/series "y": x of row 0 is/);
    }
    expect(() =>
      run({ data: [{ x: new Date('invalid'), y: 1 }], x: 'x', series: [{ y: 'y' }] }),
    ).toThrow(/x of row 0/);
    expect(() =>
      run({
        x: 'x',
        series: [
          { id: 'a', data: [{ x: 1, y: 1 }], y: 'y' },
          { id: 'b', data: [{ x: 'A', y: 1 }], y: 'y' },
        ],
      } as ChartOptions<any>),
    ).toThrow(/axis "x" would hold both numbers and category labels/);
  });

  it('treats missing Y as gaps and rejects values that are not numbers', () => {
    const result = run<{ x: number; y?: number | null }>({
      data: [{ x: 0 }, { x: 1, y: null }, { x: 2, y: Number.NaN }],
      x: 'x',
      series: [{ y: 'y' }],
    });
    expect(values(result.sources[0].columns[1])).toEqual([Number.NaN, Number.NaN, Number.NaN]);
    for (const y of ['2', Infinity, {}]) {
      expect(() =>
        run({ data: [{ x: 0, y }], x: 'x', series: [{ y: 'y' }] } as ChartOptions<any>),
      ).toThrow(/field "y" of row 0/);
    }
  });

  it('keeps an empty schema and shares the empty default source', () => {
    const result = run<Record<string, number>>({
      x: 'x',
      series: [{ y: 'a' }, { y: 'b' }],
      axes: { x: { type: 'time', title: 'Time' } },
    });
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].columns.map((column) => column.length)).toEqual([0, 0, 0]);
    expect(result.spec.axes?.x).toMatchObject({ type: 'time', title: 'Time' });
  });

  it('builds categories in first-seen order and shares them between sources on one axis', () => {
    const result = run<{ x: string; y: number }>({
      x: 'x',
      series: [
        { id: 'first', data: [{ x: 'B', y: 1 }], y: 'y' },
        {
          id: 'second',
          data: [
            { x: 'A', y: 2 },
            { x: 'B', y: 3 },
          ],
          y: 'y',
        },
      ],
    });
    expect(result.categories.get('x')?.list()).toEqual(['B', 'A']);
    expect(values(result.sources[1].columns[0])).toEqual([0, 1]);
    expect(values(result.sources[1].columns[1])).toEqual([3, 2]);
    expect(result.spec.axes?.x).toMatchObject({ min: 0, max: 1, nice: false, ticks: [0, 1] });
    expect(result.spec.axes?.x.format?.(1)).toBe('A');
  });

  it('keeps explicit categories, empty ones included, and rejects unknown labels', () => {
    const result = run({
      data: [{ x: 'B', y: 2 }],
      x: 'x',
      series: [{ type: 'bar', y: 'y' }],
      axes: { x: { categories: ['A', 'B', 'C'] } },
    });
    expect(result.categories.get('x')?.list()).toEqual(['A', 'B', 'C']);
    expect(result.spec.axes?.x.max).toBe(2.5);
    expect(() =>
      run({
        data: [{ x: 'D', y: 2 }],
        x: 'x',
        series: [{ y: 'y' }],
        axes: { x: { categories: ['A'] } },
      }),
    ).toThrow(/"D", which is not one of axes\.x\.categories/);
  });

  it('rejects repeated bar categories and keeps repeated scatter observations', () => {
    const data = [
      { x: 'A', y: 2 },
      { x: 'A', y: 3 },
    ];
    expect(() => run({ data, x: 'x', series: [{ type: 'bar', y: 'y' }] })).toThrow(
      /the same category twice/,
    );
    expect(
      run({ data, x: 'x', series: [{ type: 'scatter', y: 'y' }] }).sources[0].rows,
    ).toHaveLength(2);
  });

  it('keeps string encoding codes stable across ingests', () => {
    type Row = { x: number; y: number; family: string | null };
    const options: ChartOptions<Row> = {
      data: [
        { x: 1, y: 1, family: 'Atlas' },
        { x: 2, y: 2, family: 'Nova' },
      ],
      x: 'x',
      series: [{ type: 'scatter', y: 'y', colorBy: 'family' }],
    };
    const first = run(options);
    const next = run(
      {
        ...options,
        data: [
          { x: 3, y: 3, family: 'Nova' },
          { x: 4, y: 4, family: 'Sage' },
        ],
      },
      { previousEncodings: first.encodings },
    );
    const encoding = next.spec.series[0].colorBy;
    if (typeof encoding !== 'object') throw new Error('expected an encoding');
    expect(values(next.sources[0].columns[encoding.column])).toEqual([1, 2]);
    expect(encoding.format?.(2)).toBe('Sage');
    expect([...(first.encodings.values().next().value ?? [])]).toEqual(['Atlas', 'Nova']);
  });

  it('positions custom axes and rejects annotations on unknown axes', () => {
    const result = run({
      data: [{ t: 1, v: 2 }],
      x: 't',
      series: [{ y: 'v', xAxis: 'time', yAxis: 'value' }],
      axes: { time: { title: 'Time' } },
    });
    expect(result.spec.axes?.time.position).toBe('bottom');
    expect(result.spec.axes?.value.position).toBe('left');
    expect(() =>
      run({
        data: [{ t: 1, v: 2 }],
        x: 't',
        series: [{ y: 'v' }],
        referenceLines: [{ axis: 'missing', value: 3 }],
      }),
    ).toThrow(/missing/);
  });

  it('maps band bounds and scatter encodings to their columns', () => {
    const data = [
      { x: 1, y: 2, lo: 1, hi: 3, size: 4, group: 'one' },
      { x: 2, y: 3, lo: 2, hi: 4, size: 5, group: 'two' },
    ];
    const result = run({
      data,
      x: 'x',
      series: [
        { id: 'band', type: 'band', y: 'y', lower: 'lo', upper: 'hi' },
        {
          id: 'scatter',
          type: 'scatter',
          y: 'y',
          colorBy: 'group',
          sizeBy: { field: 'size', range: [3, 8] },
          tooltipFields: ['group', { field: 'hi', label: 'Upper' }],
        },
      ],
    });
    const band = result.spec.series[0];
    const columns = result.sources[0].columns;
    expect(values(columns[band.lowerColumn!])).toEqual([1, 2]);
    expect(values(columns[band.upperColumn!])).toEqual([3, 4]);
    const scatter = result.spec.series[1];
    expect(typeof scatter.colorBy === 'object' && scatter.colorBy.format?.(1)).toBe('two');
    expect(scatter.sizeBy).toMatchObject({ range: [3, 8] });
    expect(scatter.tooltipFields?.[1]).toMatchObject({ label: 'Upper' });
  });

  it('takes histogram bins as they are, without padded counts', () => {
    const bins = {
      edges: new Float64Array([0, 1, 2]),
      counts: new Float64Array([5, 8]),
      maxCount: 8,
    };
    const result = run({ series: [{ type: 'histogram', id: 'distribution', data: bins }] });
    expect(result.sources[0].columns[0]).toBe(bins.edges);
    expect(values(result.sources[0].columns[1])).toEqual([5, 8, 0]);
    expect(() =>
      run({
        series: [
          {
            type: 'histogram',
            id: 'distribution',
            data: { ...bins, counts: new Float64Array([5, 8, 0]) },
          },
        ],
      }),
    ).toThrow(/one count per bin/);
  });

  it('turns axis, streaming and annotation options into engine terms', () => {
    const result = run({
      data: [{ x: 'B', y: 2 }],
      x: 'x',
      series: [{ y: 'y', yAxis: 'right' }],
      axes: { x: { categories: ['A', 'B'] }, right: { title: 'Metric', position: 'right' } },
      streaming: { maxPoints: 40, followWindow: 10 },
      referenceLines: [{ axis: 'right', value: 3 }],
      referenceRegions: [{ axis: 'x', from: 'A', to: 'B' }],
    });
    expect(result.spec.axes?.right).toMatchObject({ title: 'Metric', position: 'right' });
    expect(result.spec.streaming).toEqual({ maxPoints: 40, followWindow: 10 });
    expect(result.referenceLines[0]).toMatchObject({ axis: 'y', axisKey: 'right', value: 3 });
    expect(result.referenceRegions[0]).toMatchObject({ axis: 'x', axisKey: 'x', from: 0, to: 1 });
  });

  it('leaves numeric bar axes alone', () => {
    const result = run({
      data: [
        { x: 7, y: 2 },
        { x: 8, y: 3 },
      ],
      x: 'x',
      series: [{ type: 'bar', y: 'y' }],
    });
    expect(result.spec.axes?.x).toBeUndefined();
    expect(result.spec.series[0]).toMatchObject({ type: 'bar', label: 'y', yColumn: 1 });
  });
});
