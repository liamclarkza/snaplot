// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import type { ChartHandle, ChartState, LegendItem } from '../public/types';
import { darkTheme } from '../config/theme';
import { SeriesLegend } from './SeriesLegend';
import { LegendTable } from './LegendTable';
import { column } from './columns';
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});
function fixture() {
  const listeners = new Set<() => void>();
  const handlers = new Map<string, Set<() => void>>();
  const items: LegendItem[] = [
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
    highlightedSeries: null,
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
    getLegendItems: () => [...items].map((item) => ({ ...item })),
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
  };
  return { fake, chart: fake as unknown as ChartHandle, listeners, handlers };
}
describe('Solid native legends', () => {
  it('preserves legend rows during cursor changes and releases subscriptions', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const { chart, fake, listeners, handlers } = fixture();
    dispose = render(
      () => (
        <>
          <SeriesLegend chart={() => chart} />
          <LegendTable chart={() => chart} />
        </>
      ),
      host,
    );
    const row = host.querySelector('tbody tr');
    expect(host.textContent).toContain('42%');
    fake.publish({ hiddenSeries: [], cursor: { ...fake.getState().cursor, source: 'latest' } });
    expect(host.querySelector('tbody tr')).toBe(row);
    expect(host.textContent).not.toContain('42%');
    host.querySelector('button')!.click();
    expect(fake.setSeriesVisible).toHaveBeenCalledWith('cpu', false);
    dispose();
    dispose = undefined;
    expect(listeners.size).toBe(0);
    expect([...handlers.values()].every((set) => set.size === 0)).toBe(true);
  });
  it('mounts native JSX cell actions with stable identity', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const { chart, fake } = fixture();
    dispose = render(
      () => (
        <LegendTable
          chart={() => chart}
          columns={[
            column({
              key: 'action',
              header: 'Action',
              cell: (point, _series, api) => (
                <button type="button" onClick={() => api.setHighlight(point.seriesId)}>
                  {point.formattedY}
                </button>
              ),
            }),
          ]}
        />
      ),
      host,
    );
    expect(host.querySelector('button')?.textContent).toBe('42%');
    host.querySelector('button')!.click();
    expect(fake.setHighlight).toHaveBeenCalledWith('cpu');
  });
});
