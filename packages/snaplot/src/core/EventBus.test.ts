import { describe, expect, it, vi } from 'vitest';
import { EventBus } from './EventBus';

describe('EventBus.emit', () => {
  it('delivers to every handler even when one throws', () => {
    const bus = new EventBus();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const first = vi.fn(() => {
      throw new Error('boom');
    });
    const second = vi.fn();

    bus.on('data:update', first);
    bus.on('data:update', second);
    bus.emit('data:update', undefined);

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('does not run handlers added during the same emit', () => {
    const bus = new EventBus();
    const added = vi.fn();
    const adder = vi.fn(() => {
      bus.on('data:update', added);
    });

    bus.on('data:update', adder);
    bus.emit('data:update', undefined);

    expect(adder).toHaveBeenCalledOnce();
    expect(added).not.toHaveBeenCalled();
  });
});
