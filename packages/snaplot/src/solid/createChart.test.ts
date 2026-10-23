import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChartHandle, ChartOptions, ChartState } from '../public/types';
vi.mock('solid-js', async () => vi.importActual('solid-js/dist/solid.js'));
import { createRoot, createSignal } from 'solid-js';
const mock = vi.hoisted(() => ({ instances: [] as any[], reconciles: vi.fn() }));
vi.mock('../api/createChart', () => ({
  createChart: (container: HTMLElement, options: ChartOptions) => {
    const listeners = new Set<() => void>();
    const chart = {
      container,
      options,
      destroy: vi.fn(),
      state: { highlightedSeries: null },
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
      setHighlight: vi.fn(),
    };
    mock.instances.push(chart);
    return chart;
  },
  reconcileChart: mock.reconciles,
}));
import { createChart } from './createChart';
import { createChartState } from './createChartState';
import { createHighlight } from './createHighlight';
const options: ChartOptions<{ x: number; y: number }> = {
  data: [{ x: 1, y: 2 }],
  x: 'x',
  series: [{ y: 'y' }],
};
afterEach(() => {
  mock.instances.length = 0;
  vi.clearAllMocks();
});
describe('Solid chart ownership', () => {
  it('reconciles complete options without remounting and destroys on host replacement', async () => {
    let dispose!: () => void;
    const [host, setHost] = createSignal<HTMLElement>();
    const [value, setValue] = createSignal(options);
    let chart!: () => ChartHandle<{ x: number; y: number }> | undefined;
    createRoot((stop) => {
      dispose = stop;
      chart = createChart(host, value);
    });
    expect(chart()).toBeUndefined();
    const first = {} as HTMLElement;
    setHost(first);
    expect(mock.instances).toHaveLength(1);
    const instance = mock.instances[0];
    setValue({ ...options, data: [{ x: 2, y: 3 }] });
    expect(mock.instances).toHaveLength(1);
    expect(mock.reconciles).toHaveBeenLastCalledWith(instance, value());
    setHost({} as HTMLElement);
    expect(instance.destroy).toHaveBeenCalledOnce();
    expect(mock.instances).toHaveLength(2);
    dispose();
    expect(mock.instances[1].destroy).toHaveBeenCalledOnce();
  });
  it('resubscribes state when the chart accessor changes and cleans up ownership', () => {
    let dispose!: () => void;
    let state!: () => ChartState<{ x: number; y: number }> | undefined;
    let highlight!: readonly [() => string | null, (id: string | null) => void];
    const [host, setHost] = createSignal<HTMLElement>({} as HTMLElement);
    createRoot((stop) => {
      dispose = stop;
      const chart = createChart(host, () => options);
      state = createChartState(chart);
      highlight = createHighlight(chart);
    });
    const first = mock.instances[0];
    first.publish({ highlightedSeries: 'y' });
    expect(state()?.highlightedSeries).toBe('y');
    expect(highlight[0]()).toBe('y');
    highlight[1](null);
    expect(first.setHighlight).toHaveBeenCalledWith(null);
    setHost({} as HTMLElement);
    expect(first.listeners.size).toBe(0);
    dispose();
    expect(mock.instances[1].listeners.size).toBe(0);
  });
});
