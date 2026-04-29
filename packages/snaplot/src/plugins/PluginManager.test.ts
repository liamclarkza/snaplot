import { describe, expect, it, vi } from 'vitest';
import { PluginManager } from './PluginManager';
import type { ChartInstance, Plugin } from '../types';

describe('PluginManager', () => {
  it('cancels before* hooks when a plugin returns false', () => {
    const manager = new PluginManager();
    const after = vi.fn();
    const plugins: Plugin[] = [
      { id: 'cancel', beforeDrawData: () => false },
      { id: 'after', beforeDrawData: after },
    ];

    for (const plugin of plugins) manager.register(plugin);

    const result = manager.dispatch(
      'beforeDrawData',
      {} as ChartInstance,
      {} as CanvasRenderingContext2D,
    );

    expect(result).toBe(false);
    expect(after).not.toHaveBeenCalled();
  });

  it('continues before* hooks when plugins return true or void', () => {
    const manager = new PluginManager();
    const second = vi.fn();
    const plugins: Plugin[] = [
      { id: 'first', beforeDrawData: () => true },
      { id: 'second', beforeDrawData: second },
    ];

    for (const plugin of plugins) manager.register(plugin);

    const result = manager.dispatch(
      'beforeDrawData',
      {} as ChartInstance,
      {} as CanvasRenderingContext2D,
    );

    expect(result).toBe(true);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
