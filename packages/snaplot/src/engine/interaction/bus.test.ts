import { describe, expect, it, vi } from 'vitest';
import { EventBus } from './bus';

describe('EventBus.emit', () => {
  it('delivers to every handler even when one throws', () => {
    const bus = new EventBus();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const first = vi.fn(() => {
      throw new Error('boom');
    });
    const second = vi.fn();

    bus.on('action:reset-zoom', first);
    bus.on('action:reset-zoom', second);
    bus.emit('action:reset-zoom', undefined);

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('does not run handlers added during the same emit', () => {
    const bus = new EventBus();
    const added = vi.fn();
    const adder = vi.fn(() => {
      bus.on('action:reset-zoom', added);
    });

    bus.on('action:reset-zoom', adder);
    bus.emit('action:reset-zoom', undefined);

    expect(adder).toHaveBeenCalledOnce();
    expect(added).not.toHaveBeenCalled();
  });
});
