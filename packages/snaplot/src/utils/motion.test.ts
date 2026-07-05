import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Each case re-imports the module so the module-level cache starts empty;
 * `prefersReducedMotion` caches its first result for the process lifetime.
 */
async function freshImport() {
  vi.resetModules();
  return import('./motion');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('prefersReducedMotion', () => {
  it('returns false when there is no window (SSR)', async () => {
    vi.stubGlobal('window', undefined);
    const { prefersReducedMotion } = await freshImport();
    expect(prefersReducedMotion()).toBe(false);
  });

  it('reflects a reduce preference and caches without re-querying matchMedia', async () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn() });
    vi.stubGlobal('window', { matchMedia });
    const { prefersReducedMotion } = await freshImport();

    expect(prefersReducedMotion()).toBe(true);
    expect(prefersReducedMotion()).toBe(true);
    // Second read comes from the cache, not a fresh media-query evaluation.
    expect(matchMedia).toHaveBeenCalledTimes(1);
  });

  it('updates the cache when the OS setting changes mid session', async () => {
    let handler: (e: { matches: boolean }) => void = () => {};
    const matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => {
        handler = fn;
      },
    });
    vi.stubGlobal('window', { matchMedia });
    const { prefersReducedMotion } = await freshImport();

    expect(prefersReducedMotion()).toBe(false);
    handler({ matches: true });
    expect(prefersReducedMotion()).toBe(true);
  });
});
