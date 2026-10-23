import { describe, expect, it } from 'vitest';
import { violations } from './checks';
import type { GeometryReport, PageLabel, PageProbe, PageRect } from './page-api';

const box = (left: number, top: number, width: number, height: number): PageRect => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

const label = (
  text: string,
  rect: PageRect,
  axis: string | null = 'x',
  kind: PageLabel['kind'] = 'tick',
): PageLabel => ({ text, rect, axis, kind });

const probe = (inked: boolean, x = 1, y = 2): PageProbe => ({
  series: 's',
  x,
  y,
  px: 10,
  py: 10,
  rx: 2,
  ry: 2,
  inked,
});

function report(partial: Partial<GeometryReport>): GeometryReport {
  return {
    id: 'test/case',
    host: box(0, 0, 400, 200),
    plot: box(40, 10, 350, 160),
    axes: [
      { key: 'x', position: 'bottom', horizontal: true, extent: 350 },
      { key: 'y', position: 'left', horizontal: false, extent: 160 },
    ],
    labels: [],
    attribution: 'debug',
    probes: [probe(true)],
    unprobed: [],
    ...partial,
  };
}

describe('geometry checks', () => {
  it('overlap flags two boxes that intersect by more than half a pixel', () => {
    const r = report({
      labels: [label('0', box(10, 180, 20, 12)), label('10', box(25, 180, 20, 12))],
    });
    expect(violations(r, 'overlap')).toEqual(['"0" × "10" (5 × 12 px)']);
  });

  it('overlap ignores boxes that only touch', () => {
    const r = report({
      labels: [label('0', box(10, 180, 20, 12)), label('10', box(30.4, 180, 20, 12))],
    });
    expect(violations(r, 'overlap')).toEqual([]);
  });

  it('repeat flags adjacent ticks with the same text, in axis order', () => {
    const r = report({
      labels: [
        label('12:00:05', box(200, 180, 40, 12)),
        label('12:00:04', box(100, 180, 40, 12)),
        label('12:00:05', box(150, 180, 40, 12)),
      ],
    });
    expect(violations(r, 'repeat')).toEqual(['x: "12:00:05" twice']);
  });

  it('repeat ignores titles and labels on different axes', () => {
    const r = report({
      labels: [
        label('Time', box(100, 190, 40, 12), 'x', 'title'),
        label('Time', box(150, 180, 40, 12)),
        label('5', box(10, 100, 10, 12), 'y'),
        label('5', box(100, 180, 10, 12)),
      ],
    });
    expect(violations(r, 'repeat')).toEqual([]);
  });

  it('minLabels requires two ticks on an axis of 120 px or more', () => {
    const r = report({
      labels: [label('0', box(40, 180, 10, 12)), label('20', box(10, 100, 10, 12), 'y')],
    });
    expect(violations(r, 'minLabels')).toEqual([
      'x (bottom, 350 px): 1 label(s) [0]',
      'y (left, 160 px): 1 label(s) [20]',
    ]);
  });

  it('minLabels exempts short axes and counts titles out', () => {
    const r = report({
      axes: [{ key: 'y', position: 'left', horizontal: false, extent: 119 }],
      labels: [label('Load', box(0, 50, 12, 40), 'y', 'title')],
    });
    expect(violations(r, 'minLabels')).toEqual([]);
  });

  it('paints reports unpainted datums and refuses to pass with nothing probed', () => {
    expect(violations(report({ probes: [probe(true), probe(false, 3, 4)] }), 'paints')).toEqual([
      '1/2 unpainted',
      's (3, 4) at 10,10 px',
    ]);
    expect(violations(report({ probes: [], unprobed: ['s: density'] }), 'paints')).toEqual([
      'no datum was probed (s: density)',
    ]);
  });

  it('inside flags labels that leave the chart box', () => {
    const r = report({
      labels: [
        label('Long title', box(-30, 80, 60, 12), 'y', 'title'),
        label('ok', box(5, 5, 10, 10)),
      ],
    });
    expect(violations(r, 'inside')).toEqual(['"Long title" overflows by 30 px']);
  });
});
