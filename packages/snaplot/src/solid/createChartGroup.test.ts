import { describe, expect, it, vi } from 'vitest';
import type { ChartConfig, ChartInstance } from '../types';

vi.mock('solid-js', async () => vi.importActual('solid-js/dist/solid.js'));

import { createRoot } from 'solid-js';
import { createChartGroup } from './createChartGroup';

/**
 * Minimal ChartInstance stand-in exposing only what the group's link
 * coordinator touches (on, getAxis, getLayout, getOptions, setAxis,
 * setOptions), plus a `fire()` test helper to emit a data:update.
 */
function fakeChart(init: { yMin: number; yMax: number; plotLeft: number }) {
  const handlers: Record<string, Array<() => void>> = {};
  let y = { min: init.yMin, max: init.yMax };
  let paddingLeft: number | undefined;
  const chart = {
    on(event: string, h: () => void) {
      (handlers[event] ??= []).push(h);
      return () => {};
    },
    getAxis(key: string) {
      return key === 'y' ? y : undefined;
    },
    getLayout() {
      return { plot: { left: init.plotLeft, top: 0, width: 100, height: 100 }, width: 200, height: 120, axes: {}, dpr: 1 };
    },
    getOptions() {
      return { series: [], padding: { left: paddingLeft } };
    },
    setAxis(key: string, range: { min?: number; max?: number }) {
      if (key === 'y') y = { min: range.min ?? y.min, max: range.max ?? y.max };
    },
    setOptions(config: { padding?: { left?: number } }) {
      if (config.padding?.left !== undefined) paddingLeft = config.padding.left;
    },
  };
  return {
    chart: chart as unknown as ChartInstance,
    fire: () => {
      for (const h of handlers['data:update'] ?? []) h();
    },
    getY: () => y,
    getPadding: () => paddingLeft,
  };
}

describe('createChartGroup bindings', () => {
  it('omits zoom sync by default and includes it only when opted in', () => {
    createRoot((dispose) => {
      const group = createChartGroup();

      const bindings = group.bind();
      expect(bindings.cursor.syncKey).toBe(group.syncKey);
      expect(bindings.highlight.syncKey).toBe(group.syncKey);
      expect(bindings.zoom).toBeUndefined();

      expect(group.bind({ zoom: true }).zoom?.syncKey).toBe(group.syncKey);

      dispose();
    });
  });

  it('apply does not clobber a caller-set syncKey and preserves other fields', () => {
    createRoot((dispose) => {
      const group = createChartGroup();
      const config: ChartConfig = {
        series: [{ label: 'a', dataIndex: 1 }],
        cursor: { syncKey: 'mine', show: true },
      };

      const applied = group.apply(config);
      expect(applied.cursor?.syncKey).toBe('mine');
      expect(applied.cursor?.show).toBe(true);
      expect(applied.highlight?.syncKey).toBe(group.syncKey);
      // Zoom sync is opt-in.
      expect(applied.zoom).toBeUndefined();

      const withZoom = group.apply(config, { zoom: true });
      expect(withZoom.zoom?.syncKey).toBe(group.syncKey);

      dispose();
    });
  });
});

describe('createChartGroup fleet defaults', () => {
  it('merges group defaults under each chart config, with the chart winning', () => {
    createRoot((dispose) => {
      const group = createChartGroup({
        defaults: {
          axes: { x: { type: 'time' } },
          tooltip: { mode: 'nearest' },
          theme: { fontSize: 13 },
        },
      });
      const applied = group.apply({
        series: [{ label: 'a', dataIndex: 1 }],
        tooltip: { mode: 'index' }, // chart overrides the default
      });
      expect(applied.axes?.x?.type).toBe('time'); // from defaults
      expect(applied.tooltip?.mode).toBe('index'); // chart wins
      expect(applied.theme?.fontSize).toBe(13); // from defaults
      expect(applied.series.length).toBe(1);
      expect(applied.cursor?.syncKey).toBe(group.syncKey); // sync keys still applied
      dispose();
    });
  });
});

describe('createChartGroup fleet linking', () => {
  it('shares the union Y domain and aligns gutters across linked charts', () => {
    createRoot((dispose) => {
      const group = createChartGroup();
      const a = fakeChart({ yMin: 0, yMax: 10, plotLeft: 40 });
      const b = fakeChart({ yMin: 5, yMax: 25, plotLeft: 64 });

      group.link(a.chart);
      group.link(b.chart); // linking b coordinates both

      // Union Y domain [0, 25] on both.
      expect(a.getY()).toEqual({ min: 0, max: 25 });
      expect(b.getY()).toEqual({ min: 0, max: 25 });
      // Gutters aligned to the widest (64).
      expect(a.getPadding()).toBe(64);
      expect(b.getPadding()).toBe(64);
      dispose();
    });
  });

  it('recoordinates when a linked chart updates its data', () => {
    createRoot((dispose) => {
      const group = createChartGroup();
      const a = fakeChart({ yMin: 0, yMax: 10, plotLeft: 40 });
      const b = fakeChart({ yMin: 0, yMax: 10, plotLeft: 40 });
      group.link(a.chart);
      group.link(b.chart);
      expect(a.getY()).toEqual({ min: 0, max: 10 });

      // a's data grows; firing data:update recomputes the shared domain.
      a.chart.setAxis('y', { min: -5, max: 30 });
      a.fire();
      expect(a.getY()).toEqual({ min: -5, max: 30 });
      expect(b.getY()).toEqual({ min: -5, max: 30 });
      dispose();
    });
  });

  it('honors per-chart link toggles and unlink', () => {
    createRoot((dispose) => {
      const group = createChartGroup();
      const a = fakeChart({ yMin: 0, yMax: 10, plotLeft: 40 });
      const b = fakeChart({ yMin: 5, yMax: 25, plotLeft: 64 });
      group.link(a.chart, { gutters: false });
      const unlinkB = group.link(b.chart, { gutters: false });

      // Y still shared, gutters left alone.
      expect(a.getY()).toEqual({ min: 0, max: 25 });
      expect(a.getPadding()).toBeUndefined();
      expect(b.getPadding()).toBeUndefined();

      // After unlinking b, its updates no longer coordinate a.
      unlinkB();
      b.chart.setAxis('y', { min: 0, max: 100 });
      b.fire();
      expect(a.getY()).toEqual({ min: 0, max: 25 }); // unchanged
      dispose();
    });
  });
});
