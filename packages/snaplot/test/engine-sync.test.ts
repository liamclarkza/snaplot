// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ColumnarData } from '../src/engine/spec';
import {
  dragStart,
  type EngineFakes,
  f,
  hoverAt,
  installEngineFakes,
  plotPoint,
  press,
} from './fakes/engine';

// The engine's side of chart-group sync (createChartGroup in
// src/public/chart.ts): a group relays each member's `cursor:move` and
// `viewport:change` events to its peers through `setCursorDataX` and
// `setAxis`. Ported from src/core/Chart.append.test.ts (plan M2), where these
// ran over the engine's own key-based SyncGroup, which M2 deleted; the
// assertions now stop at the events and calls a group uses.

let fakes: EngineFakes;
beforeEach(() => {
  fakes = installEngineFakes();
});
afterEach(() => fakes.uninstall());

const data = (): ColumnarData => [f([0, 50, 100]), f([0, 1, 0])];

describe('engine cursor sync', () => {
  it('clears synced peers when the local cursor moves outside the plot area', () => {
    const chart = fakes.engine({ series: [{ label: 'value', yColumn: 1 }] }, data());
    const moves: Array<[number | null, number | null, string]> = [];
    chart.on('cursor:move', (dataX, dataIdx, origin) => moves.push([dataX, dataIdx, origin]));

    const inside = plotPoint(chart, 0.5);
    hoverAt(chart, inside);
    expect(moves.at(-1)).toEqual([50, 1, 'local']);

    // The group clears its peers on this null move.
    const { plot } = chart.getLayout();
    hoverAt(chart, { x: inside.x, y: plot.top + plot.height + 8 });

    expect(moves.at(-1)).toEqual([null, null, 'local']);
    expect(chart.getCursorSnapshot({ fallback: 'hide' }).source).toBe('none');
  });

  it('emits cursor events from synced peers so reactive snapshots refresh', () => {
    // A group moves a peer's cursor with setCursorDataX.
    const peer = fakes.engine({ series: [{ label: 'value', yColumn: 1 }] }, data());
    const moves: Array<[number | null, number | null, string]> = [];
    peer.on('cursor:move', (dataX, dataIdx, origin) => {
      moves.push([dataX, dataIdx, origin]);
    });

    peer.setCursorDataX(50);

    expect(moves.at(-1)).toEqual([50, 1, 'programmatic']);
    expect(peer.getCursorSnapshot({ fallback: 'hide' })).toMatchObject({
      dataX: 50,
      dataIndex: 1,
      source: 'cursor',
    });

    peer.setCursorDataX(null);

    expect(moves.at(-1)).toEqual([null, null, 'programmatic']);
    expect(peer.getCursorSnapshot({ fallback: 'hide' }).source).toBe('none');
  });

  it('keeps synced peer cursor anchored at box-selection start', () => {
    const chart = fakes.engine({ series: [{ label: 'value', yColumn: 1 }] }, data());
    const moves: Array<number | null> = [];
    chart.on('cursor:move', (dataX) => moves.push(dataX));

    // A box drag: press at the start, move past the drag threshold, still held.
    dragStart(chart, plotPoint(chart, 0.5), plotPoint(chart, 0.8));

    // The group relays only the anchor, never the moving end of the box.
    expect(moves).toEqual([50]);
    const snapshot = chart.getCursorSnapshot({ fallback: 'hide' });
    expect(snapshot.source).toBe('cursor');
    expect(snapshot.dataX).toBe(50);
  });
});

describe('engine zoom sync', () => {
  it('keeps a zoom-synced peer in sync across appendData', () => {
    const config = { zoom: { x: true, enabled: true }, series: [{ label: 'v', yColumn: 1 }] };
    const chartA = fakes.engine(config, [f([0, 25, 50, 75, 100]), f([1, 2, 3, 2, 1])]);
    const chartB = fakes.engine(config, [f([0, 25, 50, 75, 100]), f([1, 2, 3, 2, 1])]);
    // A group applies the driver's horizontal viewport to its peers with setAxis.
    chartA.on('viewport:change', (key, range) => chartB.setAxis(key, range));

    // Zoom chart A in around the middle.
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
});
