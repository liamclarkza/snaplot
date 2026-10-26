// @vitest-environment jsdom
// Known M10 defects in ticks, domains and layout (plan §5.1, RC5, RC6),
// measured on the debug label boxes. Widths use the fake canvas metric the
// engine itself measures with (7 px per character), so overlap is judged in
// the engine's own units. Public API, fakes and debug() only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { histogram } from '../../src/index';
import type { ChartHandle } from '../../src/index';
import { axis, debug, type Fakes, installFakes } from '../fakes';

let fakes: Fakes;
beforeEach(() => {
  fakes = installFakes();
});
afterEach(() => {
  fakes.uninstall();
  vi.restoreAllMocks();
});

const CHAR = 7;
const LINE = 12;

interface Box {
  text: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function boxes(chart: ChartHandle<any>, axis: string, kind: 'tick' | 'title' = 'tick'): Box[] {
  return debug(chart)
    .labelBoxes()
    .filter((box) => box.axis === axis && box.kind === kind)
    .map((box) => {
      const width = box.text.length * CHAR;
      const left =
        box.anchor === 'start' ? box.x : box.anchor === 'end' ? box.x - width : box.x - width / 2;
      return {
        text: box.text,
        left,
        right: left + width,
        top: box.y - LINE / 2,
        bottom: box.y + LINE / 2,
      };
    });
}

function overlaps(list: Box[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
        out.push(`${a.text} × ${b.text}`);
      }
    }
  }
  return out;
}

const texts = (chart: ChartHandle<any>, axis: string) => boxes(chart, axis).map((b) => b.text);

describe('[render-02][backlog-03][visuals-21:def-03] category labels thin to fit', () => {
  it.fails('[render-02][backlog-03][visuals-21:def-03] 30 long categories at 480 px do not overlap', () => {
    const chart = fakes.mount(
      {
        data: Array.from({ length: 30 }, (_, i) => ({ region: `Northern region ${i + 1}`, v: i })),
        x: 'region',
        series: [{ type: 'bar', y: 'v' }],
      },
      { width: 480, height: 260 },
    );
    expect(overlaps(boxes(chart, 'x'))).toEqual([]);
    expect(boxes(chart, 'x').length).toBeGreaterThanOrEqual(2);
  });

  it.fails('[render-02] 40 categories on a line chart do not overlap', () => {
    const chart = fakes.mount(
      {
        data: Array.from({ length: 40 }, (_, i) => ({
          day: `2026-01-${String(i + 1).padStart(2, '0')}x`,
          v: i,
        })),
        x: 'day',
        series: [{ y: 'v' }],
      },
      { width: 480, height: 260 },
    );
    expect(overlaps(boxes(chart, 'x'))).toEqual([]);
  });
});

describe('[render-06][render-07][render-13][render-14][render-19][visuals-09] numeric ticks', () => {
  it('[render-06] a log axis within one decade (120–180) has at least 2 labels', () => {
    const chart = fakes.mount(
      {
        data: [120, 150, 180].map((v, t) => ({ t, v })),
        x: 't',
        series: [{ y: 'v' }],
        axes: { y: { type: 'log' } },
      },
      { width: 480, height: 300 },
    );
    expect(texts(chart, 'y').length).toBeGreaterThanOrEqual(2);
  });

  it('[render-06] a log axis over 11–19 still has at least 2 labels', () => {
    const chart = fakes.mount(
      {
        data: [11, 14, 19].map((v, t) => ({ t, v })),
        x: 't',
        series: [{ y: 'v' }],
        axes: { y: { type: 'log' } },
      },
      { width: 480, height: 300 },
    );
    expect(texts(chart, 'y').length).toBeGreaterThanOrEqual(2);
  });

  it.fails('[render-07] values near 1e-13 get distinct labels', () => {
    const chart = fakes.mount({
      data: [1e-13, 2e-13, 3e-13, 4e-13].map((v, t) => ({ t, v })),
      x: 't',
      series: [{ y: 'v' }],
    });
    const labels = texts(chart, 'y');
    expect(labels.length).toBeGreaterThanOrEqual(2);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('[render-07] values near 1e-9 do not all read 0.00000000', () => {
    const chart = fakes.mount({
      data: [0, 1e-9, 2e-9].map((v, t) => ({ t, v })),
      x: 't',
      series: [{ y: 'v' }],
    });
    const labels = texts(chart, 'y');
    expect(new Set(labels).size).toBe(labels.length);
  });

  it.fails('[render-13][visuals-09] a prime interval count keeps at least 3 labels', () => {
    const chart = fakes.mount(
      {
        data: Array.from({ length: 12 }, (_, t) => ({ t, v: t })),
        x: 't',
        series: [{ type: 'scatter', y: 'v' }],
        axes: { x: { min: 0, max: 11 } },
      },
      { width: 320, height: 200 },
    );
    expect(texts(chart, 'x').length).toBeGreaterThanOrEqual(3);
  });

  it.fails('[render-14] a clamped end label keeps a gap from its neighbour', () => {
    // Three minutes at 640 px: the last label is clamped inward until it
    // touches the one before it (gap 0 today).
    const start = Date.UTC(2026, 0, 5, 8, 0);
    const chart = fakes.mount(
      {
        data: Array.from({ length: 37 }, (_, i) => ({ t: start + i * 5000, v: i % 7 })),
        x: 't',
        series: [{ y: 'v' }],
        axes: { x: { type: 'time' } },
      },
      { width: 640, height: 240 },
    );
    const list = boxes(chart, 'x').sort((a, b) => a.left - b.left);
    expect(list.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < list.length; i++) {
      expect(
        list[i].left - list[i - 1].right,
        `${list[i - 1].text} → ${list[i].text}`,
      ).toBeGreaterThanOrEqual(4);
    }
  });

  it.fails('[render-19] a rounding format never repeats adjacent labels', () => {
    const chart = fakes.mount({
      data: [0.999, 0.9993, 0.9996, 0.9999].map((v, t) => ({ t, v })),
      x: 't',
      series: [{ y: 'v' }],
      axes: { y: { format: (v) => `${(Number(v) * 100).toFixed(1)}%` } },
    });
    const labels = texts(chart, 'y');
    for (let i = 1; i < labels.length; i++) expect(labels[i]).not.toBe(labels[i - 1]);
  });

  it('[render-08] histogram X labels are distinct nice values', () => {
    const values = Array.from({ length: 500 }, (_, i) => Math.sin(i * 12.9898) * 2.2);
    const chart = fakes.mount({
      series: [{ type: 'histogram', id: 'z', data: histogram(values) }],
    });
    const labels = texts(chart, 'x').map(Number);
    expect(labels.length).toBeGreaterThanOrEqual(3);
    expect(new Set(labels).size).toBe(labels.length);
    const step = labels[1] - labels[0];
    const nice = [1, 2, 2.5, 5].map((m) => m * 10 ** Math.floor(Math.log10(step)));
    expect(nice.some((candidate) => Math.abs(candidate - step) < 1e-9)).toBe(true);
  });

  it('[render-01] bars on a Date X axis are labelled as dates, not epoch milliseconds', () => {
    const chart = fakes.mount({
      data: Array.from({ length: 6 }, (_, m) => ({ month: new Date(2026, m, 1), sales: 10 + m })),
      x: 'month',
      series: [{ type: 'bar', y: 'sales' }],
    });
    const labels = texts(chart, 'x');
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) expect(label).not.toMatch(/^\d{10,}$/);
  });
});

describe('[visuals-02:domain][visuals-07][visuals-08][render-22] domains', () => {
  it('[visuals-07] a bar maximum of 100 gives a 0–100 axis', () => {
    const chart = fakes.mount({
      data: [40, 70, 100].map((v, i) => ({ q: `Q${i + 1}`, v })),
      x: 'q',
      series: [{ type: 'bar', y: 'v' }],
    });
    expect(axis(chart, 'y')).toMatchObject({ min: 0, max: 100 });
  });

  it('[visuals-07] data ≥ 0 never gets a negative axis minimum', () => {
    const chart = fakes.mount({
      data: [0, 12, 30, 50].map((v, t) => ({ t, v })),
      x: 't',
      series: [{ type: 'area', y: 'v' }],
    });
    expect(axis(chart, 'y')?.min).toBeGreaterThanOrEqual(0);
  });

  it('[visuals-02:domain] an area domain includes 0', () => {
    const chart = fakes.mount({
      data: [100, 104, 110].map((v, t) => ({ t, v })),
      x: 't',
      series: [{ type: 'area', y: 'v' }],
    });
    expect(axis(chart, 'y')?.min).toBeLessThanOrEqual(0);
  });

  it('[visuals-08] numeric bars span first − ½ slot to last + ½ slot', () => {
    const chart = fakes.mount({
      data: Array.from({ length: 24 }, (_, hour) => ({ hour, kwh: 1 + (hour % 5) })),
      x: 'hour',
      series: [{ type: 'bar', y: 'kwh' }],
    });
    expect(axis(chart, 'x')).toMatchObject({ min: -0.5, max: 23.5 });
  });

  it('[render-22] all-negative bars get no positive headroom', () => {
    const chart = fakes.mount({
      data: [-10, -25, -45].map((v, i) => ({ q: `Q${i + 1}`, v })),
      x: 'q',
      series: [{ type: 'bar', y: 'v' }],
    });
    expect(axis(chart, 'y')?.max).toBe(0);
  });
});

describe('[backlog-10][visuals-21:def-01] layout', () => {
  it('[backlog-10] a second value axis defaults to the right', () => {
    const chart = fakes.mount({
      data: [1, 2, 3].map((t) => ({ t, a: t * 100, b: t })),
      x: 't',
      series: [{ y: 'a' }, { y: 'b', yAxis: 'y2' }],
    });
    expect(debug(chart).layout.axes.y2?.position).toBe('right');
  });

  it.fails('[visuals-21:def-01] long axis titles stay inside a 320 × 220 container', () => {
    const chart = fakes.mount(
      {
        data: [1, 2, 3].map((t) => ({ t, v: t })),
        x: 't',
        series: [{ y: 'v' }],
        axes: {
          x: { title: 'Elapsed wall-clock time since the start of the experiment (s)' },
          y: { title: 'Median end-to-end request latency in milliseconds' },
        },
      },
      { width: 320, height: 220 },
    );
    const x = boxes(chart, 'x', 'title')[0];
    expect(x).toBeDefined();
    expect(x.left).toBeGreaterThanOrEqual(0);
    expect(x.right).toBeLessThanOrEqual(320);
    // The vertical Y title runs along the height.
    const y = boxes(chart, 'y', 'title')[0];
    expect(y).toBeDefined();
    expect(y.text.length * CHAR).toBeLessThanOrEqual(220);
  });
});
