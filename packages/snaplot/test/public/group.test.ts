// @vitest-environment jsdom
// The final group model (plan D17): cursor, highlight, horizontal viewport and plot edges are
// shared by default; Y stays each chart's own unless yRange; colours follow series ids; a chart
// leaves with update({ group: undefined }) or destroy(). test/ledger/m1-group.test.ts keeps the
// critical-defect locks.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChartGroup } from '../../src/index';
import { debug, type Fakes, installFakes } from '../fakes';
import { type FinalHandle, mount, range, wheelZoom } from './contract';

let fakes: Fakes;
beforeEach(() => {
  fakes = installFakes();
});
afterEach(() => {
  fakes.uninstall();
  vi.restoreAllMocks();
});

type Row = { t: number; cpu: number; mem: number; disk: number };
const rows = (length: number): Row[] =>
  Array.from({ length }, (_, t) => ({
    t,
    cpu: 50 + (t % 5) * 5,
    mem: 1.5e9 + (t % 5) * 1e8,
    disk: 10 + (t % 3),
  }));

describe('[dataapi-01][frameworks-06][interact-01] the final group model', () => {
  it.fails('[dataapi-01] a group links the X viewport and aligns plots by default', () => {
    const group = createChartGroup();
    const a = mount<Row>(fakes, { data: rows(21), x: 't', series: [{ y: 'cpu' }], group });
    const b = mount<Row>(fakes, { data: rows(21), x: 't', series: [{ y: 'mem' }], group });
    a.update({ viewport: { x: [5, 15] } });
    expect(range(b, 'x')).toEqual([5, 15]);
    // mem's labels (1.5e9 …) are wider than cpu's, so a's plot moves to b's left edge.
    expect(debug(a).plot.left).toBe(debug(b).plot.left);
  });

  it.fails('[frameworks-06][interact-01] a peer reports only the axes it pins, never its own Y', () => {
    const group = createChartGroup();
    const onViewportChange = vi.fn();
    const a = mount<Row>(fakes, { data: rows(21), x: 't', series: [{ y: 'cpu' }], group });
    const b = mount<Row>(fakes, {
      data: rows(21),
      x: 't',
      series: [{ y: 'mem' }],
      group,
      onViewportChange,
    });
    wheelZoom(a, 10, 60);
    const x = range(b, 'x')!;
    expect(onViewportChange.mock.calls).toEqual([[{ x }]]);
    a.resetViewport();
    expect(onViewportChange.mock.calls.at(-1)).toEqual([{}]);
    expect(b.getState().viewport).toEqual({});
  });

  it.fails('[dataapi-01] a yRange group emits one viewport event per action on the driver', () => {
    const group = createChartGroup({ yRange: true });
    const a = mount<Row>(fakes, { data: rows(21), x: 't', series: [{ y: 'cpu' }], group });
    mount<Row>(fakes, { data: rows(21), x: 't', series: [{ y: 'disk' }], group });
    const seen: object[] = [];
    a.on('viewport:change', (viewport) => seen.push(viewport));
    wheelZoom(a, 10, 60);
    expect(seen.map((viewport) => Object.keys(viewport))).toEqual([['x']]);
  });

  it.fails('[dataapi-01] a chart leaves with update({ group: undefined }) and keeps its own range', () => {
    const group = createChartGroup();
    const a = mount<Row>(fakes, { data: rows(21), x: 't', series: [{ y: 'cpu' }], group });
    const b = mount<Row>(fakes, { data: rows(41), x: 't', series: [{ y: 'mem' }], group });
    b.update({ group: undefined });
    a.update({ viewport: { x: [5, 15] } });
    expect(range(b, 'x')).toEqual([0, 40]);
    // a no longer aligns with b's wider labels.
    expect(debug(a).plot.left).toBeLessThan(debug(b).plot.left);
  });

  it.fails('[dataapi-01] a destroyed member stops receiving, and the others keep linking', () => {
    const group = createChartGroup();
    const charts = [0, 1, 2].map(() =>
      mount<Row>(fakes, { data: rows(21), x: 't', series: [{ y: 'cpu' }], group }),
    );
    charts[1].destroy();
    charts[0].update({ viewport: { x: [2, 8] } });
    expect(range(charts[2], 'x')).toEqual([2, 8]);
  });

  it.fails('[dataapi-01] the group handle has setCursor and setHighlight only', () => {
    const group = createChartGroup({ cursor: true });
    expect(Object.keys(group).sort()).toEqual(['setCursor', 'setHighlight']);
  });

  it.fails('[dataapi-01] viewport: false links no viewport, and a peer without the axis is left alone', () => {
    const group = createChartGroup({ viewport: false });
    const a = mount<Row>(fakes, { data: rows(21), x: 't', series: [{ y: 'cpu' }], group });
    const b = mount<Row>(fakes, { data: rows(21), x: 't', series: [{ y: 'cpu' }], group });
    a.update({ viewport: { x: [5, 15] } });
    expect(range(b, 'x')).toEqual([0, 20]);
  });

  it.fails('[dataapi-01] the group cursor and highlight reach every member', () => {
    const group = createChartGroup();
    const charts: FinalHandle<Row>[] = [0, 1].map(() =>
      mount<Row>(fakes, { data: rows(21), x: 't', series: [{ y: 'cpu' }, { y: 'mem' }], group }),
    );
    group.setCursor(7);
    expect(charts.map((chart) => chart.getCursor().x)).toEqual([7, 7]);
    group.setHighlight('mem');
    expect(charts.map((chart) => chart.getState().highlight)).toEqual(['mem', 'mem']);
  });
});

describe('[frameworks-21] colours by series id', () => {
  it.fails('[frameworks-21] the same series id gets the same colour in every member', () => {
    const group = createChartGroup();
    const a = mount<Row>(fakes, {
      data: rows(21),
      x: 't',
      series: [{ y: 'cpu' }, { y: 'mem' }],
      group,
    });
    const b = mount<Row>(fakes, {
      data: rows(21),
      x: 't',
      series: [{ y: 'disk' }, { y: 'mem' }, { y: 'cpu' }],
      group,
    });
    const colour = (chart: FinalHandle<Row>, id: string) =>
      chart.getState().series.find((s) => s.id === id)?.color;
    expect(colour(b, 'cpu')).toBe(colour(a, 'cpu'));
    expect(colour(b, 'mem')).toBe(colour(a, 'mem'));
    expect(new Set([colour(b, 'cpu'), colour(b, 'mem'), colour(b, 'disk')]).size).toBe(3);
  });

  it.fails('[frameworks-21] an explicit series colour still wins', () => {
    const group = createChartGroup();
    mount<Row>(fakes, { data: rows(21), x: 't', series: [{ y: 'cpu' }], group });
    const b = mount<Row>(fakes, {
      data: rows(21),
      x: 't',
      series: [{ y: 'cpu', color: '#ff0000' }],
      group,
    });
    expect(b.getState().series[0].color).toBe('#ff0000');
  });
});

describe('[dataapi-15][arch-13][gap-perf-gate-06] plot insets', () => {
  it('[dataapi-15][arch-13] an append that keeps the gutter repaints no peer', () => {
    const group = createChartGroup();
    const [a, b] = [0, 1].map(() =>
      mount<Row>(fakes, { data: rows(200), x: 't', series: [{ y: 'cpu' }], group }),
    );
    fakes.frames.flush();
    const before = { ...debug(b).renderCount };
    for (let i = 0; i < 5; i++) a.appendData([{ t: 200 + i, cpu: 55, mem: 1.6e9, disk: 10 }]);
    fakes.frames.flush();
    expect(debug(b).renderCount).toEqual(before);
  });

  it.fails('[arch-13][gap-perf-gate-06] a member whose gutter grows moves every peer once', () => {
    const group = createChartGroup();
    const a = mount<Row>(fakes, { data: rows(21), x: 't', series: [{ y: 'cpu' }], group });
    const b = mount<Row>(fakes, { data: rows(21), x: 't', series: [{ y: 'cpu' }], group });
    const left = debug(b).plot.left;
    a.update({ series: [{ y: 'mem' }] });
    expect(debug(b).plot.left).toBeGreaterThan(left);
    expect(debug(b).plot.left).toBe(debug(a).plot.left);
  });
});
