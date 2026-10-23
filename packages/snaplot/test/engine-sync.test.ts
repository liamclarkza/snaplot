// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ColumnarData, SeriesConfig } from '../src/types';
import {
  dragStart,
  type EngineFakes,
  f,
  hoverAt,
  installEngineFakes,
  leave,
  plotPoint,
  press,
} from './fakes/engine';

// Ported from src/core/Chart.append.test.ts (plan M2): the engine's own
// key-based sync (cursor, highlight and zoom `syncKey`).

let fakes: EngineFakes;
beforeEach(() => {
  fakes = installEngineFakes();
});
afterEach(() => fakes.uninstall());

describe('engine cursor sync', () => {
  it('rebinds cursor sync groups when sync keys are added, changed, or cleared', () => {
    const data: ColumnarData = [f([0, 50, 100]), f([0, 1, 0])];
    const chartA = fakes.engine({ series: [{ label: 'value', dataIndex: 1 }] }, data);
    const chartB = fakes.engine(
      { cursor: { syncKey: 'group-a' }, series: [{ label: 'value', dataIndex: 1 }] },
      data,
    );
    const chartC = fakes.engine(
      { cursor: { syncKey: 'group-b' }, series: [{ label: 'value', dataIndex: 1 }] },
      data,
    );

    chartA.setOptions({ cursor: { syncKey: 'group-a' } });
    hoverAt(chartA, plotPoint(chartA, 0.5));
    expect(chartB.getCursorSnapshot({ fallback: 'hide' }).source).toBe('cursor');
    expect(chartC.getCursorSnapshot({ fallback: 'hide' }).source).toBe('none');

    chartA.setOptions({ cursor: { syncKey: 'group-b' } });
    hoverAt(chartA, plotPoint(chartA, 0.8));
    expect(chartB.getCursorSnapshot({ fallback: 'hide' }).dataX).toBe(50);
    expect(chartC.getCursorSnapshot({ fallback: 'hide' }).dataX).toBe(100);

    chartA.setOptions({ cursor: { syncKey: null } });
    hoverAt(chartA, plotPoint(chartA, 0.2));
    expect(chartC.getCursorSnapshot({ fallback: 'hide' }).dataX).toBe(100);
  });

  it('clears synced peers when the local cursor moves outside the plot area', () => {
    const syncKey = 'cursor-clear-test';
    const data: ColumnarData = [f([0, 50, 100]), f([0, 1, 0])];
    const chartA = fakes.engine(
      { cursor: { syncKey }, series: [{ label: 'value', dataIndex: 1 }] },
      data,
    );
    const chartB = fakes.engine(
      { cursor: { syncKey }, series: [{ label: 'value', dataIndex: 1 }] },
      data,
    );

    const inside = plotPoint(chartA, 0.5);
    hoverAt(chartA, inside);
    expect(chartB.getCursorSnapshot({ fallback: 'hide' }).source).toBe('cursor');

    const { plot } = chartA.getLayout();
    hoverAt(chartA, { x: inside.x, y: plot.top + plot.height + 8 });

    expect(chartB.getCursorSnapshot({ fallback: 'hide' }).source).toBe('none');
  });

  it('emits cursor events from synced peers so reactive snapshots refresh', () => {
    const syncKey = 'cursor-peer-event-test';
    const data: ColumnarData = [f([0, 50, 100]), f([0, 1, 0])];
    const chartA = fakes.engine(
      { cursor: { syncKey }, series: [{ label: 'value', dataIndex: 1 }] },
      data,
    );
    const chartB = fakes.engine(
      { cursor: { syncKey }, series: [{ label: 'value', dataIndex: 1 }] },
      data,
    );
    const moves: Array<[number | null, number | null, string]> = [];
    chartA.on('cursor:move', (dataX, dataIdx, origin) => {
      moves.push([dataX, dataIdx, origin]);
    });

    hoverAt(chartB, plotPoint(chartB, 0.5));

    expect(moves.at(-1)).toEqual([50, 1, 'sync']);
    expect(chartA.getCursorSnapshot({ fallback: 'hide' })).toMatchObject({
      dataX: 50,
      dataIndex: 1,
      source: 'cursor',
    });

    leave(chartB);

    expect(moves.at(-1)).toEqual([null, null, 'sync']);
    expect(chartA.getCursorSnapshot({ fallback: 'hide' }).source).toBe('none');
  });

  it('keeps synced peer cursor anchored at box-selection start', () => {
    const syncKey = 'cursor-selection-anchor-test';
    const data: ColumnarData = [f([0, 50, 100]), f([0, 1, 0])];
    const chartA = fakes.engine(
      { cursor: { syncKey }, series: [{ label: 'value', dataIndex: 1 }] },
      data,
    );
    const chartB = fakes.engine(
      { cursor: { syncKey }, series: [{ label: 'value', dataIndex: 1 }] },
      data,
    );

    // A box drag: press at the start, move past the drag threshold, still held.
    dragStart(chartA, plotPoint(chartA, 0.5), plotPoint(chartA, 0.8));

    const snapshot = chartB.getCursorSnapshot({ fallback: 'hide' });
    expect(snapshot.source).toBe('cursor');
    expect(snapshot.dataX).toBe(50);
  });
});

describe('engine highlight sync', () => {
  it('keeps numeric series-index sync as the default', () => {
    const syncKey = 'numeric-highlight-test';
    const data: ColumnarData = [f([1, 2]), f([10, 20]), f([100, 200])];
    const chartA = fakes.engine(
      {
        highlight: { syncKey },
        series: [
          { label: 'a', dataIndex: 1 },
          { label: 'b', dataIndex: 2 },
        ],
      },
      data,
    );
    const chartB = fakes.engine(
      {
        highlight: { syncKey },
        series: [
          { label: 'first', dataIndex: 1 },
          { label: 'second', dataIndex: 2 },
        ],
      },
      data,
    );

    chartA.setHighlight(1);
    expect(chartB.getHighlight()).toBe(1);
  });

  it('maps synced highlights by stable identity when getKey is configured', () => {
    type RunMeta = { runId: string };
    const syncKey = 'identity-highlight-test';
    const getRunId = (series: SeriesConfig) => (series.meta as RunMeta | undefined)?.runId;
    const data: ColumnarData = [f([1, 2]), f([10, 20]), f([100, 200])];

    const chartA = fakes.engine(
      {
        highlight: { syncKey, getKey: getRunId },
        series: [
          { label: 'run-a', dataIndex: 1, meta: { runId: 'a' } },
          { label: 'run-b', dataIndex: 2, meta: { runId: 'b' } },
        ],
      },
      data,
    );
    const chartB = fakes.engine(
      {
        highlight: { syncKey, getKey: getRunId },
        series: [
          { label: 'run-b', dataIndex: 1, meta: { runId: 'b' } },
          { label: 'run-a', dataIndex: 2, meta: { runId: 'a' } },
        ],
      },
      data,
    );
    const chartC = fakes.engine(
      {
        highlight: { syncKey, getKey: getRunId },
        series: [{ label: 'run-a-only', dataIndex: 1, meta: { runId: 'a' } }],
      },
      [f([1, 2]), f([10, 20])],
    );

    chartA.setHighlight(0);
    expect(chartB.getHighlight()).toBe(1);
    expect(chartC.getHighlight()).toBe(0);

    chartB.setHighlight(0);
    expect(chartA.getHighlight()).toBe(1);
    expect(chartC.getHighlight()).toBe(null);
  });

  it('exposes stable-key highlight setters for mismatched series order', () => {
    type RunMeta = { runId: string };
    const syncKey = 'identity-highlight-api-test';
    const getRunId = (series: SeriesConfig) => (series.meta as RunMeta | undefined)?.runId;
    const data: ColumnarData = [f([1, 2]), f([10, 20]), f([100, 200])];
    const chartA = fakes.engine(
      {
        highlight: { syncKey, getKey: getRunId },
        series: [
          { label: 'run-a', dataIndex: 1, meta: { runId: 'a' } },
          { label: 'run-b', dataIndex: 2, meta: { runId: 'b' } },
        ],
      },
      data,
    );
    const chartB = fakes.engine(
      {
        highlight: { syncKey, getKey: getRunId },
        series: [
          { label: 'run-b', dataIndex: 1, meta: { runId: 'b' } },
          { label: 'run-a', dataIndex: 2, meta: { runId: 'a' } },
        ],
      },
      data,
    );

    chartA.setHighlightKey('b');

    expect(chartA.getHighlight()).toBe(1);
    expect(chartA.getHighlightKey()).toBe('b');
    expect(chartB.getHighlight()).toBe(0);
    expect(chartB.getHighlightKey()).toBe('b');

    chartA.setHighlightKey('missing');
    expect(chartA.getHighlight()).toBe(null);
    expect(chartB.getHighlight()).toBe(null);
  });
});

describe('engine zoom sync', () => {
  it('keeps a zoom-synced peer in sync across appendData', () => {
    const syncKey = 'zoom-append-sync';
    const data: ColumnarData = [f([0, 25, 50, 75, 100]), f([1, 2, 3, 2, 1])];
    const chartA = fakes.engine(
      { zoom: { syncKey, x: true, enabled: true }, series: [{ label: 'v', dataIndex: 1 }] },
      [f([0, 25, 50, 75, 100]), f([1, 2, 3, 2, 1])],
    );
    const chartB = fakes.engine(
      { zoom: { syncKey, x: true, enabled: true }, series: [{ label: 'v', dataIndex: 1 }] },
      data,
    );

    // Zoom chart A in around the middle. Publishes to B via SyncGroup.
    press(chartA, '+');

    const zoomedMax = chartA.getAxis('x')!.max;
    const zoomedMin = chartA.getAxis('x')!.min;
    expect(zoomedMax).toBeLessThan(100);
    expect(chartB.getAxis('x')!.max).toBe(zoomedMax);
    expect(chartB.getAxis('x')!.min).toBe(zoomedMin);

    // Streaming data into B beyond the old extent must not snap its synced
    // viewport back to the full range.
    chartB.appendToSource(0, [f([200]), f([0])]);
    expect(chartB.getAxis('x')!.max).toBe(zoomedMax);
    expect(chartB.getAxis('x')!.min).toBe(zoomedMin);
  });

  it('does not broadcast unrelated Y ranges when resetting an X-synced chart', () => {
    const syncKey = 'x-only-reset-sync';
    const config = {
      zoom: { syncKey, x: true, y: false, enabled: true },
      axes: { x: { type: 'linear' as const }, y: { type: 'linear' as const } },
      series: [{ label: 'v', dataIndex: 1 }],
    };
    const chartA = fakes.engine(config, [f([0, 50, 100]), f([10, 20, 15])]);
    const chartB = fakes.engine(config, [f([0, 50, 100]), f([1_000, 2_000, 1_500])]);
    const originalY = { min: chartB.getAxis('y')!.min, max: chartB.getAxis('y')!.max };

    chartA.resetZoom();
    expect(chartB.getAxis('y')).toMatchObject(originalY);

    chartA.scrollToLatest();
    expect(chartB.getAxis('y')).toMatchObject(originalY);
  });
});
