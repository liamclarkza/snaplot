// The won't-do bundle part (plan §6): tree-shaking by mark type would need a
// registration ceremony, so a line-only consumer still carries the scatter
// colour encodings and the density path. The size budget (check:size) is
// enforced instead. Node environment: esbuild does not run under jsdom.
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

describe("won't do in this overhaul (plan §6): bundles", () => {
  it.fails('[gap-competitive-06:registry] a line-only consumer bundle carries no scatter encoding or density code', async () => {
    const entry = decodeURIComponent(new URL('../../src/index.ts', import.meta.url).pathname);
    const result = await build({
      stdin: {
        contents: `import { createChart } from ${JSON.stringify(entry)};
          createChart(document.body, { data: [{ t: 0, v: 1 }], x: 't', series: [{ y: 'v' }] });`,
        loader: 'ts',
        resolveDir: decodeURIComponent(new URL('.', import.meta.url).pathname),
      },
      bundle: true,
      minify: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      logLevel: 'silent',
    });
    const text = result.outputFiles[0].text;
    expect(['diverging', 'density'].filter((marker) => text.includes(marker))).toEqual([]);
  }, 30_000);
});
