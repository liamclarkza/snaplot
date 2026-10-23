// @vitest-environment jsdom
import { act, createElement as h, createRef, StrictMode } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChartHandle, ChartOptions } from '../public/types';
const mock = vi.hoisted(() => ({
  instances: [] as any[],
  reconciles: vi.fn(),
  controls: vi.fn(),
  groups: [] as any[],
}));
vi.mock('../public/chart', () => ({
  createChart: (container: HTMLElement) => {
    const listeners = new Set<() => void>();
    const chart = {
      container,
      destroy: vi.fn(),
      state: { highlightedSeries: null, hiddenSeries: [], cursor: { source: 'none', points: [] } },
      getState() {
        return this.state;
      },
      subscribe(fn: () => void) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      listeners,
      publish(state: any) {
        this.state = state;
        for (const fn of listeners) fn();
      },
      getLegendItems: () => [{ id: 'y', visible: true }],
      setViewport: vi.fn(),
      setSelection: vi.fn(),
      setSeriesVisible: vi.fn(),
    };
    mock.instances.push(chart);
    return chart;
  },
  reconcileChart: mock.reconciles,
  setChartControls: mock.controls,
  createChartGroup: (options: unknown) => {
    const group = { options, destroy: vi.fn() };
    mock.groups.push(group);
    return group;
  },
}));
import { Chart } from './Chart';
import type { ControlledOptionKeys } from './shared';
import { useChartGroup, useChartState } from './hooks';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = undefined;
  document.body.replaceChildren();
  mock.instances.length = 0;
  mock.groups.length = 0;
  vi.clearAllMocks();
});
type Row = { x: number; y: number };
const options: Omit<ChartOptions<Row>, ControlledOptionKeys> = {
  x: 'x',
  data: [{ x: 1, y: 2 }],
  series: [{ y: 'y' }],
};
function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  return host;
}
describe('React chart lifecycle', () => {
  it('balances StrictMode setup and cleanup, updates atomically, and exposes live refs', async () => {
    mount();
    const ref = createRef<ChartHandle<Row>>();
    await act(async () => root!.render(h(StrictMode, null, h(Chart<Row>, { ...options, ref }))));
    expect(mock.instances).toHaveLength(2);
    expect(mock.instances[0].destroy).toHaveBeenCalledOnce();
    const live = mock.instances[1];
    expect(ref.current).toBe(live);
    const next = { ...options, data: [{ x: 3, y: 4 }], axes: { x: { title: 'Time' } } };
    await act(async () => root!.render(h(StrictMode, null, h(Chart<Row>, { ...next, ref }))));
    expect(mock.instances).toHaveLength(2);
    expect(mock.reconciles).toHaveBeenLastCalledWith(
      live,
      { ...next, ariaLabel: 'Chart' },
      expect.any(Object),
    );
    await act(async () => root!.render(h(StrictMode, null, h(Chart<Row>, { ...options, ref }))));
    expect(mock.reconciles).toHaveBeenLastCalledWith(
      live,
      { ...options, ariaLabel: 'Chart' },
      expect.any(Object),
    );
    await act(async () => root!.unmount());
    root = undefined;
    expect(live.destroy).toHaveBeenCalledOnce();
    expect(ref.current).toBeNull();
  });
  it('cleans callback refs on replacement and unmount without remounting the chart', async () => {
    mount();
    const stop = vi.fn();
    const first = vi.fn(() => stop);
    const second = vi.fn();
    await act(async () => root!.render(h(Chart<Row>, { ...options, ref: first })));
    await act(async () => root!.render(h(Chart<Row>, { ...options, ref: second })));
    expect(stop).toHaveBeenCalledOnce();
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledWith(mock.instances[0]);
    expect(mock.instances).toHaveLength(1);
    await act(async () => root!.unmount());
    root = undefined;
    expect(second).toHaveBeenLastCalledWith(null);
  });
  it('forwards controlled proposals separately and applies uncontrolled defaults once', async () => {
    mount();
    const change = vi.fn();
    const props = {
      ...options,
      viewport: { x: { min: 2, max: 8 } },
      selectionState: null,
      defaultHiddenSeries: ['y'],
      onViewportChange: change,
    };
    await act(async () => root!.render(h(Chart<Row>, props)));
    expect(mock.controls).toHaveBeenLastCalledWith(mock.instances[0], {
      viewport: props.viewport,
      selection: null,
      onViewportChange: change,
      onSelectionChange: undefined,
      onHiddenSeriesChange: undefined,
    });
    expect(mock.instances[0].setSeriesVisible).toHaveBeenCalledExactlyOnceWith('y', false);
    await act(async () => root!.render(h(Chart<Row>, props)));
    expect(mock.instances[0].setSeriesVisible).toHaveBeenCalledOnce();
    expect(mock.reconciles).toHaveBeenLastCalledWith(
      mock.instances[0],
      { ...options, ariaLabel: 'Chart' },
      expect.any(Object),
    );
  });
  it('renders without constructing on the server and hydrates the existing host', async () => {
    const markup = renderToString(h(Chart<Row>, { ...options, ariaLabel: 'Utilization' }));
    expect(mock.instances).toHaveLength(0);
    const host = document.createElement('div');
    host.innerHTML = markup;
    document.body.append(host);
    const chartHost = host.firstElementChild;
    await act(async () => {
      root = hydrateRoot(host, h(Chart<Row>, { ...options, ariaLabel: 'Utilization' }));
    });
    expect(mock.instances).toHaveLength(1);
    expect(mock.instances[0].container).toBe(chartHost);
    expect(chartHost?.getAttribute('aria-label')).toBe('Utilization');
  });
  it('uses stable external snapshots and releases subscriptions', async () => {
    mount();
    await act(async () => root!.render(h(Chart<Row>, options)));
    const chart = mock.instances[0];
    function State() {
      const state = useChartState(chart);
      return h('span', null, state?.highlightedSeries);
    }
    await act(async () => root!.render(h(State)));
    expect(chart.listeners.size).toBe(1);
    await act(async () => chart.publish({ ...chart.state, highlightedSeries: 'y' }));
    expect(document.body.textContent).toBe('y');
    await act(async () => root!.unmount());
    root = undefined;
    expect(chart.listeners.size).toBe(0);
  });
  it('does not destroy the active group during StrictMode effect replay', async () => {
    mount();
    let active: any;
    function Owner() {
      active = useChartGroup({ viewport: true });
      return null;
    }
    await act(async () => root!.render(h(StrictMode, null, h(Owner))));
    expect(active.destroy).not.toHaveBeenCalled();
    await act(async () => root!.unmount());
    root = undefined;
    expect(active.destroy).toHaveBeenCalledOnce();
  });
});
