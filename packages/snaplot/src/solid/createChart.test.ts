import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChartConfig, ColumnarData } from '../types';

vi.mock('solid-js', async () => vi.importActual('solid-js/dist/solid.js'));

import { createRoot, createSignal } from 'solid-js';

const f = (xs: number[]) => Float64Array.from(xs);

const mockState = vi.hoisted(() => ({
  instances: [] as Array<{
    el: HTMLElement;
    config: ChartConfig;
    data: ColumnarData;
    setData: ReturnType<typeof vi.fn>;
    setOptions: ReturnType<typeof vi.fn>;
    replaceOptions: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('../core/Chart', () => ({
  ChartCore: class {
    el: HTMLElement;
    config: ChartConfig;
    data: ColumnarData;
    setData = vi.fn();
    setOptions = vi.fn();
    replaceOptions = vi.fn();
    destroy = vi.fn();

    constructor(el: HTMLElement, config: ChartConfig, data: ColumnarData) {
      this.el = el;
      this.config = config;
      this.data = data;
      mockState.instances.push(this);
    }
  },
}));

import { createChart } from './createChart';

const tick = () => Promise.resolve();

describe('createChart', () => {
  afterEach(() => {
    mockState.instances.length = 0;
    vi.clearAllMocks();
  });

  it('updates the existing chart instead of recreating on data/config changes', async () => {
    await createRoot(async (dispose) => {
      const el = {} as HTMLElement;
      const initialConfig: ChartConfig = { series: [{ label: 'value', dataIndex: 1 }] };
      const initialData: ColumnarData = [f([1]), f([10])];
      const [config, setConfig] = createSignal(initialConfig);
      const [data, setData] = createSignal(initialData);

      const chart = createChart(() => el, config, data);
      await tick();

      expect(mockState.instances).toHaveLength(1);
      const first = mockState.instances[0];
      expect(chart()).toBe(first);

      const nextData: ColumnarData = [f([1, 2]), f([10, 20])];
      setData(nextData);
      await tick();

      expect(mockState.instances).toHaveLength(1);
      expect(first.setData).toHaveBeenCalledWith(nextData);

      const nextConfig: ChartConfig = {
        series: [{ label: 'renamed', dataIndex: 1 }],
      };
      setConfig(nextConfig);
      await tick();

      expect(mockState.instances).toHaveLength(1);
      expect(first.replaceOptions).toHaveBeenCalledWith(nextConfig);

      dispose();
      expect(first.destroy).toHaveBeenCalledTimes(1);
    });
  });

  it('recreates only when the container element changes', async () => {
    await createRoot(async (dispose) => {
      const el1 = {} as HTMLElement;
      const el2 = {} as HTMLElement;
      const [el, setEl] = createSignal<HTMLElement | undefined>(undefined);
      const [config] = createSignal<ChartConfig>({
        series: [{ label: 'value', dataIndex: 1 }],
      });
      const [data] = createSignal<ColumnarData>([f([1]), f([10])]);

      const chart = createChart(el, config, data);
      await tick();
      expect(chart()).toBeUndefined();
      expect(mockState.instances).toHaveLength(0);

      setEl(el1);
      await tick();
      expect(mockState.instances).toHaveLength(1);
      const first = mockState.instances[0];
      expect(first.el).toBe(el1);

      setEl(el2);
      await tick();
      expect(first.destroy).toHaveBeenCalledTimes(1);
      expect(mockState.instances).toHaveLength(2);
      expect(mockState.instances[1].el).toBe(el2);
      expect(chart()).toBe(mockState.instances[1]);

      dispose();
      expect(mockState.instances[1].destroy).toHaveBeenCalledTimes(1);
    });
  });
});
