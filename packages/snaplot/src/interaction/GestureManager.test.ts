import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../core/EventBus';
import { GestureManager } from './GestureManager';
import type { InteractionMode, Layout, ZoomConfig } from '../types';

class FakeTarget {
  readonly style: Record<string, string> = {};
  readonly parentElement = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  private handlers = new Map<string, (event: PointerEvent) => void>();

  addEventListener(type: string, handler: EventListener): void {
    this.handlers.set(type, handler as (event: PointerEvent) => void);
  }

  removeEventListener(type: string): void {
    this.handlers.delete(type);
  }

  setPointerCapture(): void {}
  releasePointerCapture(): void {}

  getBoundingClientRect(): DOMRect {
    return {
      left: 0,
      top: 0,
      right: 400,
      bottom: 300,
      width: 400,
      height: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  }

  dispatch(type: string, event: Partial<PointerEvent>): void {
    this.handlers.get(type)?.({
      button: 0,
      buttons: 0,
      clientX: 0,
      clientY: 0,
      pointerId: 1,
      pointerType: 'mouse',
      shiftKey: false,
      preventDefault: vi.fn(),
      ...event,
    } as PointerEvent);
  }
}

const layout: Layout = {
  width: 400,
  height: 300,
  plot: { left: 40, top: 20, width: 320, height: 220 },
  axes: {},
  dpr: 1,
};

const zoom: ZoomConfig = { enabled: true, x: true, y: false };

function createGesture(mode: InteractionMode = 'analytical') {
  const target = new FakeTarget();
  const eventBus = new EventBus();
  const manager = new GestureManager(
    target as unknown as HTMLElement,
    eventBus,
    () => mode,
    () => layout,
    () => zoom,
  );
  manager.attach();
  return { target, eventBus, manager };
}

describe('GestureManager cursor emission', () => {
  it('emits hover cursor moves when no pointer is pressed', () => {
    const { target, eventBus, manager } = createGesture();
    const cursor = vi.fn();
    eventBus.on('action:cursor', cursor);

    target.dispatch('pointermove', { clientX: 100, clientY: 100 });

    expect(cursor).toHaveBeenCalledWith({ x: 100, y: 100, pointerType: 'mouse' });
    manager.detach();
  });

  it('does not publish interim cursor moves before a box selection starts', () => {
    const { target, eventBus, manager } = createGesture();
    const cursor = vi.fn();
    const boxStart = vi.fn();
    const boxUpdate = vi.fn();
    eventBus.on('action:cursor', cursor);
    eventBus.on('action:box-start', boxStart);
    eventBus.on('action:box-update', boxUpdate);

    target.dispatch('pointerdown', { clientX: 100, clientY: 100 });
    target.dispatch('pointermove', { clientX: 130, clientY: 100 });

    expect(cursor).not.toHaveBeenCalled();
    expect(boxStart).toHaveBeenCalledWith({ x: 100, y: 100 });
    expect(boxUpdate).toHaveBeenCalledWith({ x: 130, y: 100 });
    manager.detach();
  });
});
