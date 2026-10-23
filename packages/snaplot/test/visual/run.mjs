#!/usr/bin/env node
// `npm run test:visual` (plan §11.3 G10). Runs the `visual` and `geometry` Playwright projects
// in local Chromium (EXECUTION.md rule 1; scripts/visual-docker.sh is the optional Linux path).
//
//   npm run test:visual                       compare against the committed -<platform> baselines
//   npm run test:visual -- --against <ref>    render <ref>'s own fixture app into the reference
//                                             cache, then compare the working tree against it,
//                                             exactly (threshold 0, maxDiffPixels 0)
//   npm run test:visual -- --update           rewrite the committed baselines (M3a and M14 only)
//   npm run test:visual -- --strict           compare the committed baselines exactly too, instead
//                                             of threshold 0 and maxDiffPixelRatio 0.002
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
// sides compares like with like. The reference is rendered twice, and the second render must
// match the first exactly (SNAPLOT_VISUAL_STRICT), and the head is then compared with it exactly
// too (record.mjs says why). It is cached (capture.json) only when every shot it declares rendered and reproduced itself.
// meta.json records the outcome (`against.complete`, the exit codes and the shot list), and
// check-visual-diffs fails on an incomplete reference. Nothing is ever deleted outside this
// worktree (except a stale node_modules symlink the runner itself made in the cache).
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeContactSheet } from './contact-sheet.mjs';
import { comparisonFor, describeComparison, STRICT_ENV } from './record.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '../..');
const OUT = join(PKG, 'test-results/visual');
const BASELINES = join(HERE, '__screenshots__');
const DEFAULT_PORT = 5333; // EXECUTION.md rule 6: M3a = 5300 + 33
const LOCK_STALE_MS = 2 * 60 * 60 * 1000;
/**
 * capture.json format: 2 recorded the verified shot list; 3 means the second render matched the
 * first exactly, not within the comparison tolerance. Older entries are captured again.
 */
const CAPTURE_FORMAT = 3;

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
    strict: false,
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
    else if (a === '--strict') opts.strict = true;
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

function headPlaywrightVersion() {
  return JSON.parse(
    readFileSync(join(repoRoot, 'node_modules/@playwright/test/package.json'), 'utf8'),
  ).version;
}

function browserFingerprint() {
  const core = JSON.parse(
    readFileSync(join(repoRoot, 'node_modules/playwright-core/browsers.json'), 'utf8'),
  );
  const chromium = core.browsers.find((b) => b.name === 'chromium');
  return `${process.platform}-${process.arch}-pw${headPlaywrightVersion()}-chromium${chromium?.revision}`;
}

/**
 * The cache key of the browser that renders the reference. A ref whose lockfile pins another
 * Playwright renders with that Playwright (and the Chromium it pins), not the head's.
 */
function referenceFingerprint(refLock) {
  let version = null;
  try {
    version = JSON.parse(refLock ?? '').packages?.['node_modules/@playwright/test']?.version;
  } catch {
    version = null;
  }
  if (!version || version === headPlaywrightVersion()) return browserFingerprint();
  return `${process.platform}-${process.arch}-pw${version}`;
}

/** Points <link> at <target>, replacing a symlink that is dangling or points elsewhere. */
function linkModules(target, link) {
  let stat = null;
  try {
    stat = lstatSync(link);
  } catch {
    stat = null;
  }
  if (stat?.isSymbolicLink()) {
    if (readlinkSync(link) === target && existsSync(link)) return;
    // Made by this runner for a worktree that has since been removed (or another worktree).
    unlinkSync(link);
  } else if (stat) {
    return; // a real node_modules (npm ci ran in the reference tree)
  }
  symlinkSync(target, link, 'dir');
}

/**
 * Shot names in a Playwright JSON report of the visual project: every shot the run declared, and
 * the ones whose test passed. A report that is missing or unreadable declares nothing.
 */
function readShotReport(path) {
  let report;
  try {
    report = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { declared: [], passed: [] };
  }
  const declared = [];
  const passed = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        // A test that never started has no annotations; its describe block is the shot name.
        const name =
          (t.annotations ?? []).find((a) => a.type === 'screenshot')?.description ??
          (t.projectName === 'visual' ? suite.title : undefined);
        if (!name) continue;
        declared.push(name);
        if (t.status === 'expected') passed.push(name);
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  return { declared, passed };
}

/** capture.json of a complete reference in the current format, else null. */
function readMarker(marker) {
  try {
    const data = JSON.parse(readFileSync(marker, 'utf8'));
    return data.format === CAPTURE_FORMAT && Array.isArray(data.shots) ? data : null;
  } catch {
    return null;
  }
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

/**
 * One render of the reference's visual project into <shots>, reported to <reportPath>. `exact`
 * compares with no tolerance (the ref's SNAPLOT_VISUAL_STRICT), else with its default tolerance.
 * The ref's own config reads the variable, so this works for every ref from M3a on.
 */
async function renderReference({ tree, port, shots, entry, update, reportPath, exact }) {
  const refPkg = join(tree, 'packages/snaplot');
  // A run that dies before it reports must not leave an older report to be read.
  writeFileSync(reportPath, '{}\n');
  const code = await run(
    process.execPath,
    [
      playwrightBin(tree),
      'test',
      '--config',
      join(refPkg, 'playwright.config.ts'),
      '--project',
      'visual',
      `--update-snapshots=${update}`,
      '--reporter=dot,json',
    ],
    {
      cwd: refPkg,
      env: {
        ...process.env,
        PORT: String(port),
        SNAPLOT_VISUAL_EXPECTED_DIR: shots,
        SNAPLOT_VISUAL_OUTPUT_DIR: join(entry, 'out'),
        [STRICT_ENV]: exact ? '1' : '',
        PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
      },
    },
  );
  return { code, ...readShotReport(reportPath) };
}

/**
 * Extracts <sha> and renders its own fixture app into the cache, twice: the second render must
 * reproduce the first exactly. Returns the reference outcome that meta.json records:
 * `{ ref, sha, dir, fingerprint, cached, exit, verifyExit, complete, declared, shots }`, where
 * `shots` lists the shot names that rendered and reproduced, and `complete` says whether that is
 * every shot the ref declares (only then is it cached).
 */
async function captureReference(ref, port, givenTree, givenSha) {
  const sha = givenTree ? (givenSha ?? 'tree') : git(['rev-parse', '--verify', `${ref}^{commit}`]);
  const cacheRoot = resolve(
    process.env.SNAPLOT_SNAPSHOT_DIR || join(mainRoot, '.claude/visual-cache'),
  );
  const entry = join(cacheRoot, sha);
  const refLockPath = givenTree ? join(givenTree, 'package-lock.json') : null;
  const refLock = givenTree
    ? existsSync(refLockPath)
      ? readFileSync(refLockPath, 'utf8')
      : null
    : (() => {
        const show = spawnSync('git', ['show', `${sha}:package-lock.json`], {
          cwd: repoRoot,
          encoding: 'utf8',
          maxBuffer: 256 * 1024 * 1024,
        });
        return show.status === 0 ? show.stdout : null;
      })();
  const fingerprint = referenceFingerprint(refLock);
  const shots = join(entry, `shots-${fingerprint}`);
  const marker = join(shots, 'capture.json');
  const cached = readMarker(marker);
  if (cached) {
    console.log(
      `visual: reference ${ref} (${sha.slice(0, 10)}) from cache ${shots} (${cached.shots.length} shots)`,
    );
    return {
      ref,
      sha,
      dir: shots,
      fingerprint,
      cached: true,
      exit: cached.exit,
      verifyExit: cached.verifyExit,
      complete: true,
      declared: cached.declared,
      shots: cached.shots,
    };
  }
  if (existsSync(marker)) {
    console.log('visual: the cached reference predates the verified shot list; capturing again');
  }
  const refHasHarness = givenTree
    ? existsSync(join(givenTree, 'packages/snaplot/test/visual/visual.spec.ts'))
    : spawnSync('git', ['cat-file', '-e', `${sha}:packages/snaplot/test/visual/visual.spec.ts`], {
        cwd: repoRoot,
      }).status === 0;
  if (!refHasHarness) {
    throw new Error(
      `${ref} (${sha.slice(0, 10)}) has no visual fixture app: refs older than the M3a merge ` +
        'are not valid references (plan §11.3 G10)',
    );
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
  const headLock = readFileSync(join(repoRoot, 'package-lock.json'), 'utf8');
  const refModules = join(tree, 'node_modules');
  if (refLock !== null && refLock === headLock) {
    linkModules(join(repoRoot, 'node_modules'), refModules);
  } else if (!existsSync(join(refModules, '@playwright/test'))) {
    console.log('visual: the reference lockfile differs; running npm ci in the extracted tree');
    await waitForBenchLock();
    const code = await run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: tree,
    });
    if (code !== 0) throw new Error('npm ci in the reference tree failed');
  }
  mkdirSync(shots, { recursive: true });
  mkdirSync(join(entry, 'out'), { recursive: true });
  const render = { tree, port, shots, entry };
  const captureReport = join(entry, 'out/capture-report.json');
  const capture = await renderReference({
    ...render,
    update: 'all',
    reportPath: captureReport,
    exact: false,
  });
  const verifyReport = join(entry, 'out/verify-report.json');
  let verify = null;
  if (capture.code === 0 && capture.passed.length > 0) {
    // Exact, not within the tolerance: a shot that wobbles under 0.002 would otherwise be cached
    // and then report a false change to every exact run against it.
    console.log('visual: rendering the reference again; every shot must reproduce exactly');
    verify = await renderReference({
      ...render,
      update: 'none',
      reportPath: verifyReport,
      exact: true,
    });
  }
  const onDisk = new Set(listPngs(shots).map((f) => f.split('\\').join('/').slice(0, -4)));
  const reproduced = verify ? new Set(verify.passed) : null;
  const usable = capture.passed.filter((n) => onDisk.has(n) && (!reproduced || reproduced.has(n)));
  const complete =
    capture.code === 0 &&
    verify?.code === 0 &&
    capture.declared.length > 0 &&
    usable.length === capture.declared.length;
  const outcome = {
    ref,
    sha,
    dir: shots,
    fingerprint,
    cached: false,
    exit: capture.code,
    verifyExit: verify ? verify.code : null,
    complete,
    declared: capture.declared.length,
    shots: usable,
  };
  if (!complete) {
    // Not cached: a transient failure must not freeze a partial reference.
    const unreproduced = reproduced ? capture.passed.filter((n) => !reproduced.has(n)) : [];
    console.warn(
      `visual: WARNING: the reference is incomplete: capture exit ${capture.code}` +
        (verify ? `, second render exit ${verify.code}` : '') +
        `; ${usable.length} of ${capture.declared.length} declared shots usable` +
        (unreproduced.length ? ` (did not reproduce: ${unreproduced.join(', ')})` : '') +
        `. See ${verify?.code ? verifyReport : captureReport}. check-visual-diffs fails on ` +
        'this run; re-run it.',
    );
    return outcome;
  }
  const { dir: _dir, cached: _cached, ...record } = outcome;
  writeFileSync(
    marker,
    `${JSON.stringify({ format: CAPTURE_FORMAT, ...record, date: new Date().toISOString() }, null, 2)}\n`,
  );
  console.log(`visual: captured ${usable.length} reference screenshots (each reproduced)`);
  return outcome;
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
  const projects = opts.projects.length
    ? opts.projects
    : opts.update
      ? ['visual']
      : ['visual', 'geometry'];
  const args = [playwrightBin(repoRoot), 'test', ...projects.flatMap((p) => ['--project', p])];
  args.push(
    opts.update ? '--update-snapshots=all' : '--update-snapshots=none',
    ...opts.passthrough,
  );
  const env = { ...process.env, PORT: String(port) };
  // Exact for every run against a ref: a tolerance hides library-wide default changes.
  const comparison = comparisonFor({ against: Boolean(reference), strict: opts.strict });
  env[STRICT_ENV] = comparison.exact ? '1' : '';
  console.log(`visual: comparing ${describeComparison(comparison)}`);
  if (reference) env.SNAPLOT_VISUAL_EXPECTED_DIR = reference.dir;
  else delete env.SNAPLOT_VISUAL_EXPECTED_DIR;
  delete env.SNAPLOT_VISUAL_OUTPUT_DIR;
  const reportPath = join(OUT, 'report.json');
  // A head run that dies before it reports must not leave the previous report to be judged.
  mkdirSync(OUT, { recursive: true });
  writeFileSync(reportPath, '{}\n');
  const code = await run(process.execPath, args, { cwd: PKG, env });

  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const produced = shotNames(report);
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
  const expectedAbs = reference ? reference.dir : BASELINES;
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
    // `strict` is kept for readers of the older format; `comparison` is what check-visual-diffs
    // judges.
    strict: comparison.exact,
    comparison,
    exit: code,
    date: new Date().toISOString(),
  };
  writeFileSync(join(OUT, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  const sheet = writeContactSheet({
    report,
    meta: { ...meta, expectedDir: expectedAbs },
    outFile: join(OUT, 'contact-sheet.html'),
  });
  console.log(`visual: contact sheet ${relative(process.cwd(), sheet)}`);
  if (opts.update) {
    const files = listPngs(BASELINES).filter((f) => f.endsWith(`-${process.platform}.png`));
    const bytes = files.reduce((sum, f) => sum + statSync(join(BASELINES, f)).size, 0);
    console.log(
      `visual: committed set for ${process.platform}: ${files.length} PNGs, ` +
        `${(bytes / 1024 / 1024).toFixed(2)} MB`,
    );
  }
  if (reference && !reference.complete) {
    console.error(
      `visual: the reference ${reference.ref} is incomplete (${reference.shots.length} of ` +
        `${reference.declared} shots usable): this run cannot pass check-visual-diffs; run it again`,
    );
    process.exit(code === 0 ? 1 : code);
  }
  process.exit(code);
}

main().catch((error) => {
  console.error(`visual: ${error.message}`);
  process.exit(2);
});
