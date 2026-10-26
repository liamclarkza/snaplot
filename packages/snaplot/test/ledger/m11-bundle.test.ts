// Known M11 bundling defects (plan §5.3 "delete the 12 themes", RC7), read from
// an esbuild bundle of a consumer that imports only `createChart`. Node
// environment: esbuild does not run under jsdom.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build, type Plugin } from 'esbuild';
import { describe, expect, it } from 'vitest';

/** Vite's `?inline` CSS imports, as text. */
const inlineCss: Plugin = {
  name: 'inline-css',
  setup(builder) {
    builder.onResolve({ filter: /\?inline$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path.replace(/\?inline$/, '')),
      namespace: 'inline-css',
    }));
    builder.onLoad({ filter: /.*/, namespace: 'inline-css' }, async (args) => ({
      contents: await readFile(args.path, 'utf8'),
      loader: 'text',
    }));
  },
};

describe('[arch-16] bundle contents', () => {
  it('[arch-16] a createChart-only bundle carries none of the non-default themes', async () => {
    const entry = decodeURIComponent(new URL('../../src/index.ts', import.meta.url).pathname);
    const result = await build({
      stdin: {
        contents: `export { createChart } from ${JSON.stringify(entry)};`,
        loader: 'ts',
        resolveDir: decodeURIComponent(new URL('.', import.meta.url).pathname),
      },
      bundle: true,
      minify: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      logLevel: 'silent',
      plugins: [inlineCss],
    });
    const text = result.outputFiles[0].text.toLowerCase();
    // One surface colour unique to each of six bundled non-default themes
    // (ocean, forest, sunset, violet, ivory, mint).
    const markers = ['#0b1a2b', '#0c1613', '#1a1220', '#100d1f', '#faf8f3', '#f3faf7'];
    expect(markers.filter((marker) => text.includes(marker))).toEqual([]);
  }, 30_000);
});
