#!/usr/bin/env node
// Compiles every example the way a user would (plan §8.3). For each option-level example
// (src/examples/**/<name>.options.ts) it writes the three runnable files the tabs show and copy
// into .generated/examples/ (ignored by git), then type-checks the examples with
// tsconfig.examples.json (vanilla and React) and tsconfig.examples.solid.json (Solid). `snaplot`
// resolves through its package exports to the built dist/*.d.ts, so run `npm run build` first.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRAMEWORKS, optionsTabSource } from '../src/lib/examples.ts';

const site = fileURLToPath(new URL('..', import.meta.url));
const examples = join(site, 'src/examples');
const generated = join(site, '.generated/examples');

if (!existsSync(join(site, '../packages/snaplot/dist/index.d.ts'))) {
  console.error('check-examples: packages/snaplot/dist is missing; run `npm run build` first.');
  process.exit(1);
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

rmSync(generated, { recursive: true, force: true });
let count = 0;
for (const file of walk(examples)) {
  if (!file.endsWith('.options.ts')) continue;
  const name = relative(examples, file).replace(/\.options\.ts$/, '');
  const source = readFileSync(file, 'utf8');
  for (const framework of FRAMEWORKS) {
    const out = join(generated, `${name}${framework.suffix}`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, optionsTabSource(source, framework.id));
  }
  count++;
}
console.log(`check-examples: generated the tab files of ${count} option-level examples`);

const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
let failed = false;
for (const project of ['tsconfig.examples.json', 'tsconfig.examples.solid.json']) {
  const result = spawnSync(process.execPath, [tsc, '-p', project], { cwd: site, stdio: 'inherit' });
  console.log(`check-examples: tsc -p ${project} ${result.status === 0 ? 'passed' : 'failed'}`);
  if (result.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
