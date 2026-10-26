// Server rendering and hydration as frameworks do it: render on Node with the server conditions,
// then hydrate in a DOM from a browser bundle of the same app. Also checks that the core never
// loads a framework, and that one engine serves every entry under every condition: the adapters
// import 'snaplot' (frameworks-19, repo-15:ssr-dup).
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { consumerDir } from './helpers/consumer.mjs';
import { engineCopies, moduleGraph } from './helpers/graph.mjs';

const PROPS = {
  data: [
    { x: 1, y: 2 },
    { x: 2, y: 3 },
  ],
  x: 'x',
  series: [{ y: 'y' }],
  ariaLabel: 'SSR chart',
};

/** Collects console.error and console.warn output while `fn` runs. */
async function quietly(fn) {
  const messages = [];
  const { error, warn } = console;
  console.error = (...args) => messages.push(`error: ${args.join(' ')}`);
  console.warn = (...args) => messages.push(`warn: ${args.join(' ')}`);
  try {
    return { value: await fn(), messages };
  } finally {
    console.error = error;
    console.warn = warn;
  }
}

/** Bundles a client entry for the browser, as the app's bundler would. */
async function clientBundle(contents) {
  const result = await build({
    stdin: { contents, resolveDir: consumerDir, loader: 'js' },
    bundle: true,
    platform: 'browser',
    format: 'iife',
    write: false,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  return result.outputFiles[0].text;
}

/**
 * A DOM holding the server HTML, with the browser APIs jsdom lacks stubbed (canvas contexts,
 * ResizeObserver, matchMedia), so hydration can mount the chart.
 */
function domWith(html) {
  const messages = [];
  const virtualConsole = new VirtualConsole();
  for (const level of ['error', 'warn'])
    virtualConsole.on(level, (...args) => messages.push(`${level}: ${args.join(' ')}`));
  virtualConsole.on('jsdomError', (error) => messages.push(`jsdomError: ${error.message}`));
  const dom = new JSDOM(`<!doctype html><html><body><div id="app">${html}</div></body></html>`, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  dom.window.eval(`
    window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    const ctx = new Proxy({}, {
      get: (target, key) => key in target ? target[key]
        : key === 'measureText' ? () => ({ width: 10 })
        : typeof key === 'string' && /^[a-z]/.test(key) ? () => ({ addColorStop() {} })
        : undefined,
      set: (target, key, value) => { target[key] = value; return true; },
    });
    HTMLCanvasElement.prototype.getContext = () => ctx;
  `);
  return { dom, messages, host: dom.window.document.getElementById('app') };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

describe('server rendering and hydration', () => {
  it('React: renderToString, then hydrateRoot reuses the server markup', async () => {
    const { createElement } = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { Chart } = await import('snaplot/react');
    const server = await quietly(() => renderToString(createElement(Chart, PROPS)));
    expect(server.messages).toEqual([]);
    expect(server.value).toMatch(/aria-label="SSR chart"/);

    const { dom, messages, host } = domWith(server.value);
    const before = host.firstElementChild;
    dom.window.eval(
      await clientBundle(`
        import { createElement } from 'react';
        import { hydrateRoot } from 'react-dom/client';
        import { Chart } from 'snaplot/react';
        hydrateRoot(document.getElementById('app'), createElement(Chart, ${JSON.stringify(PROPS)}), {
          onRecoverableError: (error) => console.error('recoverable: ' + error),
        });
      `),
    );
    await settle();
    expect(messages).toEqual([]);
    expect(host.firstElementChild).toBe(before);
    expect(host.querySelectorAll('canvas').length).toBeGreaterThan(0);
    dom.window.close();
  });

  it('Solid: renderToString on the server build, then hydrate reuses the server markup', async () => {
    const { createComponent, generateHydrationScript, renderToString } = await import(
      'solid-js/web'
    );
    const { Chart } = await import('snaplot/solid');
    const server = await quietly(() => renderToString(() => createComponent(Chart, PROPS)));
    expect(server.messages).toEqual([]);
    expect(server.value).toMatch(/aria-label="SSR chart"/);

    const { dom, messages, host } = domWith(server.value);
    const before = host.firstElementChild;
    // The bootstrap script Solid prints into the page head: <script>…</script><!--xs-->.
    dom.window.eval(generateHydrationScript().match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]);
    dom.window.eval(
      await clientBundle(`
        import { createComponent, hydrate } from 'solid-js/web';
        import { Chart } from 'snaplot/solid';
        hydrate(() => createComponent(Chart, ${JSON.stringify(PROPS)}), document.getElementById('app'));
      `),
    );
    await settle();
    expect(messages).toEqual([]);
    expect(host.firstElementChild).toBe(before);
    expect(host.querySelectorAll('canvas').length).toBeGreaterThan(0);
    dom.window.close();
  });
});

describe('module graph', () => {
  it('the core never loads React or Solid', () => {
    for (const conditions of [['node', 'import'], ['browser', 'import'], ['import']]) {
      const { external } = moduleGraph(['snaplot'], conditions);
      expect([...external].filter((s) => /^(react|react-dom|solid-js)(\/|$)/.test(s))).toEqual([]);
    }
  });

  it('browser builds and the Solid JSX source share one engine with the core', () => {
    const entries = ['snaplot', 'snaplot/react', 'snaplot/solid'];
    for (const conditions of [
      ['browser', 'import'],
      ['solid', 'browser', 'import'],
      ['solid', 'node', 'import'],
    ]) {
      expect(engineCopies(moduleGraph(entries, conditions)), conditions.join(',')).toHaveLength(1);
    }
  });

  it('[frameworks-19][repo-15:ssr-dup] the Solid server build shares one engine with the core', () => {
    const entries = ['snaplot', 'snaplot/react', 'snaplot/solid'];
    for (const conditions of [
      ['node', 'import'],
      ['worker', 'import'],
    ]) {
      expect(engineCopies(moduleGraph(entries, conditions)), conditions.join(',')).toHaveLength(1);
    }
  });
});
