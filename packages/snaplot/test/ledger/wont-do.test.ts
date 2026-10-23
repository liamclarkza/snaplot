// @vitest-environment jsdom
// The §6 won't-do parts of required findings (plan §6 "Won't do in this
// overhaul"). They stay expected failures through the release: P12 keeps
// known defects visible, and trace-check requires that at release the ledger
// holds only these part ids. Each one is also recorded in docs/backlog.md.
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

/** Series colours, read from the final state shape when it exists. */
function seriesColours(chart: ChartHandle<any>): string[] {
  const state = chart.getState() as { series?: Array<{ color: string }> };
  return state.series?.map((series) => series.color) ?? chart.getLegendItems().map((i) => i.color);
}

function contrastOnWhite(hex: string): number {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel((value >> 16) & 255) +
    0.7152 * channel((value >> 8) & 255) +
    0.0722 * channel(value & 255);
  return 1.05 / (luminance + 0.05);
}

describe("won't do in this overhaul (plan §6)", () => {
  it.fails("[backlog-06:iana][demos-07:iana] an IANA timeZone such as 'Asia/Tokyo' formats readouts in that zone", () => {
    const at = Date.UTC(2026, 2, 1, 0, 30); // 09:30 in Tokyo
    const chart = fakes.mount({
      data: [0, 1, 2].map((i) => ({ t: at + i * 3_600_000, v: i })),
      x: 't',
      series: [{ y: 'v' }],
      axes: { x: { type: 'time' } },
      timeZone: 'Asia/Tokyo',
    } as never);
    chart.setCursor(at);
    expect(chart.getCursorSnapshot().formattedX).toMatch(/9:30/);
  });

  it.fails('[visuals-13:light] every light palette colour has 3:1 contrast on white', () => {
    const chart = fakes.mount({
      data: [{ t: 0, a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8 }],
      x: 't',
      series: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((y) => ({ y })),
      theme: 'light',
    } as never);
    const colours = seriesColours(chart);
    expect(colours).toHaveLength(8);
    expect(colours.filter((colour) => contrastOnWhite(colour) < 3)).toEqual([]);
  });

  it.fails('[gap-scale-longevity-06:shared-loop] ten streaming charts share one animation frame request', () => {
    const charts = Array.from({ length: 10 }, () =>
      fakes.mount({
        data: Array.from({ length: 50 }, (_, t) => ({ t, v: t })),
        x: 't',
        series: [{ y: 'v' }],
      }),
    );
    fakes.frames.flush();
    for (const chart of charts) chart.appendData([{ t: 50, v: 1 }]);
    expect(fakes.frames.pending).toBeLessThanOrEqual(1);
  });

  it.fails('[backlog-28:cold-scatter] a cold 150k-point scatter paint draws at most one mark per plot pixel', () => {
    const n = 150_000;
    const chart = fakes.mount(
      {
        data: {
          columns: {
            x: Float64Array.from({ length: n }, (_, i) => (i * 7919) % 1000),
            y: Float64Array.from({ length: n }, (_, i) => (i * 104729) % 1000),
          },
        },
        x: 'x',
        series: [{ type: 'scatter', y: 'y' }],
      },
      { width: 300, height: 200 },
    );
    fakes.frames.flush();
    const { plot } = chart.getLayout();
    expect(debug(chart).drawnPoints).toBeLessThanOrEqual(plot.width * plot.height);
  });
});
