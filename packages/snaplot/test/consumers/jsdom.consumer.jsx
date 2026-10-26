// A Solid app's component tests (vite-plugin-solid, jsdom): rendering <Chart> needs a canvas
// context and ResizeObserver, which jsdom lacks (repo-04, fixed by M11's jsdom no-op). The stubbed
// run is the control.
import { render } from 'solid-js/web';
import { Chart } from 'snaplot/solid';
import { afterEach, describe, expect, it } from 'vitest';

const getContext = HTMLCanvasElement.prototype.getContext;

function stubBrowserApis() {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  const ctx = new Proxy(
    {},
    {
      get: (target, key) =>
        key in target
          ? target[key]
          : key === 'measureText'
            ? () => ({ width: 10 })
            : typeof key === 'string' && /^[a-z]/.test(key)
              ? () => ({ addColorStop() {} })
              : undefined,
      set: (target, key, value) => {
        target[key] = value;
        return true;
      },
    },
  );
  HTMLCanvasElement.prototype.getContext = () => ctx;
}

afterEach(() => {
  delete globalThis.ResizeObserver;
  HTMLCanvasElement.prototype.getContext = getContext;
  document.body.replaceChildren();
});

function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const dispose = render(
    () => <Chart data={[{ x: 1, y: 2 }]} x="x" series={[{ y: 'y' }]} ariaLabel="jsdom chart" />,
    host,
  );
  expect(host.querySelector('[aria-label="jsdom chart"]')).not.toBeNull();
  expect(host.querySelectorAll('canvas').length).toBeGreaterThan(0);
  dispose();
}

describe('rendering Solid in jsdom', () => {
  it('<Chart> mounts with canvas and ResizeObserver stubbed', () => {
    stubBrowserApis();
    mount();
  });
  it('[repo-04] <Chart> mounts in plain jsdom', () => mount());
});
