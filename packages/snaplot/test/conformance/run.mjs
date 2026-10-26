#!/usr/bin/env node
// `npm run test:conformance` (plan §7.5): builds the four runtime pages (build.mjs) and runs the
// scenario table in Chromium. Arguments are passed to Playwright.
//
//   npm run build && npm run conformance:install && npm run test:conformance [-- <playwright args>]
//
// The React 18 fixture must hold the current build: when its tarball is older than dist/, the
// run stops and asks for `npm run conformance:install`.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForBenchLock } from './lock.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, '../..');

const built = path.join(pkg, 'dist/react.js');
const installed = path.join(here, 'react18/node_modules/snaplot/dist/react.js');
if (!existsSync(built)) {
  console.error('test:conformance: build the library first (npm run build).');
  process.exit(1);
}
if (!existsSync(installed) || readFileSync(installed, 'utf8') !== readFileSync(built, 'utf8')) {
  console.error(
    'test:conformance: the React 18 fixture does not hold the current build: run npm run conformance:install.',
  );
  process.exit(1);
}

const step = (command, args) => {
  const result = spawnSync(command, args, { cwd: pkg, stdio: 'inherit' });
  return result.status ?? 1;
};

const status = step('node', [path.join(here, 'build.mjs')]);
if (status) process.exit(status);
waitForBenchLock('test:conformance');
process.exit(
  step('npx', [
    'playwright',
    'test',
    '-c',
    path.join(here, 'playwright.config.ts'),
    ...process.argv.slice(2),
  ]),
);
