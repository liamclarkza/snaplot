#!/usr/bin/env node
// Plan §11.3 G10: reads the report of the last `npm run test:visual` and decides whether its
// screenshot differences are allowed for the merging milestone.
//
//   node scripts/overhaul/check-visual-diffs.mjs [--milestone M10] [--base <ref>] [--zero]
//                                                [--report packages/snaplot/test-results/visual]
//                                                [--no-copy] [--allow-partial]
//
// - M2, M9a and M9b (or --zero): no fixture may change. Blocking.
// - Every other milestone: every changed (or removed) shot must belong to a fixture named in the
//   `**Fixtures:**` line of a visual-ledger row file that this milestone adds or edits, i.e. a
//   docs/decisions/visual-ledger/V<n>.md that differs from <base> (committed, staged, unstaged or
//   untracked). A fixture id names all its shots (`theme/card-dark` covers `@light`, `@dark` and
//   `@2x`); a trailing `*` matches a prefix (`marks/grid-*`).
// - A shot that exists only on the head is reported as added and needs no row.
// - Any geometry failure, and any visual test that failed for another reason than a screenshot
//   difference (the fixture threw, timed out), fails the check. So does a run without both
//   projects or narrowed by --grep, unless --allow-partial.
//
// The milestone defaults to the branch name (`ovh/m10-…` → M10); <base> defaults to the ref the
// run compared against, else `overhaul`. With a milestone, the actual, reference and diff images
// of every changed shot are copied to <main checkout>/notes/overhaul-audit/visual-diffs/<M>/.
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

const ZERO_CHANGE = new Set(['M2', 'M9a', 'M9b']);
/** `m9a`, `M9A` → `M9a`. */
const normalize = (id) => `M${id.slice(1).toLowerCase()}`;
const LEDGER_DIR = 'docs/decisions/visual-ledger';

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function parseArgs(argv) {
  const opts = {
    milestone: null,
    base: null,
    zero: false,
    report: null,
    copy: true,
    allowPartial: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--milestone') opts.milestone = argv[++i];
    else if (a === '--base') opts.base = argv[++i];
    else if (a === '--zero') opts.zero = true;
    else if (a === '--report') opts.report = argv[++i];
    else if (a === '--no-copy') opts.copy = false;
    else if (a === '--allow-partial') opts.allowPartial = true;
    else if (a === '--help' || a === '-h') {
      console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\nimport ')[0]);
      process.exit(0);
    } else throw new Error(`unknown argument ${a}`);
  }
  return opts;
}

/** Visual and geometry tests from a Playwright JSON report. */
function collect(report) {
  const visual = [];
  const geometry = [];
  const walk = (suite, path) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const annotations = t.annotations ?? [];
        const result = t.results?.[t.results.length - 1] ?? {};
        const entry = {
          title: [...path, spec.title].filter(Boolean).join(' › '),
          project: t.projectName,
          status: t.status, // expected | unexpected | flaky | skipped
          error: result.error?.message ?? '',
          attachments: result.attachments ?? [],
          shot: annotations.find((a) => a.type === 'screenshot')?.description,
          fixture: annotations.find((a) => a.type === 'fixture')?.description,
        };
        if (entry.shot) visual.push(entry);
        else if (t.projectName === 'geometry') geometry.push(entry);
      }
    }
    for (const child of suite.suites ?? []) walk(child, [...path, child.title]);
  };
  for (const suite of report.suites ?? []) walk(suite, []);
  return { visual, geometry };
}

function listPngs(dir, base = dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listPngs(path, base));
    else if (entry.name.endsWith('.png')) out.push(relative(base, path).split('\\').join('/'));
  }
  return out;
}

const fixtureOf = (shot) => shot.split('@')[0];

function rowFiles(repoRoot, base) {
  const changed = git(
    ['diff', '--name-only', '--diff-filter=AMR', base, '--', LEDGER_DIR],
    repoRoot,
  )
    .split('\n')
    .filter(Boolean);
  const untracked = git(['ls-files', '--others', '--exclude-standard', '--', LEDGER_DIR], repoRoot)
    .split('\n')
    .filter(Boolean);
  return [...new Set([...changed, ...untracked])].filter((p) => /\/V\d+\.md$/.test(p)).sort();
}

/** `**Fixtures:**` ids of a row file (backticked tokens on that line and its continuation). */
function rowFixtures(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /\*\*Fixtures:\*\*/.test(l));
  if (start < 0) return [];
  const block = [lines[start]];
  for (let i = start + 1; i < lines.length && /^\s{2,}\S/.test(lines[i]); i++) block.push(lines[i]);
  return [...block.join(' ').matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
}

function covers(pattern, fixture) {
  return pattern.endsWith('*') ? fixture.startsWith(pattern.slice(0, -1)) : pattern === fixture;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const repoRoot = git(['rev-parse', '--show-toplevel'], process.cwd());
  const mainRoot = dirname(resolve(repoRoot, git(['rev-parse', '--git-common-dir'], repoRoot)));
  const dir = resolve(repoRoot, opts.report ?? 'packages/snaplot/test-results/visual');
  const reportPath = join(dir, 'report.json');
  const metaPath = join(dir, 'meta.json');
  if (!existsSync(reportPath) || !existsSync(metaPath)) {
    throw new Error(
      `no visual run in ${relative(process.cwd(), dir)}: run npm run test:visual first`,
    );
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot);
  const fromBranch = /^ovh\/(m\d+[a-z]?)-/.exec(branch)?.[1];
  const raw = opts.milestone ?? fromBranch;
  const milestone = raw ? normalize(raw) : null;
  const zero = opts.zero || (milestone !== null && ZERO_CHANGE.has(milestone));
  const base = opts.base ?? meta.against?.sha ?? 'overhaul';

  const { visual, geometry } = collect(report);
  const expectedDir = resolve(repoRoot, 'packages/snaplot', meta.expectedDir);
  const expectedPath = (shot) => join(expectedDir, `${shot}${meta.suffix ?? ''}.png`);
  const changed = [];
  const added = [];
  const broken = [];
  for (const t of visual) {
    if (t.status === 'expected' || t.status === 'skipped') continue;
    if (!existsSync(expectedPath(t.shot))) added.push(t);
    else if (/stable screenshots/i.test(t.error)) broken.push(t);
    else if (/toHaveScreenshot/.test(t.error)) changed.push(t);
    else broken.push(t);
  }
  const ran = new Set(visual.map((t) => t.shot));
  const partial = Boolean(meta.filtered) || !meta.projects?.includes('visual');
  const suffix = `${meta.suffix ?? ''}.png`;
  const removed = partial
    ? []
    : listPngs(expectedDir)
        .filter((f) => f.endsWith(suffix))
        .map((f) => f.slice(0, -suffix.length))
        .filter((shot) => !ran.has(shot));
  const geometryFailures = geometry.filter(
    (t) => t.status === 'unexpected' || t.status === 'flaky',
  );

  const rows = zero ? [] : rowFiles(repoRoot, base);
  const named = rows.flatMap((p) =>
    rowFixtures(readFileSync(join(repoRoot, p), 'utf8')).map((id) => ({ id, row: basename(p) })),
  );
  const rowFor = (shot) => named.find((n) => covers(n.id, fixtureOf(shot)));
  const uncovered = [...changed.map((t) => t.shot), ...removed].filter((s) => zero || !rowFor(s));

  const against = meta.against
    ? `${meta.against.ref} (${String(meta.against.sha).slice(0, 10)})`
    : `committed ${meta.platform} baselines`;
  console.log(
    `check-visual-diffs: head ${String(meta.head?.sha).slice(0, 10)}${meta.head?.dirty ? ' + working tree' : ''} vs ${against}`,
  );
  console.log(
    `  milestone ${milestone ?? '(unknown)'}, ${zero ? 'zero-change rule' : `rows changed since ${base.slice(0, 12)}: ${rows.map((r) => basename(r)).join(', ') || 'none'}`}`,
  );
  console.log(
    `  ${visual.length} shots: ${changed.length} changed, ${added.length} added, ${removed.length} removed, ${broken.length} broken` +
      (partial ? ' (partial run: removals not checked)' : '') +
      `; geometry: ${geometry.length} checks, ${geometryFailures.length} failing`,
  );
  for (const t of changed) {
    const row = rowFor(t.shot);
    console.log(`  changed  ${t.shot}${row ? `  (${row.row}: ${row.id})` : ''}`);
  }
  for (const s of removed) console.log(`  removed  ${s}${rowFor(s) ? `  (${rowFor(s).row})` : ''}`);
  for (const t of added) console.log(`  added    ${t.shot}`);
  for (const t of broken) console.log(`  broken   ${t.shot}: ${t.error.split('\n')[0]}`);
  for (const t of geometryFailures) console.log(`  geometry ${t.title}: ${t.error.split('\n')[0]}`);

  if (milestone && opts.copy && changed.length > 0) {
    const out = join(mainRoot, 'notes/overhaul-audit/visual-diffs', milestone.toLowerCase());
    mkdirSync(out, { recursive: true });
    const items = [];
    for (const t of changed) {
      const flat = t.shot.replace(/\//g, '__');
      const files = [['reference', expectedPath(t.shot)]];
      for (const a of t.attachments) {
        if (a.path && /-(actual|diff)\.png$/.test(a.path))
          files.push([/-actual\.png$/.test(a.path) ? 'actual' : 'diff', a.path]);
      }
      const copied = [];
      for (const [kind, src] of files) {
        if (!existsSync(src)) continue;
        const name = `${flat}.${kind}.png`;
        copyFileSync(src, join(out, name));
        copied.push([kind, name]);
      }
      items.push(
        `<section><h2>${t.shot}</h2>${copied.map(([k, n]) => `<figure><img src="${n}" alt="${t.shot} ${k}"><figcaption>${k}</figcaption></figure>`).join('')}</section>`,
      );
    }
    writeFileSync(
      join(out, 'index.html'),
      `<!doctype html><meta charset="utf-8"><title>${milestone} visual diffs</title><style>body{font:13px system-ui;margin:16px}figure{display:inline-block;margin:0 8px 12px 0}img{max-width:640px;border:1px solid #ddd;display:block}</style><h1>${milestone}: ${changed.length} changed shots vs ${against}</h1>${items.join('\n')}`,
    );
    console.log(`  diff images: ${out}`);
  }

  const failures = [];
  if (uncovered.length) {
    failures.push(
      zero
        ? `${milestone ?? 'this run'} must not change any fixture (zero-change rule): ${uncovered.join(', ')}`
        : `changed or removed fixtures without a visual-ledger row from this milestone: ${[...new Set(uncovered.map(fixtureOf))].join(', ')}`,
    );
  }
  if (broken.length) {
    failures.push(`${broken.length} visual test(s) failed without a screenshot diff`);
  }
  if (!opts.allowPartial && (visual.length === 0 || geometry.length === 0)) {
    failures.push(
      `the run did not include both projects (${visual.length} shots, ${geometry.length} geometry checks): ` +
        'run npm run test:visual without --project, or pass --allow-partial',
    );
  }
  if (!opts.allowPartial && meta.filtered) {
    failures.push(
      'the run was narrowed (--grep or extra Playwright arguments); pass --allow-partial to accept it',
    );
  }
  if (geometryFailures.length) failures.push(`${geometryFailures.length} geometry check(s) failed`);
  if (failures.length) {
    for (const f of failures) console.error(`check-visual-diffs: FAIL: ${f}`);
    process.exit(1);
  }
  console.log('check-visual-diffs: OK');
}

try {
  main();
} catch (error) {
  console.error(`check-visual-diffs: ${error.message}`);
  process.exit(2);
}
