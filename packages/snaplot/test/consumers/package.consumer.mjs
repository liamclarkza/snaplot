// What the tarball ships: the React entry's 'use client' directive (repo-08, research-06), lean
// sourcemaps (repo-15:maps), syntax within the D25 floor (gap-environments-08), the README and
// LICENSE (prepack) and nothing outside dist/.
import { transform } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { manifest, packageFile, packed } from './helpers/consumer.mjs';

const files = packed.files.map((file) => file.path);
const DIRECTIVE = /^\s*(['"])use client\1;?/;

describe('the packed files', () => {
  it("[repo-08][research-06] snaplot/react starts with 'use client'; no other module does", () => {
    expect(packageFile('dist/react.js')).toMatch(DIRECTIVE);
    const others = files.filter((file) => /\.(m?js|jsx)$/.test(file) && file !== 'dist/react.js');
    expect(others.filter((file) => DIRECTIVE.test(packageFile(file)))).toEqual([]);
  });

  it('[repo-15:maps] sourcemaps omit sourcesContent and no declaration maps ship', () => {
    expect(files.filter((file) => file.endsWith('.d.ts.map'))).toEqual([]);
    const maps = files.filter((file) => file.endsWith('.map'));
    expect(maps.length).toBeGreaterThan(0);
    const withSources = maps.filter((file) => JSON.parse(packageFile(file)).sourcesContent);
    expect(withSources).toEqual([]);
  });

  it('ships dist/, the manifest, README and LICENSE, and nothing else', () => {
    const top = ['LICENSE', 'README.md', 'package.json'];
    expect(files.filter((file) => !file.startsWith('dist/') && !top.includes(file))).toEqual([]);
    expect(files).toEqual(expect.arrayContaining(top));
  });

  it('declares the Node floor that require(esm) needs', () => {
    expect(manifest.engines.node).toBe('>=22.12');
  });

  it('[gap-environments-08] the JavaScript needs no syntax newer than ES2022 (D25)', async () => {
    // esbuild lowers anything newer than the target, so ES2022 code comes out unchanged.
    const lowered = [];
    for (const file of files.filter((f) => /\.(js|jsx)$/.test(f))) {
      const code = packageFile(file);
      const loader = file.endsWith('.jsx') ? 'jsx' : 'js';
      const as = async (target) =>
        (await transform(code, { loader, target, format: 'esm', jsx: 'preserve' })).code;
      if ((await as('es2022')) !== (await as('esnext'))) lowered.push(file);
    }
    expect(lowered).toEqual([]);
  });
});
