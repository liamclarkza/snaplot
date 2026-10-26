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

  constructor(private renderCallback: (flags: DirtyFlag) => void) {}

  /**
   * Mark one or more layers as needing redraw.
   * Schedules a rAF if one isn't already pending.
   */
  markDirty(flag: DirtyFlag): void {
    if (this.destroyed) return;
    this.dirty |= flag;
    // NONE is an empty mask, booking a frame for it would render nothing.
    if (this.dirty === DirtyFlag.NONE) return;
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        const flags = this.dirty;
        this.dirty = DirtyFlag.NONE;
        this.renderCallback(flags);
      });
    }
  }

  /** Force immediate synchronous render (for initial draw) */
  flush(): void {
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
 * Watch the document's theming context for `onChange`: an attribute change on `<html>` or
 * `<body>` (the `[data-theme]` and class patterns) or an OS colour-scheme change. A burst (class,
 * style and data-theme often flip together) coalesces into one call on the next task. Returns
 * the stop function. M11 makes this one coalesced observer per document (D4).
 */
export function watchTheme(onChange: () => void): () => void {
  let queued = false;
  let stopped = false;
  const queue = () => {
    if (queued || stopped) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      onChange();
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
}
