// @vitest-environment jsdom
// Which series the tooltip lists: a bar chart's other marks join its rows, and a point cloud
// answers with the point under the pointer.
import { afterEach, beforeEach, expect, it } from 'vitest';
import { type Fakes, hover, installFakes, tooltipText } from './fakes';

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
