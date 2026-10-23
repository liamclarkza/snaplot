/**
 * `matchMedia` and `devicePixelRatio` for jsdom, which has neither.
 *
 * Understood queries: `(resolution: Ndppx)`, `(prefers-color-scheme: dark|light)`
 * and `(prefers-reduced-motion: reduce)`; anything else never matches. Change
 * events fire synchronously from the control methods.
 */

export interface MediaFake {
  readonly devicePixelRatio: number;
  /** Change the DPR and fire `change` on every resolution query whose match flipped. */
  setDevicePixelRatio(dpr: number): void;
  /** Flip the colour scheme and fire `change` on the scheme queries. */
  setPrefersDark(dark: boolean): void;
  /**
   * Blink entering print media: every `(resolution: …)` query reports
   * `matches: false` and fires `change`, while `devicePixelRatio` is
   * unchanged (gap-environments-01).
   */
  beginPrint(): void;
  /** Leave print media: the resolution queries match the DPR again and fire `change`. */
  endPrint(): void;
  /** Live (listened-to or not) query lists, for assertions. */
  readonly queries: readonly FakeMediaQueryList[];
}

type Listener = (event: MediaQueryListEvent) => void;

export class FakeMediaQueryList {
  matches: boolean;
  onchange: Listener | null = null;
  private listeners = new Set<Listener>();
  constructor(
    readonly media: string,
    matches: boolean,
  ) {
    this.matches = matches;
  }
  addEventListener(type: string, listener: Listener) {
    if (type === 'change') this.listeners.add(listener);
  }
  removeEventListener(type: string, listener: Listener) {
    if (type === 'change') this.listeners.delete(listener);
  }
  addListener(listener: Listener) {
    this.listeners.add(listener);
  }
  removeListener(listener: Listener) {
    this.listeners.delete(listener);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
  /** Set `matches` and notify (always, even if unchanged). */
  fire(matches: boolean): void {
    this.matches = matches;
    const event = { matches, media: this.media } as MediaQueryListEvent;
    this.onchange?.(event);
    for (const listener of [...this.listeners]) listener(event);
  }
}

export function installMedia(
  restorers: Array<() => void>,
  options: { devicePixelRatio?: number; prefersDark?: boolean; reducedMotion?: boolean } = {},
): MediaFake {
  let dpr = options.devicePixelRatio ?? 1;
  let dark = options.prefersDark ?? false;
  let printing = false;
  const queries: FakeMediaQueryList[] = [];

  const evaluate = (media: string): boolean => {
    const resolution = /\(\s*resolution:\s*([\d.]+)dppx\s*\)/.exec(media);
    if (resolution) return !printing && Number(resolution[1]) === dpr;
    if (/prefers-color-scheme:\s*dark/.test(media)) return dark;
    if (/prefers-color-scheme:\s*light/.test(media)) return !dark;
    if (/prefers-reduced-motion:\s*reduce/.test(media)) return options.reducedMotion ?? false;
    return false;
  };
  const matchMedia = (media: string) => {
    const list = new FakeMediaQueryList(media, evaluate(media));
    queries.push(list);
    return list as unknown as MediaQueryList;
  };
  const reevaluate = (filter: (media: string) => boolean) => {
    for (const list of [...queries]) {
      if (!filter(list.media)) continue;
      const next = evaluate(list.media);
      if (next !== list.matches) list.fire(next);
    }
  };
  const isResolution = (media: string) => media.includes('resolution');

  const define = (name: string, descriptor: PropertyDescriptor) => {
    const previous = Object.getOwnPropertyDescriptor(window, name);
    Object.defineProperty(window, name, { configurable: true, ...descriptor });
    restorers.push(() => {
      if (previous) Object.defineProperty(window, name, previous);
      else delete (window as unknown as Record<string, unknown>)[name];
    });
  };
  define('matchMedia', { writable: true, value: matchMedia });
  define('devicePixelRatio', { get: () => dpr });

  return {
    get devicePixelRatio() {
      return dpr;
    },
    setDevicePixelRatio(next) {
      dpr = next;
      reevaluate(isResolution);
    },
    setPrefersDark(next) {
      dark = next;
      reevaluate((media) => media.includes('prefers-color-scheme'));
    },
    beginPrint() {
      printing = true;
      for (const list of [...queries]) if (isResolution(list.media)) list.fire(false);
    },
    endPrint() {
      printing = false;
      reevaluate(isResolution);
    },
    queries,
  };
}
