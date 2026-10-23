// @vitest-environment jsdom
// Known M10 defects in formatting and time (plan §5.2, D7, RC4, RC5). Readouts
// go through the axis format; time axes step on the calendar in local or UTC
// time. Time-zone cases set `process.env.TZ` for the test only. Public API,
// fakes and debug() only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartHandle } from '../../src/index';
import { debug, type Fakes, hover, installFakes, tooltipText } from '../fakes';

declare const process: { env: Record<string, string | undefined> };

let fakes: Fakes;
beforeEach(() => {
  fakes = installFakes();
});
afterEach(() => {
  fakes.uninstall();
  vi.restoreAllMocks();
});

/** Run `fn` with the process time zone set to `zone`, then restore it. */
function inZone<T>(zone: string, fn: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

const xLabels = (chart: ChartHandle<any>) =>
  debug(chart)
    .labelBoxes()
    .filter((box) => box.axis === 'x' && box.kind === 'tick')
    .map((box) => box.text);

describe('[visuals-01:x][dxtrial-03][backlog-01][dataapi-09] readouts', () => {
  it.fails('[visuals-01:x] a numeric X readout keeps value precision', () => {
    const chart = fakes.mount({
      data: [0, 1.3, 2.74, 4, 6].map((x, i) => ({ x, y: i })),
      x: 'x',
      series: [{ type: 'scatter', y: 'y' }],
    });
    chart.setCursor(2.74);
    expect(chart.getCursorSnapshot().points[0]?.formattedX).toBe('2.74');
  });

  it.fails('[dxtrial-03][backlog-01] the Y axis format drives the cursor snapshot', () => {
    const chart = fakes.mount({
      data: [
        { t: 0, cpu: 18 },
        { t: 1, cpu: 20.4 },
        { t: 2, cpu: 31 },
      ],
      x: 't',
      series: [{ y: 'cpu' }],
      axes: { y: { format: (v) => `${v}%` } },
    });
    chart.setCursor(1);
    expect(chart.getCursorSnapshot().points[0]?.formattedY).toBe('20.4%');
  });

  it.fails('[backlog-01] the X axis format drives formattedX', () => {
    const chart = fakes.mount({
      data: Array.from({ length: 20 }, (_, t) => ({ t, v: 100 + t })),
      x: 't',
      series: [{ y: 'v' }],
      axes: { x: { format: (v) => `T+${v}s` } },
    });
    chart.setCursor(9);
    expect(chart.getCursorSnapshot().formattedX).toBe('T+9s');
  });

  it.fails('[backlog-01] a category cursor snapshot reads the category label', () => {
    const chart = fakes.mount({
      data: ['Alpha', 'Beta', 'Gamma'].map((name, i) => ({ name, v: i + 1 })),
      x: 'name',
      series: [{ y: 'v' }],
    });
    chart.setCursor('Gamma');
    expect(chart.getCursorSnapshot().formattedX).toBe('Gamma');
  });

  it.fails('[dataapi-09] a format on one series leaves the other series at value precision', () => {
    const chart = fakes.mount({
      data: [
        { t: 0, latency: 12.5, rate: 0.1 + 0.2 },
        { t: 1, latency: 13.8, rate: 389.22222222222223 },
        { t: 2, latency: 14, rate: 300 },
        { t: 3, latency: 15, rate: 310 },
      ],
      x: 't',
      series: [
        { y: 'latency', label: 'Latency', format: (v) => `${v} ms` },
        { y: 'rate', label: 'Rate' },
      ],
    });
    chart.setCursor(1);
    const rate = chart.getCursorSnapshot().points.find((point) => point.seriesId === 'rate');
    hover(chart, 1, 13.8);
    fakes.frames.flush();
    const text = tooltipText();
    expect(text).toContain('13.8 ms');
    expect(text).not.toContain('389.22222222222223');
    expect(text).toContain(rate?.formattedY ?? '<missing>');
  });
});

describe('[dxtrial-10][render-11] sub-second and single-point time axes', () => {
  const start = Date.UTC(2026, 2, 3, 12, 0, 0);

  it.fails('[dxtrial-10] a three-second window of 100 ms samples has no duplicate labels', () => {
    const chart = fakes.mount(
      {
        data: Array.from({ length: 600 }, (_, i) => ({ t: start + i * 100, v: i % 13 })),
        x: 't',
        series: [{ y: 'v' }],
        axes: { x: { type: 'time' } },
      },
      { width: 640, height: 240 },
    );
    chart.setViewport({ x: { min: start + 5000, max: start + 8000 } });
    fakes.frames.flush();
    const labels = xLabels(chart);
    expect(labels.length).toBeGreaterThanOrEqual(2);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it.fails('[render-11] sub-second labels put the fraction before AM/PM', () => {
    const chart = fakes.mount(
      {
        data: Array.from({ length: 6 }, (_, i) => ({ t: start + i * 100, v: i })),
        x: 't',
        series: [{ y: 'v' }],
        axes: { x: { type: 'time' } },
      },
      { width: 640, height: 240 },
    );
    const labels = xLabels(chart);
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) expect(label).not.toMatch(/(AM|PM)\.\d/);
  });

  it.fails('[render-11] a single Date point gets at least a one-hour domain', () => {
    const chart = fakes.mount({
      data: [{ t: new Date(start), v: 5 }],
      x: 't',
      series: [{ y: 'v' }],
    });
    const x = chart.getAxis('x');
    expect((x?.max ?? 0) - (x?.min ?? 0)).toBeGreaterThanOrEqual(3_600_000);
  });
});

describe('[render-12][gap-environments-09][backlog-06:utc][demos-07:utc] time zones', () => {
  it.fails('[render-12] hour ticks stay on the local hour grid after a DST change', () => {
    inZone('America/New_York', () => {
      const from = new Date(2026, 2, 7, 12).getTime();
      const chart = fakes.mount(
        {
          data: Array.from({ length: 37 }, (_, h) => ({ t: from + h * 3_600_000, v: h % 5 })),
          x: 't',
          series: [{ y: 'v' }],
          axes: { x: { type: 'time' } },
        },
        { width: 800, height: 240 },
      );
      const labels = xLabels(chart);
      expect(labels.length).toBeGreaterThanOrEqual(3);
      // Every hour label sits on a multiple of the step from midnight; after
      // the 8 March transition none may read 1 PM or 1 AM.
      for (const label of labels) expect(label).not.toMatch(/\b0?1:00 (AM|PM)/);
    });
  });

  it.fails('[gap-environments-09] 30-minute ticks land on :00 and :30 in Kathmandu', () => {
    inZone('Asia/Kathmandu', () => {
      const from = Date.UTC(2026, 2, 3, 8, 0);
      const chart = fakes.mount(
        {
          data: Array.from({ length: 151 }, (_, m) => ({ t: from + m * 60_000, v: m % 9 })),
          x: 't',
          series: [{ y: 'v' }],
          axes: { x: { type: 'time' } },
        },
        { width: 520, height: 240 },
      );
      const labels = xLabels(chart);
      expect(labels.length).toBeGreaterThanOrEqual(2);
      for (const label of labels) expect(label).not.toMatch(/:(15|45)\b/);
    });
  });

  it.fails("[backlog-06:utc][demos-07:utc] timeZone: 'UTC' formats readouts in UTC", () => {
    inZone('America/New_York', () => {
      const at = Date.UTC(2026, 2, 1, 9, 30);
      const chart = fakes.mount({
        data: [0, 1, 2].map((i) => ({ t: at + i * 3_600_000, v: i })),
        x: 't',
        series: [{ y: 'v' }],
        axes: { x: { type: 'time' } },
        timeZone: 'UTC',
      } as never);
      chart.setCursor(at);
      expect(chart.getCursorSnapshot().formattedX).toMatch(/9:30/);
    });
  });
});

describe('[gap-environments-06][gap-scale-longevity-03:ticks] locale and streaming ticks', () => {
  it.fails("[gap-environments-06] locale: 'de-DE' formats number ticks and readouts with one locale", () => {
    const chart = fakes.mount({
      data: [0.1, 0.55, 1.4].map((v, t) => ({ t, v })),
      x: 't',
      series: [{ y: 'v' }],
      locale: 'de-DE',
    } as never);
    const yLabels = debug(chart)
      .labelBoxes()
      .filter((box) => box.axis === 'y')
      .map((box) => box.text);
    expect(yLabels.some((label) => /\d,\d/.test(label))).toBe(true);
    chart.setCursor(1);
    expect(chart.getCursorSnapshot().points[0]?.formattedY).toBe('0,55');
  });

  it.fails('[gap-scale-longevity-03:ticks] streaming string X keeps the tick work bounded by the window', () => {
    const chart = fakes.mount(
      {
        data: [{ k: 'k0', v: 0 }],
        x: 'k',
        series: [{ y: 'v' }],
        streaming: { maxPoints: 5 },
      },
      { width: 640, height: 240 },
    );
    for (let i = 1; i <= 200; i++) chart.appendData([{ k: `k${i}`, v: i % 7 }]);
    fakes.frames.flush();
    expect(xLabels(chart).length).toBeLessThanOrEqual(5);
  });
});
