/**
 * Computed-style stub: jsdom computes ordinary styles but does not inherit
 * custom properties the way a browser does. `set('--chart-text', '#123')`
 * makes `getComputedStyle(any).getPropertyValue('--chart-text')` return it;
 * every other read goes to jsdom.
 */

export interface StyleFake {
  set(name: string, value: string): void;
  clear(): void;
}

export function installComputedStyle(
  restorers: Array<() => void>,
  initial: Record<string, string> = {},
): StyleFake {
  const vars = new Map(Object.entries(initial));
  const original = window.getComputedStyle;
  window.getComputedStyle = ((element: Element, pseudo?: string | null) => {
    const style = original.call(window, element, pseudo);
    return new Proxy(style, {
      get(target, key) {
        if (key === 'getPropertyValue')
          return (name: string) => vars.get(name) ?? target.getPropertyValue(name);
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }) as typeof window.getComputedStyle;
  restorers.push(() => {
    window.getComputedStyle = original;
  });
  return {
    set(name, value) {
      vars.set(name, value);
    },
    clear() {
      vars.clear();
    },
  };
}
