// Export conditions as bundlers and runtimes apply them (repo-07). snaplot/solid must pick the same
// side as solid-js/web under every condition set, or a bundle mixes a DOM-compiled component with
// the server runtime; the `solid` condition serves JSX that the app's own Solid compiler builds.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import solid from 'vite-plugin-solid';
import { describe, expect, it } from 'vitest';
import { consumerDir, packageDir, write } from './helpers/consumer.mjs';

const OPTIONS = `{ data: [{ x: 1, y: 2 }, { x: 2, y: 3 }], x: 'x', series: [{ y: 'y' }], ariaLabel: 'Edge chart' }`;

/** Resolves a specifier the way esbuild would for this platform and condition set. */
async function resolveWith(specifier, platform, conditions) {
  let resolved;
  await build({
    stdin: { contents: '', resolveDir: consumerDir },
    write: false,
    logLevel: 'silent',
    platform,
    conditions,
    plugins: [
      {
        name: 'probe',
        setup(b) {
          b.onStart(async () => {
            const result = await b.resolve(specifier, {
              kind: 'import-statement',
              resolveDir: consumerDir,
            });
            resolved = result.errors.length ? `error: ${result.errors[0].text}` : result.path;
          });
        },
      },
    ],
  });
  return resolved;
}

const SIDES = [
  ['browser', []],
  ['node', []],
  ['neutral', ['worker']],
  ['neutral', ['workerd', 'worker']],
  ['browser', ['worker']],
  ['browser', ['edge-light', 'worker']],
  ['neutral', ['deno']],
  ['node', ['browser']],
  ['neutral', ['browser', 'node']],
];

function side(path) {
  return /server/.test(path) ? 'server' : 'client';
}

describe('Solid export conditions', () => {
  it('[repo-07] snaplot/solid and solid-js/web pick the same side under every condition set', async () => {
    const rows = [];
    for (const [platform, conditions] of SIDES) {
      const snaplot = await resolveWith('snaplot/solid', platform, conditions);
      const solid = await resolveWith('solid-js/web', platform, conditions);
      rows.push({
        platform,
        conditions: conditions.join(','),
        snaplot: `${side(snaplot)} (${snaplot.slice(snaplot.lastIndexOf('/') + 1)})`,
        solid: side(solid),
      });
    }
    const mismatched = rows.filter((row) => !row.snaplot.startsWith(row.solid));
    expect(mismatched).toEqual([]);
  });

  it('[repo-07] a worker bundle (workerd, worker) server-renders snaplot/solid', async () => {
    write(
      'worker-entry.js',
      [
        "import { createComponent, renderToString } from 'solid-js/web';",
        "import { Chart } from 'snaplot/solid';",
        `export const render = () => renderToString(() => createComponent(Chart, ${OPTIONS}));`,
      ].join('\n'),
    );
    const outfile = join(consumerDir, 'worker-bundle.mjs');
    const result = await build({
      entryPoints: [join(consumerDir, 'worker-entry.js')],
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      mainFields: ['module', 'main'],
      conditions: ['workerd', 'worker'],
      outfile,
      logLevel: 'silent',
    }).catch((error) => error);
    expect(result.errors ?? []).toEqual([]);
    const { render } = await import(pathToFileURL(outfile).href);
    expect(render()).toMatch(/aria-label="Edge chart"/);
  });

  it('[repo-07] the solid condition serves JSX source', async () => {
    const path = await resolveWith('snaplot/solid', 'browser', ['solid']);
    expect(path).toBe(join(packageDir, 'dist/solid.jsx'));
  });

  it('[repo-07] vite-plugin-solid compiles that source for the server and the browser', async () => {
    write(
      'solid-app.jsx',
      [
        "import { renderToString } from 'solid-js/web';",
        "import { Chart } from 'snaplot/solid';",
        `export const render = () => renderToString(() => <Chart {...${OPTIONS}} />);`,
        `export const App = () => <Chart {...${OPTIONS}} />;`,
      ].join('\n'),
    );
    const resolvedFrom = new Set();
    const watch = {
      name: 'watch-snaplot',
      enforce: 'post',
      load(id) {
        if (id.includes('/node_modules/snaplot/'))
          resolvedFrom.add(id.slice(id.lastIndexOf('/') + 1));
      },
    };
    const common = { root: consumerDir, configFile: false, logLevel: 'silent' };
    await viteBuild({
      ...common,
      plugins: [solid({ ssr: true }), watch],
      build: { ssr: 'solid-app.jsx', outDir: 'solid-ssr', emptyOutDir: true },
    });
    await viteBuild({
      ...common,
      plugins: [solid(), watch],
      build: {
        outDir: 'solid-dom',
        emptyOutDir: true,
        lib: { entry: 'solid-app.jsx', formats: ['es'], fileName: 'app' },
        rollupOptions: { external: [/^solid-js/] },
      },
    });
    // The JSX source, never one of the precompiled builds.
    expect(resolvedFrom).toContain('solid.jsx');
    expect(resolvedFrom).not.toContain('solid.js');
    expect(resolvedFrom).not.toContain('solid.server.js');
    const { render } = await import(
      pathToFileURL(join(consumerDir, 'solid-ssr/solid-app.js')).href
    );
    expect(render()).toMatch(/aria-label="Edge chart"/);
  });
});
