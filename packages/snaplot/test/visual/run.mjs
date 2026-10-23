#!/usr/bin/env node
// `npm run test:visual` (plan §11.3 G10). Runs the `visual` Playwright project
// in local Chromium (EXECUTION.md rule 1; scripts/visual-docker.sh is the optional Linux path).
//
//   npm run test:visual                       compare against the committed -<platform> baselines
//   npm run test:visual -- --against <ref>    render <ref>'s own fixture app into the reference
//                                             cache, then compare the working tree against it
//   npm run test:visual -- --update           rewrite the committed baselines (M3a and M14 only)
//   npm run test:visual -- --serve            serve the fixture app for a look in a browser
//   --against-tree <dir> [--against-sha <sha>] use an already extracted ref (scripts/visual-docker.sh)
//
// Other flags: --project visual|geometry (repeatable), --grep <re>, --workers <n>; anything after
// `--` goes to Playwright unchanged. Output: test-results/visual/{report.json,meta.json,
// contact-sheet.html}; `node scripts/overhaul/check-visual-diffs.mjs` reads them.
//
// The reference cache lives outside the tracked tree: $SNAPLOT_SNAPSHOT_DIR, default
// <main checkout>/.claude/visual-cache/<sha>/. A ref is extracted with `git archive` (no worktree)
// and its own playwright config captures its own fixtures, so a fixture renamed between the two
// sides compares like with like. Nothing is ever deleted outside this worktree.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeContactSheet } from './contact-sheet.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '../..');
const OUT = join(PKG, 'test-results/visual');
const BASELINES = join(HERE, '__screenshots__');
const DEFAULT_PORT = 5333; // EXECUTION.md rule 6: M3a = 5300 + 33
const LOCK_STALE_MS = 2 * 60 * 60 * 1000;

function git(args, cwd = PKG) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
}

function parseArgs(argv) {
  const opts = {
    projects: [],
    passthrough: [],
    against: null,
    againstTree: null,
    againstSha: null,
    update: false,
    serve: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      opts.passthrough.push(...argv.slice(i + 1));
      break;
    }
    if (a === '--against') opts.against = argv[++i];
    else if (a.startsWith('--against=')) opts.against = a.slice(10);
    else if (a === '--against-tree') opts.againstTree = resolve(argv[++i]);
    else if (a === '--against-sha') opts.againstSha = argv[++i];
    else if (a === '--update') opts.update = true;
    else if (a === '--serve') opts.serve = true;
    else if (a === '--project') opts.projects.push(argv[++i]);
    else if (a === '--grep' || a === '-g') opts.passthrough.push('--grep', argv[++i]);
    else if (a === '--workers' || a === '-j') opts.passthrough.push('--workers', argv[++i]);
    else opts.passthrough.push(a);
  }
  if (opts.against === undefined || opts.against === '') throw new Error('--against needs a ref');
  if (opts.againstTree && !opts.against) opts.against = opts.againstSha ?? 'tree';
  if (opts.against && opts.update) throw new Error('--against and --update are exclusive');
  return opts;
}

const repoRoot = git(['rev-parse', '--show-toplevel']);
const mainRoot = dirname(resolve(repoRoot, git(['rev-parse', '--git-common-dir'])));

async function waitForBenchLock() {
  const lock = join(mainRoot, '.claude/bench.lock');
  let announced = false;
  while (existsSync(lock)) {
    const age = Date.now() - statSync(lock).mtimeMs;
    if (age > LOCK_STALE_MS) {
      console.warn(`visual: ignoring a stale bench lock (${Math.round(age / 60000)} min old)`);
      return;
    }
    if (!announced) console.log(`visual: waiting for the bench lock ${lock}`);
    announced = true;
    await new Promise((r) => setTimeout(r, 15000));
  }
}

function portFree(port) {
  return new Promise((resolvePort) => {
    const server = createServer();
    server.once('error', () => resolvePort(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolvePort(true)));
  });
}

async function pickPort() {
  if (process.env.PORT) return Number(process.env.PORT);
  if (await portFree(DEFAULT_PORT)) return DEFAULT_PORT;
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  await new Promise((r) => server.close(r));
  console.warn(`visual: port ${DEFAULT_PORT} is busy, using ${port}`);
  return port;
}

function playwrightBin(root) {
  return join(root, 'node_modules/@playwright/test/cli.js');
}

function browserFingerprint() {
  const core = JSON.parse(
    readFileSync(join(repoRoot, 'node_modules/playwright-core/browsers.json'), 'utf8'),
  );
  const chromium = core.browsers.find((b) => b.name === 'chromium');
  const pw = JSON.parse(
    readFileSync(join(repoRoot, 'node_modules/@playwright/test/package.json'), 'utf8'),
  );
  return `${process.platform}-${process.arch}-pw${pw.version}-chromium${chromium?.revision}`;
}

function run(cmd, args, options) {
  return new Promise((resolveRun) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...options });
    child.on('exit', (code, signal) => resolveRun(signal ? 1 : (code ?? 1)));
  });
}

function listPngs(dir, base = dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listPngs(path, base));
    else if (entry.name.endsWith('.png')) out.push(relative(base, path));
  }
  return out.sort();
}

/** Extracts <sha> and renders its own fixture app into the cache; returns the shots directory. */
async function captureReference(ref, port, givenTree, givenSha) {
  const sha = givenTree ? (givenSha ?? 'tree') : git(['rev-parse', '--verify', `${ref}^{commit}`]);
  const cacheRoot = resolve(
    process.env.SNAPLOT_SNAPSHOT_DIR || join(mainRoot, '.claude/visual-cache'),
  );
  const entry = join(cacheRoot, sha);
  const fingerprint = browserFingerprint();
  const shots = join(entry, `shots-${fingerprint}`);
  const marker = join(shots, 'capture.json');
  if (existsSync(marker)) {
    console.log(`visual: reference ${ref} (${sha.slice(0, 10)}) from cache ${shots}`);
    return { ref, sha, shots };
  }
  const tree = givenTree ?? join(entry, 'tree');
  if (!givenTree) {
    mkdirSync(tree, { recursive: true });
    console.log(`visual: extracting ${ref} (${sha.slice(0, 10)}) into ${tree}`);
    const archive = spawnSync('git', ['archive', '--format=tar', sha], {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024 * 1024,
    });
    if (archive.status !== 0) throw new Error(`git archive ${sha} failed: ${archive.stderr}`);
    const untar = spawnSync('tar', ['-x', '-C', tree], { input: archive.stdout });
    if (untar.status !== 0) throw new Error(`tar -x failed: ${untar.stderr}`);
  }
  const refPkg = join(tree, 'packages/snaplot');
  if (!existsSync(join(refPkg, 'test/visual/visual.spec.ts'))) {
    throw new Error(
      `${ref} (${sha.slice(0, 10)}) has no visual fixture app: refs older than the M3a merge ` +
        'are not valid references (plan §11.3 G10)',
    );
  }
  const refLock = join(tree, 'package-lock.json');
  const headLock = join(repoRoot, 'package-lock.json');
  const sameLock =
    existsSync(refLock) && readFileSync(refLock, 'utf8') === readFileSync(headLock, 'utf8');
  const refModules = join(tree, 'node_modules');
  if (sameLock) {
    if (!existsSync(refModules)) symlinkSync(join(repoRoot, 'node_modules'), refModules, 'dir');
  } else if (!existsSync(join(refModules, '@playwright/test'))) {
    console.log('visual: the reference lockfile differs; running npm ci in the extracted tree');
    await waitForBenchLock();
    const code = await run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: tree,
    });
    if (code !== 0) throw new Error('npm ci in the reference tree failed');
  }
  mkdirSync(shots, { recursive: true });
  const code = await run(
    process.execPath,
    [
      playwrightBin(tree),
      'test',
      '--config',
      join(refPkg, 'playwright.config.ts'),
      '--project',
      'visual',
      '--update-snapshots=all',
      '--reporter=dot,json',
    ],
    {
      cwd: refPkg,
      env: {
        ...process.env,
        PORT: String(port),
        SNAPLOT_VISUAL_EXPECTED_DIR: shots,
        SNAPLOT_VISUAL_OUTPUT_DIR: join(entry, 'out'),
        PLAYWRIGHT_JSON_OUTPUT_NAME: join(entry, 'out/capture-report.json'),
      },
    },
  );
  const captured = listPngs(shots);
  if (code !== 0) {
    console.warn(
      `visual: the reference run exited ${code}; its failing fixtures have no reference and ` +
        'will be reported as added',
    );
  }
  writeFileSync(
    marker,
    `${JSON.stringify({ ref, sha, fingerprint, exit: code, shots: captured.length, date: new Date().toISOString() }, null, 2)}\n`,
  );
  console.log(`visual: captured ${captured.length} reference screenshots`);
  return { ref, sha, shots };
}

function pruneStaleBaselines(produced) {
  const suffix = `-${process.platform}.png`;
  const keep = new Set(produced.map((name) => `${name}${suffix}`));
  let removed = 0;
  for (const file of listPngs(BASELINES)) {
    if (file.endsWith(suffix) && !keep.has(file)) {
      unlinkSync(join(BASELINES, file));
      removed++;
    }
  }
  if (removed) console.log(`visual: removed ${removed} stale baseline(s) for ${process.platform}`);
}

function shotNames(report) {
  const names = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        for (const a of t.annotations ?? []) if (a.type === 'screenshot') names.push(a.description);
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  return names;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const port = await pickPort();
  if (opts.serve) {
    console.log(`visual: http://127.0.0.1:${port}/index.html`);
    const vite = join(repoRoot, 'node_modules/vite/bin/vite.js');
    process.exit(
      await run(
        process.execPath,
        [vite, '--config', 'test/visual/vite.config.mjs', '--port', String(port)],
        { cwd: PKG },
      ),
    );
  }
  await waitForBenchLock();
  const reference = opts.against
    ? await captureReference(opts.against, port, opts.againstTree, opts.againstSha)
    : null;
  const projects = opts.projects.length ? opts.projects : ['visual'];
  const args = [playwrightBin(repoRoot), 'test', ...projects.flatMap((p) => ['--project', p])];
  args.push(
    opts.update ? '--update-snapshots=all' : '--update-snapshots=none',
    ...opts.passthrough,
  );
  const env = { ...process.env, PORT: String(port) };
  if (reference) env.SNAPLOT_VISUAL_EXPECTED_DIR = reference.shots;
  else delete env.SNAPLOT_VISUAL_EXPECTED_DIR;
  delete env.SNAPLOT_VISUAL_OUTPUT_DIR;
  const code = await run(process.execPath, args, { cwd: PKG, env });

  const reportPath = join(OUT, 'report.json');
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
  const produced = report ? shotNames(report) : [];
  // Anything but a worker count narrows the run, so stale baselines and removals are not judged.
  const narrowing = opts.passthrough.filter(
    (a, i, all) => a !== '--workers' && all[i - 1] !== '--workers',
  );
  const filtered = narrowing.length > 0 || !projects.includes('visual');
  if (opts.update && code === 0 && !filtered && projects.includes('visual')) {
    pruneStaleBaselines(produced);
  }
  const head = git(['rev-parse', 'HEAD']);
  const dirty = git(['status', '--porcelain']) !== '';
  const expectedAbs = reference ? reference.shots : BASELINES;
  const inPkg = relative(PKG, expectedAbs);
  const meta = {
    mode: reference ? 'against' : opts.update ? 'update' : 'baselines',
    head: { sha: head, dirty },
    against: reference,
    // Relative to packages/snaplot when inside it, so a copied result directory stays readable.
    expectedDir: inPkg.startsWith('..') ? expectedAbs : inPkg,
    platform: process.platform,
    suffix: reference ? '' : `-${process.platform}`,
    projects,
    filtered,
    exit: code,
    date: new Date().toISOString(),
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  if (report) {
    const sheet = writeContactSheet({
      report,
      meta: { ...meta, expectedDir: expectedAbs },
      outFile: join(OUT, 'contact-sheet.html'),
    });
    console.log(`visual: contact sheet ${relative(process.cwd(), sheet)}`);
  }
  if (opts.update) {
    const files = listPngs(BASELINES).filter((f) => f.endsWith(`-${process.platform}.png`));
    const bytes = files.reduce((sum, f) => sum + statSync(join(BASELINES, f)).size, 0);
    console.log(
      `visual: committed set for ${process.platform}: ${files.length} PNGs, ` +
        `${(bytes / 1024 / 1024).toFixed(2)} MB`,
    );
  }
  process.exit(code);
}

main().catch((error) => {
  console.error(`visual: ${error.message}`);
  process.exit(2);
});
