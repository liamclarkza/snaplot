// @vitest-environment jsdom
// A scatter `color` function colours each point (it was accepted and never called).
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { type Fakes, installFakes } from './fakes';

let fakes: Fakes;
beforeEach(() => {
  fakes = installFakes();
});
afterEach(() => fakes.uninstall());

it('a scatter color function is called per point with its value, row and index', () => {
  const data = [
    { t: 0, v: 1, hot: false },
    { t: 1, v: 5, hot: true },
    { t: 2, v: 2, hot: false },
  ];
  const color = vi.fn((_value: number, row: (typeof data)[number] | undefined, _index: number) =>
    row?.hot ? '#ff0000' : '#0000ff',
  );
  fakes.mount({ data, x: 't', series: [{ type: 'scatter', y: 'v', color }] });
  fakes.frames.flush();
  expect(color).toHaveBeenCalledWith(5, data[1], 1);
  expect(color.mock.calls.map((call) => call[2]).sort()).toEqual([0, 1, 2]);
});
