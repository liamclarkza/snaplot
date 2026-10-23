import type { LayoutFake } from './layout';

/**
 * ResizeObserver and IntersectionObserver fakes. Nothing is delivered on its
 * own: a test calls `deliver()` (or `resize()`), and callbacks run
 * synchronously, the way a browser runs them between rAF callbacks and paint.
 */

export interface ResizeObserverFake {
  /**
   * Deliver one round of entries for observed targets whose modelled size
   * changed since their last delivery. A target's first round always
   * delivers, like a browser's initial observation. Limit it to targets
   * inside `within` when given; `force` delivers unchanged sizes too.
   */
  deliver(within?: Element, options?: { force?: boolean }): number;
  /** Set `element`'s size, then deliver for the targets inside it. */
  resize(element: Element, width: number, height: number): number;
  /** Count of live observers. */
  readonly observerCount: number;
}

export interface IntersectionObserverFake {
  /** Report `target` as entering or leaving the viewport to every observer of it. */
  setIntersecting(target: Element, isIntersecting: boolean): void;
  readonly observerCount: number;
}

export function installResizeObserver(
  restorers: Array<() => void>,
  layout: LayoutFake,
): ResizeObserverFake {
  const observers = new Set<FakeResizeObserver>();

  class FakeResizeObserver {
    readonly targets = new Map<Element, { width: number; height: number } | undefined>();
    constructor(readonly callback: ResizeObserverCallback) {
      observers.add(this);
    }
    observe(target: Element) {
      if (!this.targets.has(target)) this.targets.set(target, undefined);
    }
    unobserve(target: Element) {
      this.targets.delete(target);
    }
    disconnect() {
      this.targets.clear();
      observers.delete(this);
    }
  }

  const previous = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: FakeResizeObserver,
  });
  restorers.push(() => {
    if (previous) Object.defineProperty(globalThis, 'ResizeObserver', previous);
    else delete (globalThis as Record<string, unknown>).ResizeObserver;
  });

  const deliver = (within?: Element, options: { force?: boolean } = {}): number => {
    let delivered = 0;
    for (const observer of [...observers]) {
      const entries: ResizeObserverEntry[] = [];
      for (const [target, last] of observer.targets) {
        if (within && within !== target && !within.contains(target)) continue;
        const size = layout.sizeOf(target);
        if (!options.force && last && last.width === size.width && last.height === size.height)
          continue;
        observer.targets.set(target, size);
        const box = [{ inlineSize: size.width, blockSize: size.height }];
        entries.push({
          target,
          contentRect: {
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            width: size.width,
            height: size.height,
            right: size.width,
            bottom: size.height,
            toJSON() {
              return this;
            },
          },
          borderBoxSize: box,
          contentBoxSize: box,
          devicePixelContentBoxSize: box,
        } as ResizeObserverEntry);
      }
      if (entries.length) {
        delivered += entries.length;
        observer.callback(entries, observer as unknown as ResizeObserver);
      }
    }
    return delivered;
  };

  return {
    deliver,
    resize(element, width, height) {
      layout.setSize(element, width, height);
      return deliver(element);
    },
    get observerCount() {
      return observers.size;
    },
  };
}

export function installIntersectionObserver(
  restorers: Array<() => void>,
): IntersectionObserverFake {
  const observers = new Set<FakeIntersectionObserver>();

  class FakeIntersectionObserver {
    readonly targets = new Set<Element>();
    readonly root = null;
    readonly rootMargin = '0px';
    readonly thresholds = [0];
    constructor(readonly callback: IntersectionObserverCallback) {
      observers.add(this);
    }
    observe(target: Element) {
      this.targets.add(target);
    }
    unobserve(target: Element) {
      this.targets.delete(target);
    }
    disconnect() {
      this.targets.clear();
      observers.delete(this);
    }
    takeRecords() {
      return [];
    }
  }

  const previous = Object.getOwnPropertyDescriptor(globalThis, 'IntersectionObserver');
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: FakeIntersectionObserver,
  });
  restorers.push(() => {
    if (previous) Object.defineProperty(globalThis, 'IntersectionObserver', previous);
    else delete (globalThis as Record<string, unknown>).IntersectionObserver;
  });

  return {
    setIntersecting(target, isIntersecting) {
      for (const observer of [...observers]) {
        if (!observer.targets.has(target)) continue;
        observer.callback(
          [{ target, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0 } as never],
          observer as unknown as IntersectionObserver,
        );
      }
    },
    get observerCount() {
      return observers.size;
    },
  };
}
