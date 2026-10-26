// @vitest-environment jsdom
import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChartHandle, ChartState, SeriesState } from '../public/types';
import { darkTheme } from '../config/theme';
import { LegendTable, SeriesLegend } from './legends';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});
function chartFixture() {
  const handlers = new Map<string, Set<() => void>>();
  const listeners = new Set<() => void>();
  const items: SeriesState[] = [
    {
      id: 'cpu',
      label: 'CPU',
      type: 'line',
      color: '#123456',
      fill: null,
      visible: true,
      dash: [],
      opacity: 1,
    },
  ];
  let state: ChartState = {
    viewport: {},
    selection: null,
    hiddenSeries: [],
    highlight: null,
    following: false,
    cursor: {
      x: 1,
      formattedX: '1 sec',
      source: 'cursor',
      activeSeriesId: null,
      points: [
        {
          seriesId: 'cpu',
          label: 'CPU',
          rowIndex: 0,
          x: 1,
          y: 42,
          color: '#123456',
          formattedX: '1 sec',
          formattedY: '42%',
        },
      ],
    },
  };
  const fake = {
    getState: () => state,
    getCursorSnapshot: () => state.cursor,
    getLegendItems: () => items,
    getTheme: () => darkTheme,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    on(name: string, fn: () => void) {
      const set = handlers.get(name) ?? new Set();
      handlers.set(name, set);
      set.add(fn);
      return () => set.delete(fn);
    },
    setSeriesVisible: vi.fn(),
    setHighlight: vi.fn(),
    publish(patch: Partial<ChartState>) {
      state = { ...state, ...patch };
      for (const fn of listeners) fn();
    },
    optionsChanged() {
      for (const fn of handlers.get('options:update') ?? []) fn();
    },
  };
  return { fake, chart: fake as unknown as ChartHandle, listeners, handlers, items };
}
function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  return host;
}
describe('React native legends', () => {
  it('uses stable series IDs for pointer, keyboard and visibility interactions', async () => {
    const host = mount();
    const { chart, fake, listeners, handlers, items } = chartFixture();
    await act(async () => root!.render(h(SeriesLegend<Record<string, unknown>>, { chart })));
    const button = host.querySelector('button')!;
    expect(button.getAttribute('aria-pressed')).toBe('true');
    await act(async () => button.click());
    expect(fake.setSeriesVisible).toHaveBeenCalledWith('cpu', false);
    await act(async () => button.focus());
    expect(fake.setHighlight).toHaveBeenCalledWith('cpu');
    items[0].visible = false;
    await act(async () => fake.optionsChanged());
    expect(button.getAttribute('aria-label')).toBe('Show CPU');
    expect(host.querySelector('div')?.style.getPropertyValue('--snaplot-theme-text')).toBe(
      darkTheme.textColor,
    );
    await act(async () => root!.unmount());
    root = undefined;
    expect(listeners.size).toBe(0);
    expect([...handlers.values()].every((set) => set.size === 0)).toBe(true);
  });
  it('renders native cells and hides stale metric values in series-only fallback', async () => {
    const host = mount();
    const { chart, fake } = chartFixture();
    await act(async () => root!.render(h(LegendTable<Record<string, unknown>>, { chart })));
    expect(host.textContent).toContain('42%');
    expect(host.querySelector('.snaplot-legend-swatch')).not.toBeNull();
    await act(async () =>
      fake.publish({ cursor: { ...fake.getState().cursor, source: 'latest' } }),
    );
    expect(host.textContent).not.toContain('42%');
    expect(host.textContent).toContain('—');
    await act(async () =>
      root!.render(
        h(LegendTable<Record<string, unknown>>, {
          chart,
          fallback: 'latest',
          columns: [
            {
              key: 'action',
              header: 'Action',
              cell: (point, _series, api) =>
                h(
                  'button',
                  { type: 'button', onClick: () => api.setHighlight(point.seriesId) },
                  point.formattedY,
                ),
            },
          ],
        }),
      ),
    );
    expect(host.querySelector('button')?.textContent).toBe('42%');
    await act(async () => host.querySelector('button')!.click());
    expect(fake.setHighlight).toHaveBeenCalledWith('cpu');
  });
});
