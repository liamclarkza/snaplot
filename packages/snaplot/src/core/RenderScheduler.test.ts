import { afterEach, describe, expect, it, vi } from 'vitest';
import { RenderScheduler } from './RenderScheduler';
import { DirtyFlag } from '../types';

describe('RenderScheduler', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not schedule a frame for markDirty(NONE)', () => {
    const raf = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', raf);

    const scheduler = new RenderScheduler(vi.fn());
    scheduler.markDirty(DirtyFlag.NONE);

    expect(raf).not.toHaveBeenCalled();
  });

  it('schedules a single frame for a real dirty flag', () => {
    const raf = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', raf);

    const scheduler = new RenderScheduler(vi.fn());
    scheduler.markDirty(DirtyFlag.DATA);
    scheduler.markDirty(DirtyFlag.GRID);

    expect(raf).toHaveBeenCalledOnce();
  });

  it('is inert after destroy', () => {
    const raf = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const scheduler = new RenderScheduler(vi.fn());
    scheduler.destroy();
    scheduler.markDirty(DirtyFlag.DATA);

    expect(raf).not.toHaveBeenCalled();
  });
});
