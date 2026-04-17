import type { Plugin, ChartInstance } from '../types';

/**
 * Manages plugin registration and lifecycle hook dispatch.
 *
 * before* hooks can return false to cancel the default behaviour.
 * Per spec §8.1: follows Chart.js model.
 */
export class PluginManager {
  private plugins: Plugin[] = [];

  register(plugin: Plugin): void {
    // Prevent duplicate registration
    if (this.plugins.some(p => p.id === plugin.id)) return;
    this.plugins.push(plugin);
  }

  unregister(id: string): void {
    this.plugins = this.plugins.filter(p => p.id !== id);
  }

  installAll(chart: ChartInstance): void {
    for (const plugin of this.plugins) {
      plugin.install?.(chart);
    }
  }

  /**
   * Dispatch a lifecycle hook to all plugins.
   * Returns false if any before* hook returns false (cancellation).
   */
  dispatch(
    hook: keyof Plugin,
    ...args: unknown[]
  ): boolean {
    for (const plugin of this.plugins) {
      const fn = plugin[hook];
      if (typeof fn === 'function') {
        // Each hook has its own signature, the dispatch is intentionally
        // variadic, so cast to a top-type callable to satisfy the compiler
        // without reaching for `any` or `Function`.
        const result = (fn as (...a: unknown[]) => unknown).apply(plugin, args);
        // before* hooks returning false cancel downstream processing
        if (hook.startsWith('before') && result === false) {
          return false;
        }
      }
    }
    return true;
  }

  destroyAll(chart: ChartInstance): void {
    for (const plugin of this.plugins) {
      plugin.destroy?.(chart);
    }
    this.plugins = [];
  }
}
