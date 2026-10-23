// Main-thread busy-time instrumentation (gap-perf-gate-02).
//
// A chart does most of its work after the call under test returns: the paint runs in its own
// requestAnimationFrame callback, settle and theme refreshes run on timers, and resize and
// visibility work runs in observer callbacks. This module wraps those scheduling entry points so
// every callback the library schedules is timed, including the microtasks it queues. The bench
// adds that time to the synchronous cost of the operation, so a frame's busy time no longer
// depends on rAF quantisation or on the raster mode.
//
// It must be the first import of `main.ts`. ES modules evaluate in import order, so the library is
// evaluated after these wrappers are installed, even if it captures a reference at import time.
// The harness itself schedules through `native`, so its own callbacks are never counted.

type AnyFn = (...args: any[]) => unknown;

const w = window as unknown as Record<string, unknown>;

export const native = {
  raf: window.requestAnimationFrame.bind(window),
  setTimeout: window.setTimeout.bind(window),
  setInterval: window.setInterval.bind(window),
  clearTimeout: window.clearTimeout.bind(window),
  clearInterval: window.clearInterval.bind(window),
};

let libraryMs = 0;
let libraryCallbacks = 0;

function timed<F extends AnyFn>(fn: F): F {
  return function (this: unknown, ...args: unknown[]) {
    const t0 = performance.now();
    try {
      return fn.apply(this, args);
    } finally {
      const t1 = performance.now();
      libraryMs += t1 - t0;
      libraryCallbacks++;
      // Microtasks the callback queued run before this one (FIFO), so this adds their cost.
      queueMicrotask(() => {
        libraryMs += performance.now() - t1;
      });
    }
  } as F;
}

window.requestAnimationFrame = (callback: FrameRequestCallback): number =>
  native.raf(timed(callback));

window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
  typeof handler === 'function'
    ? native.setTimeout(timed(handler as AnyFn), timeout, ...args)
    : native.setTimeout(handler, timeout, ...args)) as typeof window.setTimeout;

window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
  typeof handler === 'function'
    ? native.setInterval(timed(handler as AnyFn), timeout, ...args)
    : native.setInterval(handler, timeout, ...args)) as typeof window.setInterval;

for (const name of ['ResizeObserver', 'IntersectionObserver', 'MutationObserver'] as const) {
  const Native = w[name] as (new (callback: AnyFn, options?: unknown) => object) | undefined;
  if (!Native) continue;
  w[name] = class extends Native {
    constructor(callback: AnyFn, options?: unknown) {
      super(timed(callback), options);
    }
  };
}

/** Milliseconds spent in library-scheduled callbacks (and their microtasks) since page load. */
export function libraryBusyMs(): number {
  return libraryMs;
}

/** Number of library-scheduled callbacks run since page load. */
export function libraryCallbackCount(): number {
  return libraryCallbacks;
}
