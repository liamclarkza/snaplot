// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChartGroup } from '../../src/index';
import { type Fakes, installFakes } from '../fakes';

// Plan D17: group viewport sync links horizontal axes only, and only axes the
// peer has; it never pins a peer's Y, resets propagate, and `yRange: true` is
// the only way to share Y. Evidence: dataapi-01, dxtrial-01, frameworks-06,
// interact-01.

type Row = { t: number; cpu: number; mem: number; temp: number; rps: number };

// Period-5 series: every window of five or more samples holds both extremes,
// so a peer's automatic Y over a zoomed window equals its full-range Y.
function rows(length: number): Row[] {
  return Array.from({ length }, (_, t) => ({
    t,
    cpu: 50 + (t % 5) * 5,
    mem: 1.5e9 + (t % 5) * 1e8,
    temp: 20 + (t % 5) * 2,
    rps: 2500 + (t % 5) * 750,
  }));
}

let fakes: Fakes;
beforeEach(() => {
  fakes = installFakes();
});
afterEach(() => {
  fakes.uninstall();
  vi.restoreAllMocks();
});

describe('[dataapi-01][dxtrial-01][frameworks-06][interact-01] group viewport sync links X only', () => {
  it.fails('[dataapi-01][dxtrial-01][frameworks-06][interact-01] peers with different Y units keep their own Y', () => {
    const group = createChartGroup({ viewport: true });
    const data = rows(21);
    const cpu = fakes.mount({ data, x: 't', series: [{ y: 'cpu' }], group });
    const memory = fakes.mount({ data, x: 't', series: [{ y: 'mem' }], group });
    const memoryY = memory.getAxis('y');

    cpu.setViewport({ x: { min: 5, max: 15 } });

    expect(memory.getAxis('x')).toMatchObject({ min: 5, max: 15 });
    expect(memory.getAxis('y')).toEqual(memoryY);
    // Still automatic: the peer's Y re-fits its own new data.
    memory.update({ data: data.map((row) => ({ ...row, mem: row.mem * 2 })) });
    expect(memory.getAxis('y')!.max).toBeGreaterThan(memoryY!.max * 1.5);
  });

  it.fails('[dataapi-01][dxtrial-01][frameworks-06][interact-01] a y2 peer keeps its own y2; a y2 driver still syncs x', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const group = createChartGroup({ viewport: true });
    const data = rows(21);
    const cpu = fakes.mount({ data, x: 't', series: [{ y: 'cpu' }], group });
    const traffic = fakes.mount({
      data,
      x: 't',
      series: [{ y: 'temp' }, { y: 'rps', yAxis: 'y2' }],
      axes: { y2: { position: 'right' } },
      group,
    });
    const trafficY = traffic.getAxis('y');
    const trafficY2 = traffic.getAxis('y2');

    cpu.setViewport({ x: { min: 5, max: 15 } });
    expect(traffic.getAxis('x')).toMatchObject({ min: 5, max: 15 });
    expect(traffic.getAxis('y')).toEqual(trafficY);
    expect(traffic.getAxis('y2')).toEqual(trafficY2);

    // The driver has a y2 its peer lacks: the peer still follows X.
    traffic.setViewport({ x: { min: 2, max: 12 } });
    expect(cpu.getAxis('x')).toMatchObject({ min: 2, max: 12 });
    expect(errors).not.toHaveBeenCalled();
  });

  it.fails('[dataapi-01][dxtrial-01][frameworks-06][interact-01] a peer without x2 still syncs x', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const group = createChartGroup({ viewport: true });
    const data = rows(21);
    const shifted = data.map((row) => ({ ...row, t: row.t + 100 }));
    const twoX = fakes.mount({
      data,
      x: 't',
      series: [{ y: 'cpu' }, { id: 'later', y: 'temp', xAxis: 'x2', data: shifted }],
      group,
    });
    const single = fakes.mount({ data, x: 't', series: [{ y: 'mem' }], group });

    twoX.setViewport({ x: { min: 4, max: 14 }, x2: { min: 104, max: 114 } });

    expect(single.getAxis('x')).toMatchObject({ min: 4, max: 14 });
    expect(single.getAxis('x2')).toBeUndefined();
    expect(errors).not.toHaveBeenCalled();
  });

  it.fails('[dataapi-01][dxtrial-01][frameworks-06][interact-01] reset propagates; peers return to their own automatic range', () => {
    const group = createChartGroup({ viewport: true });
    const cpu = fakes.mount({ data: rows(21), x: 't', series: [{ y: 'cpu' }], group });
    const memory = fakes.mount({ data: rows(41), x: 't', series: [{ y: 'mem' }], group });
    const cpuX = cpu.getAxis('x');
    const memoryX = memory.getAxis('x');
    const memoryY = memory.getAxis('y');

    cpu.setViewport({ x: { min: 5, max: 15 } });
    expect(memory.getAxis('x')).toMatchObject({ min: 5, max: 15 });

    cpu.resetViewport();
    expect(cpu.getAxis('x')).toEqual(cpuX);
    expect(memory.getAxis('x')).toEqual(memoryX);
    expect(memory.getAxis('y')).toEqual(memoryY);
    // The peer's X is automatic again: it extends to newly appended data.
    memory.appendData([{ t: 50, cpu: 0, mem: 1.6e9, temp: 0, rps: 0 }]);
    expect(memory.getAxis('x')!.max).toBeGreaterThanOrEqual(50);
  });

  it.fails('[dataapi-01] a yRange group shares the union of its members’ ranges after a reset', () => {
    const group = createChartGroup({ viewport: true, yRange: true });
    const data = rows(21);
    const cpu = fakes.mount({ data, x: 't', series: [{ y: 'cpu' }], group });
    const warm = fakes.mount({
      data: data.map((row) => ({ ...row, cpu: row.cpu + 15 })),
      x: 't',
      series: [{ y: 'cpu' }],
      group,
    });
    const union = cpu.getAxis('y');
    expect(warm.getAxis('y')).toEqual(union);

    cpu.setViewport({ x: { min: 5, max: 15 } });
    cpu.resetViewport();

    expect(cpu.getAxis('y')).toEqual(union);
    expect(warm.getAxis('y')).toEqual(union);
  });
});
