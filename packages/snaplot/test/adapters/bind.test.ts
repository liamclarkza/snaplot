// @vitest-environment jsdom
// The framework-neutral binding (plan §7.1): the prop split, the host's role, name and height,
// the chart's lifecycle and the ref registry the React hooks resolve through.
import type { ChartHandle } from 'snaplot';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  accessibleName,
  attachRef,
  bindChart,
  cssHeight,
  hostDefaults,
  OPTION_KEYS,
  resolveChart,
  splitProps,
  watchRef,
} from '../../src/adapters/bind';
import { debug, type Fakes, installFakes } from '../fakes';

type Row = { t: number; cpu: number };
const rows: Row[] = Array.from({ length: 20 }, (_, t) => ({ t, cpu: 40 + t }));

describe('[frameworks-16] the prop split', () => {
  it('[frameworks-16] options go to the chart; id, class, data-*, aria-*, tabIndex and DOM handlers to the host', () => {
    const onClick = () => {};
    const onPointClick = () => {};
    const { options, attributes } = splitProps<Row>({
      data: rows,
      x: 't',
      series: [{ y: 'cpu' }],
      onPointClick,
      height: 280,
      id: 'cpu',
      className: 'chart',
      class: 'chart',
      'data-testid': 'cpu',
      'aria-describedby': 'note',
      tabIndex: -1,
      onClick,
      ref: () => {},
      children: 'ignored',
      style: { color: 'red' },
    });
    expect(Object.keys(options).sort()).toEqual(['data', 'height', 'onPointClick', 'series', 'x']);
    expect(options.onPointClick).toBe(onPointClick);
    expect(attributes).toEqual({
      id: 'cpu',
      className: 'chart',
      class: 'chart',
      'data-testid': 'cpu',
      'aria-describedby': 'note',
      tabIndex: -1,
      onClick,
    });
  });

  it('every option key is a top-level option, and each callback option is one', () => {
    expect(new Set(OPTION_KEYS).size).toBe(OPTION_KEYS.length);
    for (const key of [
      'onPointClick',
      'onSelectionChange',
      'onViewportChange',
      'onHiddenSeriesChange',
      'onHighlightChange',
      'onFollowingChange',
      'onCursorChange',
    ])
      expect(OPTION_KEYS).toContain(key);
  });
});

describe('[frameworks-20] the host a component renders', () => {
  it('[frameworks-20] is a figure named by ariaLabel, else by a summary of its series', () => {
    const series = [
      { y: 'cpu', label: 'CPU' },
      { y: 'mem', label: 'Memory' },
    ] as const;
    expect(hostDefaults({ series })).toEqual({
      role: 'figure',
      'aria-label': 'Line chart, 2 series: CPU, Memory',
    });
    expect(accessibleName({ series, ariaLabel: 'Load' })).toBe('Load');
    expect(accessibleName({ series: [{ y: 'cpu' }] })).toBe('Line chart, 1 series: cpu');
    expect(
      accessibleName({ series: [{ type: 'scatter', y: (row: Row) => row.cpu, id: 'load' }] }),
    ).toBe('Scatter chart, 1 series: load');
    expect(
      accessibleName({
        series: [{ y: 'cpu' }, { type: 'bar', y: (row: Row) => row.cpu, id: 'b' }],
      }),
    ).toBe('Chart, 2 series: cpu, b');
    expect(accessibleName({ series: [] })).toBe('Chart, 0 series');
  });

  it('[backlog-05] an explicit height is a CSS height: pixels for a number, as given otherwise', () => {
    expect(cssHeight(280)).toBe('280px');
    expect(cssHeight('20rem')).toBe('20rem');
    expect(cssHeight(undefined)).toBeUndefined();
  });
});

describe('bindChart', () => {
  let fakes: Fakes;
  beforeEach(() => {
    fakes = installFakes();
  });
  afterEach(() => {
    fakes.uninstall();
    vi.restoreAllMocks();
  });

  function host(): HTMLElement {
    const element = document.createElement('div');
    fakes.layout.setSize(element, 400, 200);
    document.body.append(element);
    return element;
  }

  it('[arch-04] update() always applies the options of a render; the core diffs them', () => {
    const element = host();
    const base = { data: rows, x: 't', series: [{ y: 'cpu' }] } as const;
    const binding = bindChart<Row>(element, base);
    const setOptions = vi.spyOn(binding.chart, 'setOptions');
    // The options it was created with need no second pass.
    binding.update(base);
    expect(setOptions).not.toHaveBeenCalled();
    const before = debug(binding.chart).ingestCount;
    binding.update({ ...base, axes: { y: { title: 'Load' } } });
    binding.update({ ...base, axes: { y: { title: 'Load' } }, onPointClick: () => {} });
    expect(setOptions).toHaveBeenCalledTimes(2);
    expect(debug(binding.chart).ingestCount).toBe(before);
    binding.destroy();
    expect(element.querySelectorAll('canvas')).toHaveLength(0);
  });
});

describe('[frameworks-14][research-05] the ref registry', () => {
  const handle = { getState: () => ({}) } as unknown as ChartHandle<Row>;

  it('[frameworks-14] a ref object holds the chart and tells its watchers, then is emptied', () => {
    const ref: { current: ChartHandle<Row> | null } = { current: null };
    const seen: (ChartHandle<Row> | null)[] = [];
    const stop = watchRef(ref, () => seen.push(resolveChart(ref)));
    const detach = attachRef(ref, handle);
    expect(ref.current).toBe(handle);
    detach();
    expect(ref.current).toBeNull();
    expect(seen).toEqual([handle, null]);
    stop();
    attachRef(ref, handle);
    expect(seen).toHaveLength(2);
  });

  it('a callback ref is called with the chart, then with null, or its cleanup runs', () => {
    const calls: unknown[] = [];
    attachRef<ChartHandle<Row>>((value) => void calls.push(value), handle)();
    expect(calls).toEqual([handle, null]);
    const cleanup = vi.fn();
    attachRef<ChartHandle<Row>>(() => cleanup, handle)();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('a ref emptied by a newer chart is left alone; a handle and nothing resolve as they are', () => {
    const ref: { current: ChartHandle<Row> | null } = { current: null };
    const older = attachRef(ref, handle);
    const newer = { ...handle } as ChartHandle<Row>;
    attachRef(ref, newer);
    older();
    expect(ref.current).toBe(newer);
    expect(resolveChart(handle)).toBe(handle);
    expect(resolveChart(null)).toBeNull();
    expect(resolveChart(undefined)).toBeNull();
    expect(watchRef(handle, () => {})).toBeTypeOf('function');
  });
});
