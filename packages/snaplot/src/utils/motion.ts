/**
 * Cached `prefers-reduced-motion` lookup. The visual layer must honor the
 * OS-level reduced-motion setting (tap-feedback ring, tooltip fade) without
 * calling `matchMedia` on the render or cursor hot path: `matchMedia` forces
 * the UA to evaluate a media query, and querying it per frame would show up
 * in the frame budget.
 *
 * The MediaQueryList is created once, its `.matches` value is cached, and a
 * change listener refreshes the cache when the user flips the OS setting mid
 * session. Callers read a plain boolean.
 */

let cached: boolean | null = null;

export function prefersReducedMotion(): boolean {
  if (cached !== null) return cached;

  // SSR / non-DOM environments: default to allowing motion, matching how the
  // renderers behave when no OS hint is available.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    cached = false;
    return cached;
  }

  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  cached = mql.matches;
  // `addEventListener` over the deprecated `addListener`; older Safari lacks
  // it, hence the guard. The listener only ever writes the cache, so it costs
  // nothing until the user actually changes the setting.
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', (e) => {
      cached = e.matches;
    });
  }
  return cached;
}
