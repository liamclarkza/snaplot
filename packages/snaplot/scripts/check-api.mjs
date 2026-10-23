// Golden public API (plan §11.3 G7): the rolled-up declarations in dist/ must equal the reviewed
// copies in api/. A change to the public surface is a deliberate diff to api/*.d.ts.
//
//   node scripts/check-api.mjs            compare dist/*.d.ts with api/*.d.ts (run after a build)
//   node scripts/check-api.mjs --update   copy dist/*.d.ts to api/ (npm run api:update)
//
// It also greps the golden files for engine types (P4). A name tracked by a ledger entry is
// reported, not failed: test/golden-api.test.ts holds the expected failure until it is gone.
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const api = join(root, 'api');

/** P4: public declarations never name these engine types. */
const FORBIDDEN = ['EngineConfig', 'ChartCore', 'SeriesConfig', 'ChartInstance'];
/** Names reported instead of failed while a ledger marker tracks them (none since M7, research-12). */
const TRACKED = new Set();

const declarations = (dir) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((file) => file.endsWith('.d.ts'))
        .sort()
    : [];

function newest(dir) {
  let time = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    time = Math.max(time, entry.isDirectory() ? newest(path) : statSync(path).mtimeMs);
  }
  return time;
}

const built = declarations(dist);
if (built.length === 0) {
  console.error('check-api: dist/ has no declarations. Run `npm run build` first.');
  process.exit(1);
}
if (newest(join(root, 'src')) > statSync(join(dist, built[0])).mtimeMs) {
  console.warn('check-api: src/ is newer than dist/. Run `npm run build` for a current result.');
}

if (process.argv.includes('--update')) {
  mkdirSync(api, { recursive: true });
  for (const file of declarations(api)) if (!built.includes(file)) rmSync(join(api, file));
  for (const file of built) copyFileSync(join(dist, file), join(api, file));
  console.log(`check-api: updated api/ from dist/ (${built.join(', ')}). Review the diff.`);
  process.exit(0);
}

let failed = false;
const golden = declarations(api);
for (const file of new Set([...built, ...golden])) {
  if (!golden.includes(file)) {
    console.error(`check-api: dist/${file} has no golden copy in api/.`);
    failed = true;
  } else if (!built.includes(file)) {
    console.error(`check-api: api/${file} is no longer built.`);
    failed = true;
  } else if (readFileSync(join(dist, file), 'utf8') !== readFileSync(join(api, file), 'utf8')) {
    console.error(`check-api: dist/${file} differs from api/${file}:`);
    const diff = spawnSync(
      'git',
      ['diff', '--no-index', '--stat', '--', join(api, file), join(dist, file)],
      { encoding: 'utf8' },
    );
    console.error(diff.stdout.trim());
    failed = true;
  }
}

for (const file of golden) {
  const text = readFileSync(join(api, file), 'utf8');
  for (const name of FORBIDDEN) {
    const count = text.match(new RegExp(`\\b${name}\\b`, 'g'))?.length ?? 0;
    if (count === 0) continue;
    if (TRACKED.has(name)) {
      console.log(
        `check-api: api/${file} names ${name} ${count}x (P4, tracked by a ledger marker)`,
      );
    } else {
      console.error(`check-api: api/${file} names the engine type ${name} (P4).`);
      failed = true;
    }
  }
}

if (failed) {
  console.error('check-api: if the public API change is intended, run `npm run api:update`.');
  process.exit(1);
}
console.log(`check-api: dist/ matches the golden declarations (${golden.join(', ')}).`);
