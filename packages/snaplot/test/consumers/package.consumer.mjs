// What the tarball ships: the React entry's 'use client' directive (repo-08, research-06), lean
// sourcemaps (repo-15:maps), the README and LICENSE (prepack) and nothing outside dist/.
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
});
