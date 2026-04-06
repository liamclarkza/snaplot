import { DirtyFlag } from '../types';

/**
 * Batches all rendering into a single requestAnimationFrame per frame.
 * Multiple markDirty() calls within the same frame coalesce into one render pass.
 *
 * A fast mouse-move emitting 6 events between frames → one overlay redraw.
 */
export class RenderScheduler {
  private dirty: DirtyFlag = DirtyFlag.NONE;
  private rafId: number | null = null;

  constructor(private renderCallback: (flags: DirtyFlag) => void) {}

  /**
   * Mark one or more layers as needing redraw.
   * Schedules a rAF if one isn't already pending.
   */
  markDirty(flag: DirtyFlag): void {
    this.dirty |= flag;
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
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
