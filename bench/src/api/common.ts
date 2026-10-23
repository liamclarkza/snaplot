// Helpers the adapters share: the untyped debug symbol (plan D31) and loose module access.

import type { DebugCounts, Renders } from './types';

export type Loose = any;

const DEBUG = Symbol.for('snaplot.debug');

/** The debug snapshot on a public handle, or `null` before `ovh-m1-done`. */
export function debugSnapshot(handle: unknown): DebugCounts | null {
  if (!handle || typeof handle !== 'object') return null;
  const snapshot = (handle as Record<symbol, DebugCounts | undefined>)[DEBUG];
  if (!snapshot) return null;
  return snapshot;
}

export function hasDebugSymbol(handle: unknown): boolean {
  return debugSnapshot(handle) !== null;
}

/** Render counts from the debug symbol, falling back to `getStats()`. */
export function renderCounts(handle: Loose): Renders {
  const snapshot = debugSnapshot(handle);
  const counts = snapshot?.renderCount ?? handle.getStats?.().renderCount;
  return counts
    ? { grid: counts.grid, data: counts.data, overlay: counts.overlay }
    : { grid: 0, data: 0, overlay: 0 };
}

/** Drops `undefined` values so each version sees only the options it is given. */
export function defined<T extends Record<string, unknown>>(options: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options)) if (value !== undefined) out[key] = value;
  return out as T;
}

/** A CommonJS package's exports, whether the bundler exposed them as named or as `default`. */
export function interop(namespace: Loose): Loose {
  return namespace && typeof namespace === 'object' && 'default' in namespace && namespace.default
    ? { ...namespace.default, ...namespace }
    : namespace;
}
