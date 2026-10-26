#!/usr/bin/env node
// `npm run conformance:install` (plan D2, §7.5): pack packages/snaplot and install the tarball into
// the isolated React 18 fixture, test/conformance/react18/. The fixture is not a workspace and has
// its own lockfile (react@18.3.1, react-dom@18.3.1). The library is never linked with `file:`:
// dist/react.js would then resolve the workspace root's React 19.
//
//   node test/conformance/install.mjs
//
// The library must be built first (`npm run build`). The fixture's dependencies are installed with
// `npm ci` only when its lockfile changed since the last install; the tarball is unpacked into
// react18/node_modules/snaplot every time, so the fixture always holds the current build.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForBenchLock } from './lock.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, '../..');
const fixture = path.join(here, 'react18');
const out = path.join(here, 'dist');
const modules = path.join(fixture, 'node_modules');
const stamp = path.join(modules, '.conformance-lock');

const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

if (!existsSync(path.join(pkg, 'dist/index.js'))) {
  console.error('conformance:install: build the library first (npm run build).');
  process.exit(1);
}
waitForBenchLock('conformance:install');

// 1. The fixture's own dependencies, from its lockfile.
const lock = hash(path.join(fixture, 'package-lock.json'));
if (!existsSync(stamp) || readFileSync(stamp, 'utf8') !== lock) {
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--workspaces=false'], fixture);
  writeFileSync(stamp, lock);
}

// 2. The packed library, unpacked as npm would install it (it has no dependencies of its own).
mkdirSync(out, { recursive: true });
const [packed] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', out], pkg));
const tarball = path.join(out, packed.filename);
const target = path.join(modules, 'snaplot');
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
run('tar', ['-xzf', tarball, '-C', target, '--strip-components', '1'], fixture);

const react = JSON.parse(readFileSync(path.join(modules, 'react/package.json'), 'utf8')).version;
console.log(
  `conformance:install: ${packed.filename} (${packed.entryCount} files) into react18/ with React ${react}`,
);
