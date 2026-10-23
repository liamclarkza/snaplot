// Consumer checks (plan §11.3 G5): pack the built package, install the tarball into a throwaway
// consumer project and use it the way applications do. The scenarios live in test/consumers/ and
// run under vitest inside that project, so expected failures are ordinary `it.fails('[id] …')`.
//
//   node scripts/check-consumers.mjs [--keep] [--filter <test name text>]
//
// The consumer lives in the OS temp directory, outside the repository, so nothing resolves through
// the workspace's node_modules by accident. node_modules/snaplot is the extracted `npm pack`
// tarball (exactly the published files); the other packages are symlinks to the workspace's copies.
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
const scenarios = join(packageRoot, 'test/consumers');
const args = process.argv.slice(2);
const keep = args.includes('--keep');
const filterAt = args.indexOf('--filter');
const filter = filterAt >= 0 ? args[filterAt + 1] : undefined;

// The packages a consumer app would install next to snaplot, plus the tools the scenarios drive.
const CONSUMER_DEPS = [
  'react',
  'react-dom',
  'solid-js',
  '@types/react',
  '@types/react-dom',
  // npm hoists csstype from @types/react, and snaplot/react's declarations reference it.
  'csstype',
  'typescript',
  'vitest',
  'vite',
  'vite-plugin-solid',
  'jsdom',
  'esbuild',
];

function fail(message) {
  console.error(`check-consumers: ${message}`);
  process.exit(1);
}

if (!existsSync(join(packageRoot, 'dist/index.js'))) {
  fail('dist/ is missing. Run `npm run build` first.');
}

// Warn when dist is older than the newest source file: the checks would test a stale build.
function newestMtime(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(path) : statSync(path).mtimeMs);
  }
  return newest;
}
if (newestMtime(join(packageRoot, 'src')) > statSync(join(packageRoot, 'dist/index.js')).mtimeMs) {
  console.warn(
    'check-consumers: src/ is newer than dist/. Run `npm run build` for a current result.',
  );
}

function findPackageDir(name) {
  for (let dir = packageRoot; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
    if (dirname(dir) === dir)
      throw new Error(`cannot find ${name} in any node_modules above ${packageRoot}`);
  }
}

const consumer = mkdtempSync(join(realpathSync(tmpdir()), 'snaplot-consumer-'));
let status = 1;
try {
  writeFileSync(
    join(consumer, 'package.json'),
    `${JSON.stringify({ name: 'snaplot-consumer', private: true, type: 'module' }, null, 2)}\n`,
  );
  const modules = join(consumer, 'node_modules');
  mkdirSync(join(modules, '@types'), { recursive: true });
  // npm pack runs the prepack and postpack scripts, as `npm publish` does.
  const pack = spawnSync('npm', ['pack', '--json', '--pack-destination', consumer], {
    cwd: packageRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (pack.status !== 0) throw new Error('npm pack failed');
  const [packed] = JSON.parse(pack.stdout.slice(pack.stdout.indexOf('[')));
  writeFileSync(join(consumer, 'pack.json'), `${JSON.stringify(packed, null, 2)}\n`);
  mkdirSync(join(modules, 'snaplot'));
  const untar = spawnSync(
    'tar',
    [
      '-xzf',
      join(consumer, packed.filename),
      '-C',
      join(modules, 'snaplot'),
      '--strip-components=1',
    ],
    { stdio: 'inherit' },
  );
  if (untar.status !== 0) throw new Error(`could not extract ${packed.filename}`);
  for (const dep of CONSUMER_DEPS) symlinkSync(findPackageDir(dep), join(modules, dep), 'dir');
  cpSync(scenarios, consumer, { recursive: true });

  const report = join(packageRoot, 'test-results/consumers.json');
  mkdirSync(dirname(report), { recursive: true });
  const vitest = join(modules, 'vitest/vitest.mjs');
  const run = spawnSync(
    process.execPath,
    [
      vitest,
      'run',
      '--root',
      consumer,
      '--config',
      join(consumer, 'vitest.config.mjs'),
      '--reporter=verbose',
      '--reporter=json',
      `--outputFile.json=${report}`,
      ...(filter ? ['-t', filter] : []),
    ],
    {
      cwd: consumer,
      stdio: 'inherit',
      env: { ...process.env, SNAPLOT_CONSUMER_DIR: consumer },
    },
  );
  status = run.status ?? 1;
  if (status === 0) console.log(`check-consumers: passed (report: ${resolve(report)})`);
} catch (error) {
  console.error(`check-consumers: ${error.message}`);
} finally {
  if (keep) console.log(`check-consumers: kept the consumer project at ${consumer}`);
  else rmSync(consumer, { recursive: true, force: true });
}
process.exit(status);
