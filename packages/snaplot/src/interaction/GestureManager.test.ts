import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../core/EventBus';
import { GestureManager } from './GestureManager';
import type { InteractionMode, Layout, PanConfig, TouchConfig, ZoomConfig } from '../types';

class FakeTarget {
  readonly style: Record<string, string> = {};
  readonly parentElement = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  private handlers = new Map<string, (event: Event) => void>();

  addEventListener(type: string, handler: EventListener): void {
    this.handlers.set(type, handler as (event: Event) => void);
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

  dispatch(type: string, event: Partial<PointerEvent>): PointerEvent {
    const dispatched = {
      button: 0,
      buttons: 0,
      clientX: 0,
      clientY: 0,
      pointerId: 1,
      pointerType: 'mouse',
      shiftKey: false,
      preventDefault: vi.fn(),
      ...event,
    } as PointerEvent;
    this.handlers.get(type)?.(dispatched as Event);
    return dispatched;
  }

  dispatchWheel(event: Partial<WheelEvent>): WheelEvent {
    const dispatched = {
      clientX: 0,
      clientY: 0,
      ctrlKey: false,
      metaKey: false,
      deltaY: 0,
      preventDefault: vi.fn(),
      ...event,
    } as WheelEvent;
    this.handlers.get('wheel')?.(dispatched as Event);
    return dispatched;
  }

  dispatchTouch(type: string, event: Partial<TouchEvent> = {}): TouchEvent {
    const dispatched = {
      preventDefault: vi.fn(),
      ...event,
    } as TouchEvent;
    this.handlers.get(type)?.(dispatched as Event);
    return dispatched;
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
const pan: PanConfig = { enabled: true, x: true, y: false };

function createGesture(
  mode: InteractionMode = 'analytical',
  options: { zoom?: ZoomConfig; pan?: PanConfig; touch?: TouchConfig } = {},
) {
  const target = new FakeTarget();
  const eventBus = new EventBus();
  const manager = new GestureManager(
    target as unknown as HTMLElement,
    eventBus,
    () => mode,
    () => layout,
    () => options.zoom ?? zoom,
    () => options.pan ?? pan,
    () => options.touch ?? {},
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

  it('moves the cursor instead of panning for one-finger touch drags by default', () => {
    const { target, eventBus, manager } = createGesture('timeseries');
    const cursor = vi.fn();
    const panMove = vi.fn();
    const boxEnd = vi.fn();
    eventBus.on('action:cursor', cursor);
    eventBus.on('action:pan', panMove);
    eventBus.on('action:box-end', boxEnd);

    target.dispatch('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointermove', { clientX: 140, clientY: 110, pointerType: 'touch' });
    target.dispatch('pointerup', { clientX: 140, clientY: 110, pointerType: 'touch' });

    expect(cursor).toHaveBeenLastCalledWith({ x: 140, y: 110, pointerType: 'touch' });
    expect(panMove).not.toHaveBeenCalled();
    expect(boxEnd).not.toHaveBeenCalled();
    manager.detach();
  });

  it('does not prevent default for readonly touch cursor input', () => {
    const { target, eventBus, manager } = createGesture('readonly');
    const cursor = vi.fn();
    eventBus.on('action:cursor', cursor);

    const down = target.dispatch('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' });
    const touchStart = target.dispatchTouch('touchstart');

    expect(cursor).toHaveBeenCalledWith({ x: 100, y: 100, pointerType: 'touch' });
    expect(down.preventDefault).not.toHaveBeenCalled();
    expect(touchStart.preventDefault).not.toHaveBeenCalled();
    manager.detach();
  });

  it('prevents native touch gestures on interactive plot input', () => {
    const { target, manager } = createGesture('analytical');

    const touchStart = target.dispatchTouch('touchstart');
    const touchMove = target.dispatchTouch('touchmove');

    expect(touchStart.preventDefault).toHaveBeenCalled();
    expect(touchMove.preventDefault).toHaveBeenCalled();
    manager.detach();
  });

  it('supports opt-in one-finger touch panning', () => {
    const { target, eventBus, manager } = createGesture('timeseries', { touch: { drag: 'pan' } });
    const panMove = vi.fn();
    eventBus.on('action:pan', panMove);

    target.dispatch('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointermove', { clientX: 140, clientY: 100, pointerType: 'touch' });

    expect(panMove).toHaveBeenCalledWith({ dx: 40, dy: 0, axis: undefined });
    manager.detach();
  });

  it.each([
    ['right', 140, 100, 40, 0],
    ['left', 60, 100, -40, 0],
    ['down', 100, 140, 0, 40],
    ['up', 100, 60, 0, -40],
  ])('pans instead of selecting when touch dragging %s', (_direction, moveX, moveY, dx, dy) => {
    const { target, eventBus, manager } = createGesture('analytical', {
      pan: { enabled: true, x: true, y: true },
      touch: { drag: 'pan', selectionGesture: 'double-tap-drag' },
    });
    const panMove = vi.fn();
    const boxStart = vi.fn();
    const boxEnd = vi.fn();
    eventBus.on('action:pan', panMove);
    eventBus.on('action:box-start', boxStart);
    eventBus.on('action:box-end', boxEnd);

    target.dispatch('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointermove', { clientX: moveX, clientY: moveY, pointerType: 'touch' });
    target.dispatch('pointerup', { clientX: moveX, clientY: moveY, pointerType: 'touch' });

    expect(panMove).toHaveBeenCalledWith({ dx, dy, axis: undefined });
    expect(boxStart).not.toHaveBeenCalled();
    expect(boxEnd).not.toHaveBeenCalled();
    manager.detach();
  });

  it('starts touch momentum only after a pan gesture', () => {
    const requestAnimationFrame = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
    const { target, manager } = createGesture('analytical', {
      pan: { enabled: true, x: true, y: true },
      touch: { drag: 'pan' },
    });

    target.dispatch('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointermove', { clientX: 140, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointerup', { clientX: 140, clientY: 100, pointerType: 'touch' });

    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    manager.detach();
    vi.unstubAllGlobals();
  });

  it('does not start touch momentum after cursor drag or selection', () => {
    const requestAnimationFrame = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
    const cursorGesture = createGesture('analytical');

    cursorGesture.target.dispatch('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' });
    cursorGesture.target.dispatch('pointermove', { clientX: 140, clientY: 100, pointerType: 'touch' });
    cursorGesture.target.dispatch('pointerup', { clientX: 140, clientY: 100, pointerType: 'touch' });
    cursorGesture.manager.detach();

    const selectionGesture = createGesture('analytical');
    selectionGesture.target.dispatch('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' });
    selectionGesture.target.dispatch('pointerup', { clientX: 100, clientY: 100, pointerType: 'touch' });
    selectionGesture.target.dispatch('pointerdown', { clientX: 102, clientY: 100, pointerType: 'touch' });
    selectionGesture.target.dispatch('pointermove', { clientX: 140, clientY: 100, pointerType: 'touch' });
    selectionGesture.target.dispatch('pointerup', { clientX: 140, clientY: 100, pointerType: 'touch' });
    selectionGesture.manager.detach();

    expect(requestAnimationFrame).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('keeps touch pan as pan after a prior tap unless selection is explicitly enabled', () => {
    const { target, eventBus, manager } = createGesture('analytical', {
      pan: { enabled: true, x: true, y: true },
      touch: { drag: 'pan' },
    });
    const panMove = vi.fn();
    const boxStart = vi.fn();
    const boxEnd = vi.fn();
    eventBus.on('action:pan', panMove);
    eventBus.on('action:box-start', boxStart);
    eventBus.on('action:box-end', boxEnd);

    target.dispatch('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointerup', { clientX: 100, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointerdown', { clientX: 102, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointermove', { clientX: 140, clientY: 125, pointerType: 'touch' });
    target.dispatch('pointerup', { clientX: 140, clientY: 125, pointerType: 'touch' });

    expect(panMove).toHaveBeenCalledWith({ dx: 38, dy: 25, axis: undefined });
    expect(boxStart).not.toHaveBeenCalled();
    expect(boxEnd).not.toHaveBeenCalled();
    manager.detach();
  });

  it('allows explicit double-tap-drag selection with touch panning enabled', () => {
    const { target, eventBus, manager } = createGesture('analytical', {
      pan: { enabled: true, x: true, y: true },
      touch: { drag: 'pan', selectionGesture: 'double-tap-drag' },
    });
    const panMove = vi.fn();
    const boxStart = vi.fn();
    const boxUpdate = vi.fn();
    eventBus.on('action:pan', panMove);
    eventBus.on('action:box-start', boxStart);
    eventBus.on('action:box-update', boxUpdate);

    target.dispatch('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointerup', { clientX: 100, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointerdown', { clientX: 102, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointermove', { clientX: 150, clientY: 130, pointerType: 'touch' });

    expect(boxStart).toHaveBeenCalledWith({ x: 102, y: 100 });
    expect(boxUpdate).toHaveBeenCalledWith({ x: 150, y: 130 });
    expect(panMove).not.toHaveBeenCalled();
    manager.detach();
  });

  it.each([
    ['right', 150, 100, 190, 100],
    ['left', 60, 100, 30, 100],
    ['down', 102, 140, 102, 180],
    ['up', 102, 60, 102, 30],
  ])('keeps explicit double-tap-drag selection updating while dragging %s', (_direction, firstX, firstY, secondX, secondY) => {
    const { target, eventBus, manager } = createGesture('analytical', {
      pan: { enabled: true, x: true, y: true },
      touch: { drag: 'pan', selectionGesture: 'double-tap-drag' },
    });
    const panMove = vi.fn();
    const boxStart = vi.fn();
    const boxUpdate = vi.fn();
    const boxEnd = vi.fn();
    eventBus.on('action:pan', panMove);
    eventBus.on('action:box-start', boxStart);
    eventBus.on('action:box-update', boxUpdate);
    eventBus.on('action:box-end', boxEnd);

    target.dispatch('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointerup', { clientX: 100, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointerdown', { clientX: 102, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointermove', { clientX: firstX, clientY: firstY, pointerType: 'touch' });
    target.dispatch('pointermove', { clientX: secondX, clientY: secondY, pointerType: 'touch' });
    target.dispatch('pointerup', { clientX: secondX, clientY: secondY, pointerType: 'touch' });

    expect(boxStart).toHaveBeenCalledWith({ x: 102, y: 100 });
    expect(boxUpdate).toHaveBeenLastCalledWith({ x: secondX, y: secondY });
    expect(boxEnd).toHaveBeenCalledWith({ x1: 102, y1: 100, x2: secondX, y2: secondY });
    expect(panMove).not.toHaveBeenCalled();
    manager.detach();
  });

  it('does not arm double-tap-drag selection after a distant prior tap', () => {
    const { target, eventBus, manager } = createGesture('analytical', {
      pan: { enabled: true, x: true, y: true },
      touch: { drag: 'pan', selectionGesture: 'double-tap-drag' },
    });
    const panMove = vi.fn();
    const boxStart = vi.fn();
    eventBus.on('action:pan', panMove);
    eventBus.on('action:box-start', boxStart);

    target.dispatch('pointerdown', { clientX: 50, clientY: 50, pointerType: 'touch' });
    target.dispatch('pointerup', { clientX: 50, clientY: 50, pointerType: 'touch' });
    target.dispatch('pointerdown', { clientX: 120, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointermove', { clientX: 160, clientY: 100, pointerType: 'touch' });

    expect(panMove).toHaveBeenCalledWith({ dx: 40, dy: 0, axis: undefined });
    expect(boxStart).not.toHaveBeenCalled();
    manager.detach();
  });

  it('does not arm double-tap-drag selection after an expired prior tap', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const { target, eventBus, manager } = createGesture('analytical', {
      pan: { enabled: true, x: true, y: true },
      touch: { drag: 'pan', selectionGesture: 'double-tap-drag' },
    });
    const panMove = vi.fn();
    const boxStart = vi.fn();
    eventBus.on('action:pan', panMove);
    eventBus.on('action:box-start', boxStart);

    target.dispatch('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointerup', { clientX: 100, clientY: 100, pointerType: 'touch' });
    vi.advanceTimersByTime(1000);
    target.dispatch('pointerdown', { clientX: 102, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointermove', { clientX: 140, clientY: 100, pointerType: 'touch' });

    expect(panMove).toHaveBeenCalledWith({ dx: 38, dy: 0, axis: undefined });
    expect(boxStart).not.toHaveBeenCalled();
    manager.detach();
    vi.useRealTimers();
  });

  it('uses double-tap and drag for touch selection', () => {
    const { target, eventBus, manager } = createGesture('analytical');
    const boxStart = vi.fn();
    const boxUpdate = vi.fn();
    eventBus.on('action:box-start', boxStart);
    eventBus.on('action:box-update', boxUpdate);

    target.dispatch('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointerup', { clientX: 100, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointerdown', { clientX: 102, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointermove', { clientX: 150, clientY: 130, pointerType: 'touch' });

    expect(boxStart).toHaveBeenCalledWith({ x: 102, y: 100 });
    expect(boxUpdate).toHaveBeenCalledWith({ x: 150, y: 130 });
    manager.detach();
  });

  it('continues updating touch selection after double-tap-drag starts', () => {
    const { target, eventBus, manager } = createGesture('analytical');
    const boxUpdate = vi.fn();
    const cursor = vi.fn();
    eventBus.on('action:box-update', boxUpdate);
    eventBus.on('action:cursor', cursor);

    target.dispatch('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointerup', { clientX: 100, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointerdown', { clientX: 102, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointermove', { clientX: 140, clientY: 120, pointerType: 'touch' });
    target.dispatch('pointermove', { clientX: 190, clientY: 160, pointerType: 'touch' });

    expect(boxUpdate).toHaveBeenLastCalledWith({ x: 190, y: 160 });
    expect(cursor).not.toHaveBeenLastCalledWith({ x: 190, y: 160, pointerType: 'touch' });
    manager.detach();
  });

  it('uses double-tap without drag for touch reset and suppresses browser zoom', () => {
    const { target, eventBus, manager } = createGesture('analytical');
    const reset = vi.fn();
    eventBus.on('action:reset-zoom', reset);

    target.dispatch('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointerup', { clientX: 100, clientY: 100, pointerType: 'touch' });
    const secondDown = target.dispatch('pointerdown', { clientX: 101, clientY: 100, pointerType: 'touch' });
    const secondUp = target.dispatch('pointerup', { clientX: 101, clientY: 100, pointerType: 'touch' });

    expect(reset).toHaveBeenCalledOnce();
    expect(secondDown.preventDefault).toHaveBeenCalled();
    expect(secondUp.preventDefault).toHaveBeenCalled();
    manager.detach();
  });

  it('does not turn long-press into selection by default', () => {
    vi.useFakeTimers();
    const { target, eventBus, manager } = createGesture('analytical');
    const boxStart = vi.fn();
    const cursor = vi.fn();
    eventBus.on('action:box-start', boxStart);
    eventBus.on('action:cursor', cursor);

    target.dispatch('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' });
    vi.advanceTimersByTime(1000);
    target.dispatch('pointermove', { clientX: 130, clientY: 100, pointerType: 'touch' });

    expect(boxStart).not.toHaveBeenCalled();
    expect(cursor).toHaveBeenLastCalledWith({ x: 130, y: 100, pointerType: 'touch' });
    manager.detach();
    vi.useRealTimers();
  });

  it('uses long-press selection only when explicitly configured', () => {
    vi.useFakeTimers();
    const { target, eventBus, manager } = createGesture('analytical', {
      touch: { selectionGesture: 'long-press' },
    });
    const boxStart = vi.fn();
    const boxUpdate = vi.fn();
    eventBus.on('action:box-start', boxStart);
    eventBus.on('action:box-update', boxUpdate);

    target.dispatch('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' });
    vi.advanceTimersByTime(1000);
    target.dispatch('pointermove', { clientX: 140, clientY: 100, pointerType: 'touch' });

    expect(boxStart).toHaveBeenCalledWith({ x: 100, y: 100 });
    expect(boxUpdate).toHaveBeenCalledWith({ x: 140, y: 100 });
    manager.detach();
    vi.useRealTimers();
  });

  it('pinches both axes by default when x and y zoom are enabled', () => {
    const { target, eventBus, manager } = createGesture('analytical', {
      zoom: { enabled: true, x: true, y: true },
    });
    const zoomMove = vi.fn();
    eventBus.on('action:zoom', zoomMove);

    target.dispatch('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointerdown', { pointerId: 2, clientX: 200, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointermove', { pointerId: 2, clientX: 220, clientY: 100, pointerType: 'touch' });

    expect(zoomMove).toHaveBeenCalledWith(expect.objectContaining({ axis: 'xy' }));
    manager.detach();
  });

  it('supports opt-in axis-locked touch pinch', () => {
    const { target, eventBus, manager } = createGesture('analytical', {
      zoom: { enabled: true, x: true, y: true, pinchMode: 'axis-lock' },
    });
    const zoomMove = vi.fn();
    eventBus.on('action:zoom', zoomMove);

    target.dispatch('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointerdown', { pointerId: 2, clientX: 200, clientY: 100, pointerType: 'touch' });
    target.dispatch('pointermove', { pointerId: 2, clientX: 220, clientY: 100, pointerType: 'touch' });

    expect(zoomMove).toHaveBeenCalledWith(expect.objectContaining({ axis: 'x' }));
    manager.detach();
  });

  it('ignores axis drag unless axis panning is enabled', () => {
    const axisLayout: Layout = {
      ...layout,
      axes: {
        x: {
          position: 'bottom',
          area: { left: 40, top: 240, width: 320, height: 40 },
        },
      },
    };
    const target = new FakeTarget();
    const eventBus = new EventBus();
    const manager = new GestureManager(
      target as unknown as HTMLElement,
      eventBus,
      () => 'timeseries',
      () => axisLayout,
      () => zoom,
      () => pan,
      () => ({}),
    );
    const panMove = vi.fn();
    eventBus.on('action:pan', panMove);
    manager.attach();

    const down = target.dispatch('pointerdown', { clientX: 100, clientY: 250, pointerType: 'touch' });
    target.dispatch('pointermove', { clientX: 140, clientY: 250 });

    expect(panMove).not.toHaveBeenCalled();
    expect(down.preventDefault).not.toHaveBeenCalled();
    manager.detach();
  });

  it('keeps axis touch input inert when only axis zooming is enabled', () => {
    const axisLayout: Layout = {
      ...layout,
      axes: {
        x: {
          position: 'bottom',
          area: { left: 40, top: 240, width: 320, height: 40 },
        },
      },
    };
    const target = new FakeTarget();
    const eventBus = new EventBus();
    const manager = new GestureManager(
      target as unknown as HTMLElement,
      eventBus,
      () => 'timeseries',
      () => axisLayout,
      () => ({ enabled: true, x: true, y: false, axis: true }),
      () => pan,
      () => ({ drag: 'pan' }),
    );
    const panMove = vi.fn();
    const cursor = vi.fn();
    eventBus.on('action:pan', panMove);
    eventBus.on('action:cursor', cursor);
    manager.attach();

    const down = target.dispatch('pointerdown', { clientX: 100, clientY: 250, pointerType: 'touch' });
    target.dispatch('pointermove', { clientX: 140, clientY: 250, pointerType: 'touch' });

    expect(panMove).not.toHaveBeenCalled();
    expect(cursor).not.toHaveBeenCalled();
    expect(down.preventDefault).not.toHaveBeenCalled();
    manager.detach();
  });

  it('ignores axis pinch wheel unless axis zooming is enabled', () => {
    const axisLayout: Layout = {
      ...layout,
      axes: {
        x: {
          position: 'bottom',
          area: { left: 40, top: 240, width: 320, height: 40 },
        },
      },
    };
    const target = new FakeTarget();
    const eventBus = new EventBus();
    const manager = new GestureManager(
      target as unknown as HTMLElement,
      eventBus,
      () => 'timeseries',
      () => axisLayout,
      () => ({ enabled: true, x: true, y: false }),
      () => pan,
      () => ({}),
    );
    const zoomMove = vi.fn();
    eventBus.on('action:zoom', zoomMove);
    manager.attach();

    target.dispatchWheel({ clientX: 100, clientY: 250, ctrlKey: true, deltaY: -10 });

    expect(zoomMove).not.toHaveBeenCalled();
    manager.detach();
  });

  it('supports opt-in axis pinch wheel zoom', () => {
    const axisLayout: Layout = {
      ...layout,
      axes: {
        x: {
          position: 'bottom',
          area: { left: 40, top: 240, width: 320, height: 40 },
        },
      },
    };
    const target = new FakeTarget();
    const eventBus = new EventBus();
    const manager = new GestureManager(
      target as unknown as HTMLElement,
      eventBus,
      () => 'timeseries',
      () => axisLayout,
      () => ({ enabled: true, x: true, y: false, axis: true }),
      () => pan,
      () => ({}),
    );
    const zoomMove = vi.fn();
    eventBus.on('action:zoom', zoomMove);
    manager.attach();

    target.dispatchWheel({ clientX: 100, clientY: 250, ctrlKey: true, deltaY: -10 });

    expect(zoomMove).toHaveBeenCalledWith(expect.objectContaining({ axis: 'x' }));
    manager.detach();
  });
});
