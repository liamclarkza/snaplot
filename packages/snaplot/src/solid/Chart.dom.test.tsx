// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChartHandle, ChartOptions } from '../public/types';
const mock = vi.hoisted(() => ({ instances: [] as any[], reconciles: vi.fn(), controls: vi.fn() }));
vi.mock('../api/createChart', () => ({
  createChart: (container: HTMLElement) => {
    const chart = {
      container,
      destroy: vi.fn(),
      getLegendItems: () => [],
      setViewport: vi.fn(),
      setSelection: vi.fn(),
      setSeriesVisible: vi.fn(),
    };
    mock.instances.push(chart);
    return chart;
  },
  reconcileChart: mock.reconciles,
  setChartControls: mock.controls,
}));
import { createSignal } from 'solid-js';
import { render, hydrate } from 'solid-js/web';
import { Chart } from './Chart';
import type { ControlledOptionKeys } from '../react/shared';
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  mock.instances.length = 0;
  vi.clearAllMocks();
});
type Row = { x: number; y: number };
const options: Omit<ChartOptions<Row>, ControlledOptionKeys> = {
  data: [{ x: 0, y: 1 }],
  x: 'x',
  series: [{ y: 'y' }],
};
const tick = () => Promise.resolve();
describe('Solid component lifecycle', () => {
  it('owns a single chart, reconciles reactive direct props, and releases refs', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const [data, setData] = createSignal(options.data);
    const ref = vi.fn();
    const ready = vi.fn();
    dispose = render(
      () => <Chart {...options} data={data()} ref={ref} onReady={ready} ariaLabel="CPU" />,
      host,
    );
    await tick();
    expect(mock.instances).toHaveLength(1);
    const instance = mock.instances[0];
    expect(ready).toHaveBeenCalledWith(instance);
    expect(ref).toHaveBeenCalledWith(instance);
    expect(host.firstElementChild?.getAttribute('aria-label')).toBe('CPU');
    setData([{ x: 2, y: 3 }]);
    await tick();
    expect(mock.instances).toHaveLength(1);
    expect(mock.reconciles).toHaveBeenLastCalledWith(
      instance,
      { ...options, data: data(), ariaLabel: 'CPU' },
      expect.any(Object),
    );
    dispose();
    dispose = undefined;
    expect(instance.destroy).toHaveBeenCalledOnce();
    expect(ref).toHaveBeenLastCalledWith(undefined);
  });
  it('hydrates an existing host and applies controlled values through the shared controller', async () => {
    const host = document.createElement('div');
    host.innerHTML =
      '<div data-hk="00" role="group" aria-label="CPU" style="width:100%;height:100%"></div>';
    document.body.append(host);
    const existing = host.firstElementChild;
    const ref = vi.fn<(chart: ChartHandle<Row> | undefined) => void>();
    const change = vi.fn();
    Object.assign(globalThis, { _$HY: { completed: new WeakSet(), events: [], r: {} } });
    dispose = hydrate(
      () => (
        <Chart
          {...options}
          ariaLabel="CPU"
          ref={ref}
          viewport={{ x: { min: 0, max: 5 } }}
          selectionState={null}
          hiddenSeries={['y']}
          onViewportChange={change}
        />
      ),
      host,
    );
    await tick();
    expect(mock.instances[0].container).toBe(existing);
    expect(host.children).toHaveLength(1);
    expect(mock.controls).toHaveBeenLastCalledWith(mock.instances[0], {
      viewport: { x: { min: 0, max: 5 } },
      selection: null,
      hiddenSeries: ['y'],
      onViewportChange: change,
      onSelectionChange: undefined,
      onHiddenSeriesChange: undefined,
    });
  });
});
