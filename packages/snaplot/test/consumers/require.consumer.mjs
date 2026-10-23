// Loading every entry point from Node: ESM import, CommonJS require() through Node 22.12's
// require(esm) (D39: ESM only, no CJS build), and the exports map's ./package.json entry.
import { describe, expect, it } from 'vitest';
import { jsEntries, node, write } from './helpers/consumer.mjs';

const [major, minor] = process.versions.node.split('.').map(Number);

function loadAll(kind) {
  const lines = jsEntries.map((spec) => {
    const load = kind === 'require' ? `require('${spec}')` : `await import('${spec}')`;
    return `out[${JSON.stringify(spec)}] = Object.keys(${load}).sort();`;
  });
  const file = kind === 'require' ? 'load-entries.cjs' : 'load-entries.mjs';
  write(file, `const out = {};\n${lines.join('\n')}\nconsole.log(JSON.stringify(out));\n`);
  const result = node([file]);
  // Node 22.12 still prints an ExperimentalWarning for require(esm); later versions do not.
  const stderr = result.stderr
    .split('\n')
    .filter((line) => line && !/ExperimentalWarning|--trace-warnings/.test(line));
  expect(stderr, `${kind} of every entry`).toEqual([]);
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout);
}

describe('Node loads every entry point', () => {
  it('runs on a Node version with require(esm) unflagged (>= 22.12)', () => {
    expect(major > 22 || (major === 22 && minor >= 12)).toBe(true);
  });

  it('import() of every entry', () => {
    const loaded = loadAll('import');
    expect(loaded.snaplot).toContain('createChart');
    for (const spec of jsEntries) expect(loaded[spec].length, spec).toBeGreaterThan(0);
  });

  it.fails('[repo-07] require() of every entry, through require(esm)', () => {
    const loaded = loadAll('require');
    expect(loaded.snaplot).toContain('createChart');
    expect(loaded['snaplot/react']).toContain('Chart');
    expect(loaded['snaplot/solid']).toContain('Chart');
  });

  it.fails('[repo-07] the exports map exposes ./package.json', () => {
    const result = node([
      '--input-type=module',
      '-e',
      [
        "import { createRequire } from 'node:module';",
        'const require = createRequire(import.meta.url);',
        "const pkg = require('snaplot/package.json');",
        "const json = await import('snaplot/package.json', { with: { type: 'json' } });",
        'console.log(pkg.name, json.default.version === pkg.version);',
      ].join('\n'),
    ]);
    expect(result.output.trim()).toBe('snaplot true');
  });
});
