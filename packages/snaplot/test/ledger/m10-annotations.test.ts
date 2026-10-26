// @vitest-environment jsdom
// Known M10 defects in annotations (plan §5.1 category X, RC6, RC5): regions
// span slot edges, accept open ends and clamp on log axes; labels stay inside
// the plot and do not collide. Read from the canvas recorder. Each case forces
// one repaint first, because annotations given at creation are not drawn by
// the first paint today (recorded separately as an M8 entry).
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

function repaint(chart: ChartHandle<any>): void {
  chart.redraw();
  fakes.frames.flush();
}

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Region fills: fillRect calls that span the plot height but not its width. */
function regionRects(chart: ChartHandle<any>) {
  const { plot } = debug(chart);
  return fakes.canvas.all
    .flatMap((record) => record.calls)
    .filter((call) => call.name === 'fillRect')
    .map((call) => call.args as number[])
    .filter(([, , width, height]) => Math.abs(height - plot.height) < 1 && width < plot.width - 1)
    .map(([x, , width]) => ({ left: x, right: x + width }));
}

function labelCalls(text: string) {
  return fakes.canvas.all
    .flatMap((record) => record.calls)
    .filter((call) => call.name === 'fillText' && call.args[0] === text)
    .map((call) => ({ x: Number(call.args[1]), y: Number(call.args[2]) }));
}

describe('[gap-annotations-extensibility-01] category regions span slot edges', () => {
  function mountWeek(regions: Array<{ from: string; to: string }>) {
    return fakes.mount({
      data: days.map((day, i) => ({ day, visits: 3 + i })),
      x: 'day',
      series: [{ type: 'bar', y: 'visits' }],
      referenceRegions: regions.map((region) => ({ axis: 'x', ...region, opacity: 0.2 })),
    });
  }

  it.fails('[gap-annotations-extensibility-01] a Sat–Sun region covers both whole slots', () => {
    const chart = mountWeek([{ from: 'Sat', to: 'Sun' }]);
    repaint(chart);
    const { plot } = debug(chart);
    const slot = plot.width / 7;
    const [rect] = regionRects(chart);
    expect(rect).toBeDefined();
    expect(rect.left).toBeCloseTo(plot.left + 5 * slot, 0);
    expect(rect.right).toBeCloseTo(plot.left + 7 * slot, 0);
  });

  it.fails('[gap-annotations-extensibility-01] a single-category region draws its slot', () => {
    const chart = mountWeek([{ from: 'Wed', to: 'Wed' }]);
    repaint(chart);
    const { plot } = debug(chart);
    const slot = plot.width / 7;
    const [rect] = regionRects(chart);
    expect(rect).toBeDefined();
    expect(rect.right - rect.left).toBeCloseTo(slot, 0);
  });
});

describe('[gap-annotations-extensibility-04] open and log regions', () => {
  it('[gap-annotations-extensibility-04] a region accepts Infinity for an open end', () => {
    expect(() =>
      fakes.mount({
        data: [0, 1, 2, 3].map((t) => ({ t, v: t })),
        x: 't',
        series: [{ y: 'v' }],
        referenceRegions: [{ axis: 'x', from: 2, to: Number.POSITIVE_INFINITY, label: 'Since 2' }],
      }),
    ).not.toThrow();
  });

  it.fails('[gap-annotations-extensibility-04] a log-axis region from 0 is clamped to the domain, not dropped', () => {
    const chart = fakes.mount({
      data: [2, 30, 400, 1100].map((v, t) => ({ t, v })),
      x: 't',
      series: [{ y: 'v' }],
      axes: { y: { type: 'log' } },
      referenceRegions: [{ axis: 'y', from: 0, to: 10, label: 'fast (0-10)' }],
    });
    repaint(chart);
    expect(labelCalls('fast (0-10)').length).toBeGreaterThan(0);
  });
});

describe('[gap-annotations-extensibility-02] annotation labels stay readable', () => {
  it.fails('[gap-annotations-extensibility-02] the newest streaming marker keeps its label inside the plot', () => {
    const chart = fakes.mount(
      {
        data: Array.from({ length: 60 }, (_, t) => ({ t, v: 10 + (t % 5) })),
        x: 't',
        series: [{ y: 'v' }],
        referenceLines: [{ axis: 'x', value: 59, label: 'Deploy #482' }],
      },
      { width: 390, height: 220 },
    );
    repaint(chart);
    const { plot } = debug(chart);
    const [label] = labelCalls('Deploy #482');
    expect(label).toBeDefined();
    expect(label.x + 'Deploy #482'.length * 7).toBeLessThanOrEqual(plot.left + plot.width);
  });

  it.fails('[gap-annotations-extensibility-02] two close reference line labels do not overlap', () => {
    const chart = fakes.mount({
      data: Array.from({ length: 30 }, (_, t) => ({ t, v: 100 + (t % 9) * 10 })),
      x: 't',
      series: [{ y: 'v' }],
      referenceLines: [
        { axis: 'y', value: 150, label: 'SLO 150 ms' },
        { axis: 'y', value: 152, label: 'Page 152 ms' },
      ],
    });
    repaint(chart);
    const [a] = labelCalls('SLO 150 ms');
    const [b] = labelCalls('Page 152 ms');
    expect(a && b).toBeTruthy();
    expect(Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(11);
  });
});
