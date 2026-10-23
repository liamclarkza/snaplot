// @vitest-environment jsdom
// Known M11 defects in marks and bundling (plan §5.4, RC8, RC7). Canvas calls
// come from the recorder.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartHandle } from '../../src/index';
import { debug, type Fakes, installFakes } from '../fakes';

let fakes: Fakes;
beforeEach(() => {
  fakes = installFakes();
});
afterEach(() => {
  fakes.uninstall();
  vi.restoreAllMocks();
});

function dataCalls(chart: ChartHandle<any>, name: string): number {
  return fakes.canvas.of(debug(chart).layers.data).calls.filter((call) => call.name === name)
    .length;
}

describe('[visuals-18] interpolation on every line-like mark', () => {
  const data = Array.from({ length: 12 }, (_, t) => ({ t, v: (t * 7) % 10, lo: 0, hi: 12 }));

  it('a monotone line draws curves (control)', () => {
    const chart = fakes.mount({
      data,
      x: 't',
      series: [{ y: 'v', interpolation: 'monotone' }],
    });
    expect(dataCalls(chart, 'bezierCurveTo')).toBeGreaterThan(0);
  });

  it.fails('[visuals-18] a monotone area draws curves', () => {
    const chart = fakes.mount({
      data,
      x: 't',
      series: [{ type: 'area', y: 'v', interpolation: 'monotone' }],
    });
    expect(dataCalls(chart, 'bezierCurveTo')).toBeGreaterThan(0);
  });

  it.fails('[visuals-18] a monotone band draws curves', () => {
    const chart = fakes.mount({
      data,
      x: 't',
      series: [{ type: 'band', y: 'v', lower: 'lo', upper: 'hi', interpolation: 'monotone' }],
    });
    expect(dataCalls(chart, 'bezierCurveTo')).toBeGreaterThan(0);
  });
});

describe('[dataapi-17] decimation budget', () => {
  it.fails('[dataapi-17] gappy data respects the M4 output budget during a gesture', () => {
    const n = 60_000;
    const chart = fakes.mount(
      {
        data: {
          columns: {
            t: Float64Array.from({ length: n }, (_, i) => i),
            v: Float64Array.from({ length: n }, (_, i) => (i % 3 === 2 ? Number.NaN : i % 50)),
          },
        },
        x: 't',
        series: [{ y: 'v' }],
      },
      { width: 400, height: 200 },
    );
    fakes.frames.flush();
    // A viewport change marks a gesture in flight, which turns M4 on.
    chart.setViewport({ x: { min: 0, max: n - 1 } });
    fakes.frames.flush();
    const { plot } = chart.getLayout();
    expect(debug(chart).drawnPoints).toBeLessThanOrEqual(4 * Math.ceil(plot.width) + 8);
  });
});
