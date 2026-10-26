// @vitest-environment jsdom
// An app's component tests render charts in jsdom, which has no canvas context and no
// ResizeObserver (repo-04, fixed by M11's jsdom no-op). The stubbed runs are controls: they show
// the harness mounts charts, so the expected failures fail for the missing APIs only.
import { createElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createChart } from 'snaplot';
import { Chart } from 'snaplot/react';
import { afterEach, describe, expect, it } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const PROPS = { data: [{ x: 1, y: 2 }], x: 'x', series: [{ y: 'y' }], ariaLabel: 'jsdom chart' };
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

function host() {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
}

function vanilla() {
  const chart = createChart(host(), PROPS);
  chart.destroy();
}

async function react() {
  const element = host();
  const root = createRoot(element);
  await act(async () => root.render(createElement(Chart, PROPS)));
  expect(element.querySelector('[aria-label="jsdom chart"]')).not.toBeNull();
  await act(async () => root.unmount());
}

describe('rendering in jsdom', () => {
  it('vanilla createChart mounts with canvas and ResizeObserver stubbed', () => {
    stubBrowserApis();
    vanilla();
  });
  it('React <Chart> mounts with canvas and ResizeObserver stubbed', async () => {
    stubBrowserApis();
    await react();
  });
  it('[repo-04] vanilla createChart mounts in plain jsdom', () => vanilla());
  it('[repo-04] React <Chart> mounts in plain jsdom', () => react());
});
