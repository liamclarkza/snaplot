/**
 * Element sizes for jsdom, which does no layout.
 *
 * `setSize(el, w, h)` gives an element a CSS box. An element without a size
 * whose inline style is `width: 100%` (or `height: 100%`) takes its parent's
 * size on that axis, which is how the chart's own container fills its host.
 * Every box sits at the viewport origin, so client coordinates equal local
 * ones.
 */

export interface LayoutFake {
  setSize(element: Element, width: number, height: number): void;
  /** The modelled CSS box of an element (0 × 0 when it has none). */
  sizeOf(element: Element): { width: number; height: number };
}

export function installLayout(restorers: Array<() => void>): LayoutFake {
  const sizes = new WeakMap<Element, { width: number; height: number }>();

  const axis = (element: Element | null, key: 'width' | 'height'): number => {
    if (!element) return 0;
    const own = sizes.get(element);
    if (own) return own[key];
    const style = (element as HTMLElement).style;
    if (style?.[key] === '100%') return axis(element.parentElement, key);
    return 0;
  };
  const sizeOf = (element: Element) => ({
    width: axis(element, 'width'),
    height: axis(element, 'height'),
  });

  const proto = Element.prototype;
  const patched = {
    clientWidth: {
      get(this: Element) {
        return Math.floor(axis(this, 'width'));
      },
    },
    clientHeight: {
      get(this: Element) {
        return Math.floor(axis(this, 'height'));
      },
    },
    getBoundingClientRect: {
      value(this: Element) {
        const { width, height } = sizeOf(this);
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          width,
          height,
          right: width,
          bottom: height,
          toJSON() {
            return this;
          },
        } as DOMRect;
      },
    },
  };
  for (const [name, descriptor] of Object.entries(patched)) {
    const original = Object.getOwnPropertyDescriptor(proto, name);
    Object.defineProperty(proto, name, { configurable: true, ...descriptor });
    restorers.push(() => {
      if (original) Object.defineProperty(proto, name, original);
      else delete (proto as unknown as Record<string, unknown>)[name];
    });
  }

  return {
    setSize(element, width, height) {
      sizes.set(element, { width, height });
    },
    sizeOf,
  };
}
