// @vitest-environment jsdom
// Which series the tooltip lists: a bar chart's other marks join its rows, and a point cloud
// answers with the point under the pointer.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { debug, type Fakes, hover, installFakes, tooltipText } from './fakes';

let fakes: Fakes;
beforeEach(() => {
  fakes = installFakes();
});
afterEach(() => fakes.uninstall());

it('a scatter on its own data joins a bar chart tooltip at its point', () => {
  const days = Array.from({ length: 10 }, (_, t) => ({ t, n: 100 + t }));
  const quakes = [{ t: 4, mag: 5.5 }];
  const chart = fakes.mount({
    series: [
      { type: 'bar', data: days, x: 't', y: 'n', label: 'Events' },
      { type: 'scatter', data: quakes, x: 't', y: 'mag', yAxis: 'mag', label: 'Quakes' },
    ],
    axes: { mag: { min: 4, max: 7 } },
  });
  fakes.frames.flush();
  hover(chart, 4, 5.5, { y: 'mag' });
  fakes.frames.flush();
  const text = tooltipText();
  expect(text).toContain('Events');
  expect(text).toContain('Quakes');
});

it('a dense scatter reads the point nearest the pointer, not the nearest X', () => {
  // Two points share almost the same X; the pointer is on the upper one.
  const data = [
    { t: 5, v: 1 },
    { t: 5.01, v: 9 },
  ];
  const chart = fakes.mount({
    data,
    x: 't',
    series: [{ type: 'scatter', y: 'v', label: 'Value' }],
    axes: { x: { min: 0, max: 10 }, y: { min: 0, max: 10 } },
  });
  fakes.frames.flush();
  hover(chart, 5, 9);
  fakes.frames.flush();
  expect(tooltipText()).toMatch(/\b9\b/);
  expect(tooltipText()).not.toMatch(/\by 1\b/);
});

it('[interact-04] a single-series line tooltip shows the X and names its series', () => {
  const chart = fakes.mount({
    data: Array.from({ length: 20 }, (_, t) => ({ t, cpu: 40 + (t % 5) * 3 })),
    x: 't',
    series: [{ y: 'cpu', label: 'CPU' }],
  });
  fakes.frames.flush();
  hover(chart, 10, 40);
  fakes.frames.flush();
  expect(tooltipText()).toContain('CPU');
});

it('tooltip.distance sets how far from a point nearest still shows it; Infinity is anywhere', () => {
  const data = Array.from({ length: 11 }, (_, t) => ({ t, v: 1 }));
  const options = {
    data,
    x: 't',
    series: [{ y: 'v', label: 'Value' }],
    axes: { x: { min: 0, max: 10 }, y: { min: 0, max: 10 } },
  } as const;
  // The line runs along v = 1; the pointer sits at v = 8, far above it.
  const chart = fakes.mount({ ...options, tooltip: { mode: 'nearest' } });
  fakes.frames.flush();
  hover(chart, 5, 8);
  fakes.frames.flush();
  expect(tooltipText()).toBe('');
  chart.update({ tooltip: { mode: 'nearest', distance: Number.POSITIVE_INFINITY } });
  fakes.frames.flush();
  hover(chart, 5, 8);
  fakes.frames.flush();
  expect(tooltipText()).toContain('Value');
  chart.update({ tooltip: { mode: 'nearest', distance: 4 } });
  fakes.frames.flush();
  hover(chart, 5, 8);
  fakes.frames.flush();
  expect(tooltipText()).toBe('');
});

it('tooltip.distance is validated', () => {
  expect(() =>
    fakes.mount({
      data: [{ t: 0, v: 1 }],
      x: 't',
      series: [{ y: 'v' }],
      tooltip: { distance: -1 },
    }),
  ).toThrow(/tooltip\.distance must be a number of CSS pixels/);
});

it('a scatter with distance Infinity reads its nearest point from an empty corner', () => {
  const chart = fakes.mount({
    data: [{ t: 9, v: 9 }],
    x: 't',
    series: [{ type: 'scatter', y: 'v', label: 'Lone' }],
    axes: { x: { min: 0, max: 10 }, y: { min: 0, max: 10 } },
    tooltip: { distance: Number.POSITIVE_INFINITY },
  });
  fakes.frames.flush();
  hover(chart, 0.5, 0.5);
  fakes.frames.flush();
  expect(tooltipText()).toContain('Lone');
});

describe('cursor options', () => {
  const rows = Array.from({ length: 11 }, (_, t) => ({ t, v: t % 3 }));
  const base = {
    data: rows,
    x: 't',
    series: [{ y: 'v', label: 'Value' }],
    axes: { x: { min: 0, max: 10 }, y: { min: 0, max: 10 } },
  } as const;
  /** The overlay's calls during one hover at (x, y) in data units. */
  const overlayCalls = (chart: ReturnType<Fakes['mount']>, x: number, y: number) => {
    const overlay = debug(chart).layers.overlay as HTMLCanvasElement;
    const record = fakes.canvas.of(overlay);
    const from = record.calls.length;
    hover(chart, x, y);
    fakes.frames.flush();
    return record.calls.slice(from);
  };
  /** The [x0, y0, x1, y1] of each moveTo/lineTo pair drawn. */
  const segments = (calls: { name: string; args: unknown[] }[]) => {
    const out: number[][] = [];
    for (let i = 0; i + 1 < calls.length; i++) {
      if (calls[i].name === 'moveTo' && calls[i + 1].name === 'lineTo') {
        out.push([...(calls[i].args as number[]), ...(calls[i + 1].args as number[])]);
      }
    }
    return out;
  };

  it('draws indicators by default and none with indicators: false', () => {
    const on = fakes.mount(base);
    fakes.frames.flush();
    expect(overlayCalls(on, 4, 1).some((c) => c.name === 'arc')).toBe(true);
    const off = fakes.mount({ ...base, cursor: { indicators: false } });
    fakes.frames.flush();
    expect(overlayCalls(off, 4, 1).some((c) => c.name === 'arc')).toBe(false);
  });

  it('adds a horizontal line with yLine: true', () => {
    const chart = fakes.mount({ ...base, cursor: { yLine: true } });
    fakes.frames.flush();
    const horizontal = segments(overlayCalls(chart, 4, 6)).filter(
      ([x0, y0, x1, y1]) => y0 === y1 && Math.abs(x1 - x0) > 50,
    );
    expect(horizontal.length).toBeGreaterThan(0);
  });

  it('follows the pointer between samples with snap: false', () => {
    const at = (chart: ReturnType<Fakes['mount']>) => {
      const vertical = segments(overlayCalls(chart, 4.5, 1)).find(
        ([x0, y0, x1, y1]) => x0 === x1 && Math.abs(y1 - y0) > 50,
      );
      return vertical?.[0];
    };
    const snapped = fakes.mount(base);
    fakes.frames.flush();
    const free = fakes.mount({ ...base, cursor: { snap: false } });
    fakes.frames.flush();
    const sample = snapped.scale('x')!;
    const pointer = free.scale('x')!;
    // Lines sit on half pixels to stay crisp, so each is within a pixel of its X.
    const snappedAt = at(snapped) ?? Number.NaN;
    const nearest = Math.min(...[4, 5].map((x) => Math.abs(sample.toPixel(x) - snappedAt)));
    expect(nearest).toBeLessThanOrEqual(1);
    expect(Math.abs((at(free) ?? Number.NaN) - pointer.toPixel(4.5))).toBeLessThanOrEqual(1);
  });

  it('puts the tooltip tooltip.offset pixels from the pointer', () => {
    /** The tooltip's left edge after one hover, in client pixels. */
    const left = (offset?: number) => {
      const chart = fakes.mount({ ...base, tooltip: offset === undefined ? {} : { offset } });
      fakes.frames.flush();
      hover(chart, 2, 1);
      fakes.frames.flush();
      const tip = [...document.body.querySelectorAll<HTMLElement>('div')].find(
        (element) => element.style.position === 'fixed' && element.style.opacity !== '0',
      );
      const shown = /translate3d\((-?[\d.]+)px/.exec(tip?.style.transform ?? '');
      chart.destroy();
      return Number(shown?.[1]);
    };
    expect(left(40) - left()).toBe(28);
  });

  it('validates cursor options and tooltip.offset', () => {
    expect(() => fakes.mount({ ...base, cursor: { snap: 'yes' as never } })).toThrow(
      /cursor\.snap must be true or false/,
    );
    expect(() => fakes.mount({ ...base, tooltip: { offset: -4 } })).toThrow(
      /tooltip\.offset must be a number of CSS pixels/,
    );
  });
});
