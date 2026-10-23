import { describe, expect, it, vi } from 'vitest';
import { prepareChart } from './prepare';
import type { ChartOptions } from '../public/types';

describe('public data preparation', () => {
  it('stable-sorts frozen row copies while preserving source identities and gaps', () => {
    const rows = Object.freeze([
      Object.freeze({ time: 3, value: 30, id: 'c' }),
      Object.freeze({ time: 1, value: null, id: 'a' }),
      Object.freeze({ time: 1, value: 12, id: 'b' }),
    ]);
    const result = prepareChart({ data: rows, x: 'time', rowId: 'id', series: [{ y: 'value' }] });
    expect([...result.sources[0][0]]).toEqual([1, 1, 3]);
    expect([...result.sources[0][1]]).toEqual([Number.NaN, 12, 30]);
    expect(result.identities[0]).toEqual({
      sourceIndices: [1, 2, 0],
      rows: [rows[1], rows[2], rows[0]],
      rowIds: ['a', 'b', 'c'],
    });
    expect(result.identities[0].rows?.[0]).toBe(rows[1]);
    expect(rows[0].time).toBe(3);
  });

  it('does not invent persistent row IDs when none are supplied', () => {
    expect(
      prepareChart({ data: [{ x: 1, y: 2 }], x: 'x', series: [{ y: 'y' }] }).identities[0].rowIds,
    ).toBeUndefined();
  });

  it('shares preparation for the same input and keeps independent samples separate', () => {
    const a = [
      { x: 0, a: 1, b: 2 },
      { x: 2, a: 3, b: 4 },
    ];
    const b = [
      { x: 1, a: 7 },
      { x: 1.5, a: 8 },
      { x: 4, a: 9 },
    ];
    const result = prepareChart<Record<string, number>>({
      data: a,
      x: 'x',
      series: [{ y: 'a' }, { y: 'b' }, { id: 'other', data: b, y: 'a' }],
    });
    expect(result.seriesSources).toEqual([0, 0, 1]);
    expect(result.sources).toHaveLength(2);
    expect([...result.sources[0][0]]).toEqual([0, 2]);
    expect([...result.sources[1][0]]).toEqual([1, 1.5, 4]);
    expect(result.sourceInputs).toEqual([a, b]);
    expect(result.config.series.map((series) => series.dataIndex)).toEqual([1, 2, 1]);
  });

  it('retains unordered scatter coordinates and original identity', () => {
    const data = [
      { x: 9, y: 1 },
      { x: 2, y: 3 },
    ];
    const result = prepareChart({ data, x: 'x', series: [{ type: 'scatter', y: 'y' }] });
    expect([...result.sources[0][0]]).toEqual([0, 1]);
    expect([...result.sources[0][result.config.series[0].xDataIndex!]]).toEqual([9, 2]);
    expect(result.identities[0].rows).toEqual(data);
  });

  it('retains unordered named scatter coordinate buffers and original row IDs', () => {
    const columns = {
      row: new Float64Array([10, 20, 30]),
      embeddingX: new Float64Array([8, -2, 3]),
      embeddingY: new Float64Array([2, 4, 6]),
    };
    const result = prepareChart<Record<string, number>>({
      data: { columns, rowIds: ['a', 'b', 'c'] },
      series: [{ type: 'scatter', x: 'embeddingX', y: 'embeddingY' }],
    });
    const series = result.config.series[0];
    expect([...result.sources[0][0]]).toEqual([0, 1, 2]);
    expect(result.sourceFields[0][0]).toBeNull();
    expect(result.sources[0][series.xDataIndex!]).toBe(columns.embeddingX);
    expect(result.sources[0][series.yDataIndex!]).toBe(columns.embeddingY);
    expect(result.identities[0].rowIds).toEqual(['a', 'b', 'c']);
    expect(() =>
      prepareChart<Record<string, number>>({
        data: { columns },
        x: 'embeddingX',
        series: [{ y: 'embeddingY' }],
      }),
    ).toThrow(/sorted/);
  });

  it('uses a stable named-column schema independent of object insertion order', () => {
    const columns = {
      x: new Float64Array([1, 2]),
      cpu: new Float64Array([3, 4]),
      memory: new Float64Array([5, 6]),
    };
    const options: ChartOptions<Record<string, number>> = {
      data: { columns },
      x: 'x',
      series: [{ y: 'cpu' }],
    };
    const first = prepareChart(options);
    const reordered = prepareChart({
      ...options,
      data: { columns: { memory: columns.memory, x: columns.x, cpu: columns.cpu } },
    });
    expect(reordered.sourceFields).toEqual(first.sourceFields);
    expect(reordered.sources[0]).toEqual(first.sources[0]);
    const changed = prepareChart({
      ...options,
      data: { columns: { x: columns.x, cpu: columns.cpu, temperature: columns.memory } },
    });
    expect(changed.sourceFields).not.toEqual(first.sourceFields);
  });

  it('preserves string encoding codes across batches and copies registry transactionally', () => {
    type Row = { x: number; y: number; family: string | null };
    const options: ChartOptions<Row> = {
      data: [
        { x: 1, y: 1, family: 'Atlas' },
        { x: 2, y: 2, family: 'Nova' },
      ],
      x: 'x',
      series: [{ type: 'scatter', y: 'y', colorBy: 'family' }],
    };
    const first = prepareChart(options);
    const batch = prepareChart(
      {
        ...options,
        data: [
          { x: 3, y: 3, family: 'Nova' },
          { x: 4, y: 4, family: 'Sage' },
        ],
      },
      undefined,
      { previousEncodingCategories: first.encodingCategories, sortRows: false },
    );
    const encoding = batch.config.series[0].colorBy;
    expect(typeof encoding).toBe('object');
    if (typeof encoding !== 'object') throw new Error('expected encoding');
    expect([...batch.sources[0][encoding.dataIndex]]).toEqual([1, 2]);
    expect(encoding.format?.(2)).toBe('Sage');
    expect(encoding).toMatchObject({ categoryValues: [0, 1, 2] });
    expect(first.encodingCategories.get('field:family')).toEqual(['Atlas', 'Nova']);
    expect(batch.encodingCategories.get('field:family')).toEqual(['Atlas', 'Nova', 'Sage']);
    expect(batch.sourceFields).toEqual(first.sourceFields);
    const gaps = prepareChart({ ...options, data: [{ x: 5, y: 5, family: null }] }, undefined, {
      previousEncodingCategories: batch.encodingCategories,
    });
    expect(gaps.sourceFields).toEqual(batch.sourceFields);
    expect(gaps.config.series[0].colorBy).toMatchObject({ type: 'category' });
  });

  it('preserves original callback indices and row objects after sorting', () => {
    const rows = [
      { x: 2, y: 4 },
      { x: 1, y: 3 },
    ];
    const fill = vi.fn(() => 'red');
    const x = vi.fn((row: (typeof rows)[number]) => row.x);
    const result = prepareChart({ data: rows, x, series: [{ type: 'bar', y: 'y', fill }] });
    const callback = result.config.series[0].fill as (value: number, index: number) => string;
    callback(3, 0);
    expect(fill).toHaveBeenCalledWith(3, 1, rows[1]);
    expect(x).toHaveBeenNthCalledWith(1, rows[0], 0);
  });

  it('requires explicit IDs for accessors and ambiguous repeated Y fields', () => {
    expect(() =>
      prepareChart({
        data: [{ x: 1, y: 2 }],
        x: 'x',
        series: [{ y: (r: { y: number }) => r.y }],
      } as unknown as ChartOptions<{ x: number; y: number }>),
    ).toThrow(/explicit.*id/);
    expect(() =>
      prepareChart({ data: [], x: 'x', series: [{ y: 'y' }, { y: 'y' }] } as ChartOptions<
        Record<string, number>
      >),
    ).toThrow(/unique/);
    expect(
      prepareChart({ data: [{ x: 1, y: 2 }], x: 'x', series: [{ id: 'computed', y: (r) => r.y }] })
        .seriesIds,
    ).toEqual(['computed']);
  });

  it('infers Dates and honors explicitly configured time axes for numeric timestamps', () => {
    const result = prepareChart({
      data: [
        { x: new Date(2000), y: 1 },
        { x: new Date(1000), y: 2 },
      ],
      x: 'x',
      series: [{ y: 'y' }],
    });
    expect(result.config.axes?.x.type).toBe('time');
    expect([...result.sources[0][0]]).toEqual([1000, 2000]);
    const explicit = prepareChart({
      data: [{ x: 1000, y: 1 }],
      x: 'x',
      series: [{ y: 'y' }],
      axes: { x: { type: 'time' } },
    });
    expect(explicit.config.axes?.x.type).toBe('time');
  });

  it('allows Dates and epoch milliseconds to share an explicitly configured time axis', () => {
    type Row = { x: number | Date; y: number };
    const mixed = prepareChart<Row>({
      data: [
        { x: new Date(2000), y: 2 },
        { x: 1000, y: 1 },
      ],
      x: 'x',
      series: [{ y: 'y' }],
      axes: { x: { type: 'time' } },
    });
    expect([...mixed.sources[0][0]]).toEqual([1000, 2000]);
    const separate = prepareChart<Row>({
      x: 'x',
      series: [
        { id: 'dates', data: [{ x: new Date(1000), y: 1 }], y: 'y' },
        {
          id: 'timestamps',
          data: { columns: { x: new Float64Array([2000]), y: new Float64Array([2]) } },
          y: 'y',
        },
      ],
      axes: { x: { type: 'time' } },
    });
    expect(separate.sources.map((source) => [...source[0]])).toEqual([[1000], [2000]]);
  });

  it('preserves an inferred time axis across empty snapshots but honors explicit replacement', () => {
    const metadata = { previousAxisTypes: new Map([['x', 'time' as const]]) };
    const options: ChartOptions<{ x: Date; y: number }> = {
      data: [],
      x: 'x',
      series: [{ y: 'y' }],
    };
    expect(prepareChart(options, undefined, metadata).config.axes?.x.type).toBe('time');
    expect(
      prepareChart({ ...options, axes: { x: { type: 'linear' } } }, undefined, metadata).config.axes
        ?.x.type,
    ).toBe('linear');
  });

  it('rejects invalid and mixed X values with source context', () => {
    for (const value of [null, undefined, Number.NaN, Infinity, new Date('invalid')]) {
      expect(() =>
        prepareChart({
          data: [{ x: value, y: 1 }],
          x: 'x',
          series: [{ y: 'y' }],
        } as ChartOptions<any>),
      ).toThrow(/X.*series "y".*row 0/);
    }
    expect(() =>
      prepareChart({
        data: [
          { x: new Date(1), y: 1 },
          { x: 2, y: 1 },
        ],
        x: 'x',
        series: [{ y: 'y' }],
      }),
    ).toThrow(/mixes/);
  });

  it('treats missing Y fields as gaps and rejects incompatible values', () => {
    const result = prepareChart<{ x: number; y?: number | null }>({
      data: [{ x: 0 }, { x: 1, y: null }, { x: 2, y: Number.NaN }],
      x: 'x',
      series: [{ y: 'y' }],
    });
    expect([...result.sources[0][1]]).toEqual([Number.NaN, Number.NaN, Number.NaN]);
    for (const y of ['2', Infinity, {}]) {
      expect(() =>
        prepareChart({ data: [{ x: 0, y }], x: 'x', series: [{ y: 'y' }] } as ChartOptions<any>),
      ).toThrow(/field "y".*row 0/);
    }
  });

  it('keeps empty schemas and deduplicates a shared empty source', () => {
    const result = prepareChart<Record<string, number>>({
      x: 'x',
      series: [{ y: 'a' }, { y: 'b' }],
      axes: { x: { type: 'time', title: 'Time' } },
    });
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].map((column) => column.length)).toEqual([0, 0, 0]);
    expect(result.config.axes?.x).toMatchObject({ type: 'time', label: 'Time' });
  });

  it('reuses all referenced typed columns and validates their schema', () => {
    const x = new Float64Array([1, 2]);
    const y = new Float64Array([5, Number.NaN]);
    const result = prepareChart<Record<string, number>>({
      data: { columns: { x, y }, rowIds: ['a', 'b'] },
      x: 'x',
      series: [{ y: 'y' }],
    });
    expect(result.sources[0][0]).toBe(x);
    expect(result.sources[0][1]).toBe(y);
    expect(result.identities[0].rowIds).toEqual(['a', 'b']);
    expect(() =>
      prepareChart<Record<string, number>>({
        data: { columns: { x, y: new Float64Array(1) } },
        x: 'x',
        series: [{ y: 'y' }],
      }),
    ).toThrow(/equal lengths/);
    expect(() =>
      prepareChart<Record<string, number>>({
        data: { columns: { x: new Float64Array([2, 1]), y } },
        x: 'x',
        series: [{ y: 'y' }],
      }),
    ).toThrow(/sorted/);
    expect(() =>
      prepareChart<Record<string, number>>({
        data: { columns: { x, y } },
        x: 'x',
        series: [{ y: 'missing' }],
      }),
    ).toThrow(/missing.*Float64Array/);
  });

  it('validates a shared default column source only once and reports its series on invalid X', () => {
    const columns = {
      x: new Float64Array([1, 2]),
      a: new Float64Array([3, 4]),
      b: new Float64Array([5, 6]),
    };
    const options: ChartOptions<Record<string, number>> = {
      data: { columns },
      x: 'x',
      series: [{ y: 'a' }, { y: 'b' }],
    };
    const result = prepareChart(options);
    expect(result.sourceInputs).toHaveLength(1);
    expect(result.seriesSources).toEqual([0, 0]);
    expect(result.sources[0][1]).toBe(columns.a);
    expect(result.sources[0][2]).toBe(columns.b);
    expect(() =>
      prepareChart({ ...options, data: { columns: { ...columns, x: new Float64Array([2, 1]) } } }),
    ).toThrow(/series "a".*sorted/);
  });

  it('retains unselected named columns for future series updates after streaming', () => {
    const columns = {
      x: new Float64Array([1]),
      shown: new Float64Array([2]),
      later: new Float64Array([3]),
    };
    const result = prepareChart<Record<string, number>>({
      data: { columns },
      x: 'x',
      series: [{ y: 'shown' }],
    });
    expect(result.sources[0]).toHaveLength(3);
    expect(result.sources[0][result.sourceFields[0].indexOf('later')]).toBe(columns.later);
  });

  it('resolves row ID accessors before mapping them into sorted source order', () => {
    const rows = [
      { x: 2, y: 4, name: 'later' },
      { x: 1, y: 2, name: 'first' },
    ];
    const rowId = vi.fn((row: (typeof rows)[number], index: number) => `${row.name}:${index}`);
    const result = prepareChart({ data: rows, x: 'x', rowId, series: [{ y: 'y' }] });
    expect(result.identities[0].rowIds).toEqual(['first:1', 'later:0']);
    expect(rowId).toHaveBeenCalledWith(rows[0], 0);
    expect(rowId).toHaveBeenCalledWith(rows[1], 1);
  });

  it('rejects unordered streaming batches without sorting them', () => {
    const options = {
      data: [
        { x: 2, y: 1 },
        { x: 1, y: 2 },
      ],
      x: 'x',
      series: [{ y: 'y' }],
    } as const;
    expect(() => prepareChart(options, undefined, { sortRows: false })).toThrow(
      /streaming.*sorted|sorted.*streaming/,
    );
    expect(options.data[0].x).toBe(2);
  });

  it('retains category order across updates without mutating prior registry', () => {
    const previous = new Map([['x', ['B', 'A']]]);
    const result = prepareChart(
      {
        data: [
          { x: 'C', y: 3 },
          { x: 'A', y: 2 },
        ],
        x: 'x',
        series: [{ type: 'bar', y: 'y' }],
      },
      previous,
    );
    expect(result.categories.get('x')).toEqual(['B', 'A', 'C']);
    expect(previous.get('x')).toEqual(['B', 'A']);
    expect([...result.sources[0][0]]).toEqual([1, 2]);
    expect(result.config.axes?.x).toMatchObject({
      min: -0.5,
      max: 2.5,
      nice: false,
      padding: 0,
      ticks: [0, 1, 2],
    });
    expect(result.config.axes?.x.tickFormat?.(0)).toBe('B');
  });

  it('preserves authoritative empty categories and formats labels', () => {
    const result = prepareChart({
      data: [{ x: 'B', y: 2 }],
      x: 'x',
      series: [{ type: 'bar', y: 'y' }],
      axes: {
        x: { categories: ['A', 'B', 'C'], format: (label: string) => `Group ${label}` },
      } as never,
    });
    expect(result.categories.get('x')).toEqual(['A', 'B', 'C']);
    expect(result.config.axes?.x.tickFormat?.(1)).toBe('Group B');
    expect(result.config.axes?.x.max).toBe(2.5);
    expect(() =>
      prepareChart({
        data: [{ x: 'D', y: 2 }],
        x: 'x',
        series: [{ y: 'y' }],
        axes: { x: { categories: ['A'] } },
      }),
    ).toThrow(/unknown category "D"/);
  });

  it('shares categories between independent sources on the same axis', () => {
    const result = prepareChart<{ x: string; y: number }>({
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
    expect(result.categories.get('x')).toEqual(['B', 'A']);
    expect([...result.sources[1][0]]).toEqual([0, 1]);
    expect([...result.sources[1][1]]).toEqual([3, 2]);
  });

  it('rejects duplicate bar categories while preserving repeated scatter observations', () => {
    const options = {
      data: [
        { x: 'A', y: 2 },
        { x: 'A', y: 3 },
      ],
      x: 'x',
    } as const;
    expect(() => prepareChart({ ...options, series: [{ type: 'bar', y: 'y' }] })).toThrow(
      /duplicate categories/,
    );
    expect(
      prepareChart({ ...options, series: [{ type: 'scatter', y: 'y' }] }).sources[0][0],
    ).toHaveLength(2);
  });

  it('does not mutate registry when preparation fails after discovering a category', () => {
    const registry = new Map([['x', ['A']]]);
    expect(() =>
      prepareChart({ data: [{ x: 'B', y: Infinity }], x: 'x', series: [{ y: 'y' }] }, registry),
    ).toThrow();
    expect(registry.get('x')).toEqual(['A']);
  });

  it('retains inferred category semantics for an empty update', () => {
    const result = prepareChart<{ x: string; y: number }>(
      { data: [], x: 'x', series: [{ type: 'bar', y: 'y' }] },
      new Map([['x', ['A', 'B']]]),
    );
    expect(result.config.axes?.x.ticks).toEqual([0, 1]);
    expect(result.config.axes?.x.tickFormat?.(1)).toBe('B');
    expect(result.config.axes?.x.max).toBe(1.5);
  });

  it('clears stale category semantics when updating an axis to numeric or time data', () => {
    const categories = new Map([['x', ['A', 'B']]]);
    const numeric = prepareChart(
      {
        data: [
          { x: 0, y: 2 },
          { x: 1, y: 3 },
        ],
        x: 'x',
        series: [{ y: 'y' }],
      },
      categories,
    );
    expect(numeric.categories.has('x')).toBe(false);
    const time = prepareChart(
      { data: [{ x: new Date(1), y: 2 }], x: 'x', series: [{ y: 'y' }] },
      categories,
    );
    expect(time.categories.has('x')).toBe(false);
    expect(time.config.axes?.x.type).toBe('time');
    const empty = prepareChart<{ x: number; y: number }>(
      { data: [], x: 'x', series: [{ y: 'y' }], axes: { x: { type: 'linear' } } },
      categories,
    );
    expect(empty.categories.has('x')).toBe(false);
    expect(categories.get('x')).toEqual(['A', 'B']);
  });

  it('creates correctly oriented custom axis bindings and rejects unknown annotation axes', () => {
    const result = prepareChart({
      data: [{ t: 1, v: 2 }],
      x: 't',
      series: [{ y: 'v', xAxis: 'time', yAxis: 'value' }],
      axes: { time: { title: 'Time' } },
    });
    expect(result.config.axes?.time.position).toBe('bottom');
    expect(result.config.axes?.value.position).toBe('left');
    expect(() =>
      prepareChart({
        data: [{ t: 1, v: 2 }],
        x: 't',
        series: [{ y: 'v' }],
        referenceLines: [{ axis: 'missing', value: 3 }],
      }),
    ).toThrow(/unknown axis/);
  });

  it('validates typed-column row IDs without copying column buffers', () => {
    const data = {
      columns: { x: new Float64Array([1, 2]), y: new Float64Array([3, 4]) },
      rowIds: ['same', 'same'],
    };
    expect(() =>
      prepareChart<Record<string, number>>({ data, x: 'x', series: [{ y: 'y' }] }),
    ).toThrow(/rowId.*unique/);
    expect(() =>
      prepareChart<Record<string, number>>({
        data: { ...data, rowIds: ['short'] },
        x: 'x',
        series: [{ y: 'y' }],
      }),
    ).toThrow(/rowIds.*same length/);
  });

  it('maps named band bounds and scatter encodings locally', () => {
    const data = [
      { x: 1, y: 2, lo: 1, hi: 3, size: 4, group: 'one' },
      { x: 2, y: 3, lo: 2, hi: 4, size: 5, group: 'two' },
    ];
    const result = prepareChart({
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
    const band = result.config.series[0];
    expect([...result.sources[0][band.lowerDataIndex!]]).toEqual([1, 2]);
    expect([...result.sources[0][band.upperDataIndex!]]).toEqual([3, 4]);
    const scatter = result.config.series[1];
    expect(scatter.colorBy).toMatchObject({ type: 'category' });
    expect(typeof scatter.colorBy === 'object' && scatter.colorBy.format?.(1)).toBe('two');
    expect(scatter.sizeBy).toMatchObject({ range: [3, 8] });
    expect(scatter.tooltipFields?.[1]).toMatchObject({ label: 'Upper' });
  });

  it('accepts histogram bins directly without caller padding', () => {
    const bins = {
      edges: new Float64Array([0, 1, 2]),
      counts: new Float64Array([5, 8]),
      maxCount: 8,
    };
    const result = prepareChart({
      series: [{ type: 'histogram', id: 'distribution', data: bins }],
    });
    expect(result.sources[0][0]).toBe(bins.edges);
    expect([...result.sources[0][1]]).toEqual([5, 8, 0]);
    expect(bins.counts).toHaveLength(2);
    expect(() =>
      prepareChart({
        series: [
          {
            type: 'histogram',
            id: 'distribution',
            data: { ...bins, counts: new Float64Array([5, 8, 0]) },
          },
        ],
      }),
    ).toThrow(/Do not pad counts/);
  });

  it('normalizes public axis, streaming, annotation and formatter options', () => {
    const yFormat = vi.fn((value: number, id: string) => `${id}:${value}`);
    const result = prepareChart({
      data: [{ x: 'B', y: 2 }],
      x: 'x',
      series: [{ y: 'y', yAxis: 'right' }],
      axes: {
        x: { categories: ['A', 'B'] },
        right: { title: 'Metric', position: 'right', roundBounds: false, rangePadding: 0.1 },
      },
      streaming: { maxPoints: 40, followWindow: 10 },
      referenceLines: [{ axis: 'right', value: 3 }],
      referenceRegions: [{ axis: 'x', from: 'A', to: 'B' }],
      tooltip: { yFormat },
    });
    expect(result.config.axes?.right).toMatchObject({ label: 'Metric', nice: false, padding: 0.1 });
    expect(result.config.streaming).toEqual({ maxLen: 40, follow: 10 });
    expect(result.referenceLines[0]).toMatchObject({ axis: 'y', axisKey: 'right', value: 3 });
    expect(result.referenceRegions[0]).toMatchObject({ axis: 'x', axisKey: 'x', from: 0, to: 1 });
    expect(result.config.tooltip?.yFormat?.(2, 0)).toBe('y:2');
  });

  it('preserves secondary-axis format fallback alongside a series-specific formatter', () => {
    const result = prepareChart({
      data: [{ x: 1, cpu: 40, temperature: 21 }],
      x: 'x',
      series: [
        { y: 'cpu', format: (value) => `${value}%` },
        { y: 'temperature', yAxis: 'right' },
      ],
      axes: { right: { position: 'right', format: (value) => `${value} °C` } },
    });
    expect(result.config.tooltip?.yFormat?.(40, 0)).toBe('40%');
    expect(result.config.tooltip?.yFormat?.(21, 1)).toBe('21 °C');
    expect(result.config.axes?.right.tickFormat?.(21)).toBe('21 °C');
  });

  it('keeps numeric bar defaults unchanged and only applies explicit public settings', () => {
    const result = prepareChart({
      data: [
        { x: 7, y: 2 },
        { x: 8, y: 3 },
      ],
      x: 'x',
      series: [{ type: 'bar', y: 'y' }],
    });
    expect(result.config.axes).toEqual({});
    expect(result.config.series[0]).toEqual({ type: 'bar', label: 'y', dataIndex: 1 });
  });

  it('validates axis options before an invalid update can reach the renderer', () => {
    const base = { data: [{ x: 1, y: 2 }], x: 'x', series: [{ y: 'y' }] } as const;
    const invalid = [
      { type: 'symlog' },
      { min: NaN },
      { max: Infinity },
      { min: 2, max: 1 },
      { min: 1, max: 1 },
      { type: 'log', min: 0 },
      { type: 'log', max: -1 },
      { rangePadding: -0.1 },
      { rangePadding: Infinity },
      { format: 'not-a-function' },
      { type: 'linear', categories: ['A'] },
    ];
    for (const axis of invalid) {
      expect(() => prepareChart({ ...base, axes: { x: axis } } as ChartOptions<any>)).toThrow(
        /axis "x"/,
      );
    }
    expect(() =>
      prepareChart({ ...base, axes: { x: { type: 'log', min: 0.1, max: 10, rangePadding: 0 } } }),
    ).not.toThrow();
  });
});
