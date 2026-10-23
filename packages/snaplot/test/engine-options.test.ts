// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plugin } from '../src/types';
import { type EngineFakes, f, inputLayer, installEngineFakes } from './fakes/engine';

// Ported from src/core/Chart.append.test.ts (plan M2).

let fakes: EngineFakes;
beforeEach(() => {
  fakes = installEngineFakes();
});
afterEach(() => fakes.uninstall());

describe('engine runtime options', () => {
  it('exposes resolved geometry-aware legend items', () => {
    const chart = fakes.engine(
      {
        axes: { x: { type: 'linear' }, y: { type: 'linear' } },
        series: [
          {
            label: 'Forecast',
            type: 'band',
            dataIndex: 1,
            upperDataIndex: 2,
            lowerDataIndex: 3,
            stroke: '#f90',
            lineDash: [4, 2],
          },
          { label: 'Observed', type: 'line', dataIndex: 1, visible: false },
        ],
      },
      [f([0, 1]), f([2, 3]), f([3, 4]), f([1, 2])],
    );

    expect(chart.getLegendItems()).toMatchObject([
      {
        label: 'Forecast',
        type: 'band',
        color: '#f90',
        fill: '#f90',
        lineDash: [4, 2],
        visible: true,
      },
      { label: 'Observed', type: 'line', fill: null, visible: false },
    ]);
  });

  it('replaces series arrays instead of retaining stale entries', () => {
    const chart = fakes.engine(
      {
        series: [
          { label: 'loss', dataIndex: 1 },
          { label: 'accuracy', dataIndex: 2 },
        ],
      },
      [f([1, 2]), f([10, 20]), f([0.5, 0.6])],
    );

    chart.setOptions({ series: [{ label: 'loss only', dataIndex: 1 }] });

    expect(chart.getOptions().series).toEqual([{ label: 'loss only', dataIndex: 1 }]);
  });

  it('replaceOptions drops config keys omitted from the next declarative config', () => {
    const chart = fakes.engine(
      {
        axes: { y2: { position: 'right', type: 'linear' } },
        cursor: { color: '#ff0000' },
        series: [{ label: 'loss', dataIndex: 1, yAxisKey: 'y2' }],
      },
      [f([1, 2]), f([10, 20])],
    );

    chart.replaceOptions({ series: [{ label: 'loss', dataIndex: 1 }] });

    expect(chart.getOptions().axes?.y2).toBeUndefined();
    expect(chart.getAxis('y2')).toBeUndefined();
    expect(chart.getOptions().cursor?.color).toBeUndefined();
  });

  it('emits options:update after runtime config changes', () => {
    const chart = fakes.engine({ series: [{ label: 'value', dataIndex: 1 }] }, [
      f([1, 2]),
      f([10, 20]),
    ]);
    const seen: number[] = [];
    chart.on('options:update', (config) => seen.push(config.series.length));

    chart.setOptions({
      series: [
        { label: 'a', dataIndex: 1 },
        { label: 'b', dataIndex: 1 },
      ],
    });
    chart.replaceOptions({ series: [{ label: 'a', dataIndex: 1 }] });

    expect(seen).toEqual([2, 1]);
  });

  it('returns false when registering a duplicate plugin id at runtime', () => {
    const plugin: Plugin = { id: 'runtime-plugin', install: vi.fn() };
    const chart = fakes.engine({ series: [{ label: 'value', dataIndex: 1 }] }, [
      f([1, 2]),
      f([10, 20]),
    ]);

    expect(chart.use(plugin)).toBe(true);
    expect(chart.use({ id: 'runtime-plugin', install: vi.fn() })).toBe(false);
    expect(plugin.install).toHaveBeenCalledTimes(1);
  });

  it('limits the input layer to the plot area by default', () => {
    const chart = fakes.engine(
      {
        axes: { x: { type: 'linear' }, y: { type: 'linear' } },
        zoom: { enabled: true, x: true },
        pan: { enabled: true, x: true },
        series: [{ label: 'value', dataIndex: 1 }],
      },
      [f([0, 1]), f([10, 20])],
    );

    const { plot } = chart.getLayout();
    const layer = inputLayer(chart);

    expect(layer.style.left).toBe(`${plot.left}px`);
    expect(layer.style.top).toBe(`${plot.top}px`);
    expect(layer.style.width).toBe(`${plot.width}px`);
    expect(layer.style.height).toBe(`${plot.height}px`);
  });

  it('expands the input layer over axes only when axis controls are enabled', () => {
    const chart = fakes.engine(
      {
        axes: { x: { type: 'linear' }, y: { type: 'linear' } },
        zoom: { enabled: true, x: true },
        pan: { enabled: true, x: true },
        series: [{ label: 'value', dataIndex: 1 }],
      },
      [f([0, 1]), f([10, 20])],
    );

    chart.setOptions({ zoom: { axis: true } });

    const layout = chart.getLayout();
    const layer = inputLayer(chart);
    expect(layer.style.left).toBe('0px');
    expect(layer.style.top).toBe('0px');
    expect(layer.style.width).toBe(`${layout.width}px`);
    expect(layer.style.height).toBe(`${layout.height}px`);
  });

  it('lets explicit zoom and pan fields override interaction mode presets', () => {
    const chart = fakes.engine(
      {
        interaction: 'analytical',
        zoom: { enabled: false },
        pan: { y: false },
        series: [{ label: 'value', dataIndex: 1 }],
      },
      [f([1, 2]), f([10, 20])],
    );

    expect(chart.getOptions().zoom).toMatchObject({ enabled: false, x: true, y: true });
    expect(chart.getOptions().pan).toMatchObject({ enabled: true, x: true, y: false });
  });
});
