import { DirtyFlag } from '../spec';

/**
 * Batches all rendering into a single requestAnimationFrame per frame.
 * Multiple markDirty() calls within the same frame coalesce into one render pass.
 *
 * A fast mouse-move emitting 6 events between frames → one overlay redraw.
 */
export class RenderScheduler {
  private dirty: DirtyFlag = DirtyFlag.NONE;
  private rafId: number | null = null;
  private destroyed = false;
  /** Whether the chart is on screen: frames wait while it is not (plan D37). */
  private visible = true;

  constructor(private renderCallback: (flags: DirtyFlag) => void) {}

  /**
   * Mark one or more layers as needing redraw.
   * Schedules a rAF if one isn't already pending.
   */
  markDirty(flag: DirtyFlag): void {
    if (this.destroyed) return;
    this.dirty |= flag;
    // NONE is an empty mask, booking a frame for it would render nothing.
    if (this.dirty === DirtyFlag.NONE || !this.visible) return;
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        const flags = this.dirty;
        this.dirty = DirtyFlag.NONE;
        this.renderCallback(flags);
      });
    }
  }

  /**
   * Show or hide the chart. Hidden, dirty layers wait; shown again, they paint on the next frame.
   */
  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    if (visible) this.markDirty(DirtyFlag.NONE);
  }

  /** Force immediate synchronous render (for initial draw); an offscreen chart keeps it waiting. */
  flush(): void {
    if (!this.visible) return;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    const flags = this.dirty;
    this.dirty = DirtyFlag.NONE;
    if (flags !== DirtyFlag.NONE) {
      this.renderCallback(flags);
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

/**
 * Run `callback` on the next animation frame (or a microtask where there are no frames, as
 * during server rendering). Returns a cancel function.
 */
export function nextFrame(callback: () => void): () => void {
  if (typeof requestAnimationFrame !== 'function') {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) callback();
    });
    return () => {
      cancelled = true;
    };
  }
  const id = requestAnimationFrame(() => callback());
  return () => cancelAnimationFrame(id);
}

/**
 * A document-level resource shared by every chart: `start` creates it for the first listener and
 * its returned stop releases it after the last, so a page of charts installs one (plan
 * gap-scale-longevity-09). Returns the subscribe function, which returns the unsubscribe.
 */
export function shared(
  start: (notify: () => void) => () => void,
): (listener: () => void) => () => void {
  const listeners = new Set<() => void>();
  let stop: (() => void) | null = null;
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  return (listener) => {
    listeners.add(listener);
    stop ??= start(notify);
    return () => {
      if (listeners.delete(listener) && listeners.size === 0) {
        stop?.();
        stop = null;
      }
    };
  };
}

/**
 * Watch the document's theming context for `onChange`: an attribute change on `<html>` or
 * `<body>` (the `[data-theme]` and class patterns) or an OS colour-scheme change. A burst (class,
 * style and data-theme often flip together) coalesces into one call on the next task. One
 * observer and one media listener serve every chart on the page (D4). Returns the stop function.
 */
export const watchTheme = shared((notify) => {
  let queued = false;
  let stopped = false;
  const queue = () => {
    if (queued || stopped) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      if (!stopped) notify();
    }, 0);
  };
  let observer: MutationObserver | null = null;
  if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
    observer = new MutationObserver(queue);
    observer.observe(document.documentElement, { attributes: true });
    if (document.body) observer.observe(document.body, { attributes: true });
  }
  let scheme: MediaQueryList | null = null;
  if (typeof matchMedia !== 'undefined') {
    scheme = matchMedia('(prefers-color-scheme: dark)');
    scheme.addEventListener?.('change', queue);
  }
  return () => {
    stopped = true;
    observer?.disconnect();
    scheme?.removeEventListener?.('change', queue);
  };
});

/** The observer's margin: a chart this close to the viewport counts as visible. */
const VISIBILITY_MARGIN = 200;

/** Whether `element`'s box lies wholly outside the viewport and its margin (an empty box never). */
function outsideViewport(element: Element): boolean {
  if (typeof window === 'undefined') return false;
  const box = element.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return false;
  const m = VISIBILITY_MARGIN;
  return (
    box.bottom < -m ||
    box.top > window.innerHeight + m ||
    box.right < -m ||
    box.left > window.innerWidth + m
  );
}

/** Each observed element's visibility listeners. */
const visibilityListeners = new Map<Element, Set<(visible: boolean) => void>>();
let visibilityObserver: IntersectionObserver | null = null;

/**
 * Call `onChange` when `element` enters or leaves the viewport (with a margin, so a chart
 * scrolled toward is painted before it shows). One IntersectionObserver serves every chart.
 * Without IntersectionObserver the chart counts as always visible. Returns the stop function.
 */
export function watchVisibility(
  element: Element,
  onChange: (visible: boolean) => void,
): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => {};
  visibilityObserver ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        for (const listener of visibilityListeners.get(entry.target) ?? [])
          listener(entry.isIntersecting);
    },
    { rootMargin: `${VISIBILITY_MARGIN}px` },
  );
  const listeners = visibilityListeners.get(element) ?? new Set();
  if (listeners.size === 0) {
    visibilityListeners.set(element, listeners);
    visibilityObserver.observe(element);
  }
  listeners.add(onChange);
  // The observer's first report comes after the mount paint: a chart already far outside the
  // viewport waits from the start instead of painting once offscreen (mount-24-charts). Mount has
  // laid the page out, so reading the box costs no extra layout.
  if (outsideViewport(element)) onChange(false);
  return () => {
    listeners.delete(onChange);
    if (listeners.size > 0) return;
    visibilityListeners.delete(element);
    visibilityObserver?.unobserve(element);
    if (visibilityListeners.size === 0) {
      visibilityObserver?.disconnect();
      visibilityObserver = null;
    }
  };
}

/**
 * Call `onPrint` before the page prints. Printing snapshots without an animation frame, so every
 * chart paints synchronously then, offscreen or not. One listener serves every chart.
 */
export const watchPrint = shared((notify) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('beforeprint', notify);
  return () => window.removeEventListener('beforeprint', notify);
});

/**
 * Cached `prefers-reduced-motion` (tap feedback, the tooltip fade, touch momentum): the query is
 * made once and a change listener keeps the answer, so no hot path calls `matchMedia`.
 */
let reducedMotion: boolean | null = null;

export function prefersReducedMotion(): boolean {
  if (reducedMotion !== null) return reducedMotion;

  // SSR / non-DOM environments: default to allowing motion, matching how the
  // renderers behave when no OS hint is available.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    reducedMotion = false;
    return reducedMotion;
  }

  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  reducedMotion = mql.matches;
  // `addEventListener` over the deprecated `addListener`; older Safari lacks
  // it, hence the guard. The listener only ever writes the cache, so it costs
  // nothing until the user actually changes the setting.
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', (e) => {
      reducedMotion = e.matches;
    });
  }
  return reducedMotion;
}
