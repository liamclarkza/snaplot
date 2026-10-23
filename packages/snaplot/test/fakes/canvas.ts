/**
 * Canvas 2D recorder for jsdom, which has no 2D context.
 *
 * Every canvas gets a recording context. The recorder also models the one
 * bitmap rule the lifecycle tests depend on: assigning `width` or `height`
 * resets the backing store, even when the value is unchanged (HTML spec), so
 * a reset canvas shows nothing until something draws into it again. An
 * opaque (`alpha: false`) canvas shows black in that state.
 */

export interface RecordedCall {
  name: string;
  args: unknown[];
}

export interface CanvasRecord {
  readonly canvas: HTMLCanvasElement;
  /** Options passed to the first `getContext('2d', options)` call. */
  contextOptions: CanvasRenderingContext2DSettings | undefined;
  /** Context method calls, in order, since install. */
  readonly calls: RecordedCall[];
  /** Backing-store resets: one per `width` or `height` assignment. */
  resets: number;
  /** Drawing calls (fills, strokes, images, text) since the last reset or `clearRect`. */
  inkSinceClear: number;
}

export interface CanvasFake {
  /** The record for a canvas (created on first touch). */
  of(canvas: HTMLCanvasElement): CanvasRecord;
  /** Every canvas the recorder has seen, in creation order. */
  readonly all: readonly CanvasRecord[];
}

const INK = new Set([
  'fill',
  'stroke',
  'fillRect',
  'strokeRect',
  'fillText',
  'strokeText',
  'drawImage',
  'putImageData',
]);

const paintStub = () => ({ addColorStop() {} });

export function installCanvas(restorers: Array<() => void>): CanvasFake {
  const records = new WeakMap<HTMLCanvasElement, CanvasRecord>();
  const all: CanvasRecord[] = [];
  const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();

  const of = (canvas: HTMLCanvasElement): CanvasRecord => {
    let record = records.get(canvas);
    if (!record) {
      record = { canvas, contextOptions: undefined, calls: [], resets: 0, inkSinceClear: 0 };
      records.set(canvas, record);
      all.push(record);
    }
    return record;
  };

  const createContext = (canvas: HTMLCanvasElement): CanvasRenderingContext2D => {
    const record = of(canvas);
    const state: Record<string | symbol, unknown> = {
      canvas,
      fillStyle: '#000000',
      strokeStyle: '#000000',
      globalAlpha: 1,
      lineWidth: 1,
      font: '10px sans-serif',
    };
    const methods: Record<string, (...args: any[]) => unknown> = {
      measureText: (text: string) => ({
        width: String(text).length * 7,
        actualBoundingBoxAscent: 8,
        actualBoundingBoxDescent: 2,
        fontBoundingBoxAscent: 9,
        fontBoundingBoxDescent: 3,
      }),
      createLinearGradient: paintStub,
      createRadialGradient: paintStub,
      createConicGradient: paintStub,
      createPattern: paintStub,
      getLineDash: () => [],
      isPointInPath: () => false,
      isPointInStroke: () => false,
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(Math.max(0, w * h * 4)),
      }),
      getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    };
    return new Proxy(state, {
      get(target, key) {
        if (key in target) return target[key];
        if (typeof key !== 'string') return undefined;
        return (...args: unknown[]) => {
          record.calls.push({ name: key, args });
          if (key === 'clearRect') record.inkSinceClear = 0;
          else if (INK.has(key)) record.inkSinceClear++;
          return methods[key]?.(...args);
        };
      },
      set(target, key, value) {
        target[key] = value;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
  };

  const proto = HTMLCanvasElement.prototype;
  const originalGetContext = Object.getOwnPropertyDescriptor(proto, 'getContext')!;
  Object.defineProperty(proto, 'getContext', {
    configurable: true,
    writable: true,
    value(this: HTMLCanvasElement, type: string, options?: CanvasRenderingContext2DSettings) {
      if (type !== '2d') return null;
      let context = contexts.get(this);
      if (!context) {
        of(this).contextOptions = options;
        context = createContext(this);
        contexts.set(this, context);
      }
      return context;
    },
  });
  restorers.push(() => Object.defineProperty(proto, 'getContext', originalGetContext));

  for (const prop of ['width', 'height'] as const) {
    const original = Object.getOwnPropertyDescriptor(proto, prop)!;
    Object.defineProperty(proto, prop, {
      configurable: true,
      enumerable: original.enumerable,
      get(this: HTMLCanvasElement) {
        return original.get!.call(this);
      },
      set(this: HTMLCanvasElement, value: number) {
        original.set!.call(this, value);
        const record = of(this);
        record.resets++;
        record.inkSinceClear = 0;
      },
    });
    restorers.push(() => Object.defineProperty(proto, prop, original));
  }

  return { of, all };
}
