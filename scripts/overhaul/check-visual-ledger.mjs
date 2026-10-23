#!/usr/bin/env node
// Plan P13: a visual default change is deliberate.
//
//   node scripts/overhaul/check-visual-ledger.mjs [--base overhaul-baseline] [--head HEAD] [--refresh]
//
// Fails when a commit in <base>..<head>
// - touches `**/__screenshots__/**`, or
// - has a `visual:` paragraph in its body (`visual: V31` or `visual: V31, V32`)
// without adding or editing its row file `docs/decisions/visual-ledger/V<n>.md` (each V-id the
// paragraph names must be among the row files the commit adds or edits). The only exceptions are
// the commits listed in `docs/decisions/visual-ledger/baseline-commits.txt` (M3a's initial
// baselines and M14's approved set).
//
// It also checks the format of every row file a commit adds (plan P13): the heading names its
// V-id; the Commit, Milestone, Fixtures, Before → after, Finding and Revert lines exist; the
// Commit line quotes that commit's subject, and the Fixtures line names a fixture in backticks.
//
// A listed baseline commit that a rebase rewrote still counts: it is matched by `git patch-id`,
// with a warning. `--refresh` rewrites baseline-commits.txt with the rebased SHAs.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LEDGER = 'docs/decisions/visual-ledger';
const BASELINES = `${LEDGER}/baseline-commits.txt`;
const ROW = /^docs\/decisions\/visual-ledger\/(V\d+)\.md$/;
const SHOTS = /(^|\/)__screenshots__\//;

function parseArgs(argv) {
  const opts = { base: 'overhaul-baseline', head: 'HEAD', refresh: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') opts.base = argv[++i];
    else if (a === '--head') opts.head = argv[++i];
    else if (a === '--refresh') opts.refresh = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return opts;
}

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const git = (args, input) =>
  execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    input,
    maxBuffer: 256 * 1024 * 1024,
  })
    .toString()
    .trim();

function patchId(sha) {
  try {
    const diff = git(['show', '--format=', '--binary', sha]);
    const out = git(['patch-id', '--stable'], `${diff}\n`);
    return out.split(' ')[0] || null;
  } catch {
    return null;
  }
}

/** `visual:` paragraphs: the V-ids they name (an empty list for a bare `visual:` line). */
function visualTags(body) {
  const tags = [];
  for (const line of body.split('\n')) {
    const m = /^visual:\s*(.*)$/i.exec(line.trim());
    if (m) tags.push(...(m[1].match(/V\d+/g) ?? []));
  }
  return { present: /^visual:/im.test(body), ids: [...new Set(tags)] };
}

function checkRowFormat(sha, path, subject) {
  const id = ROW.exec(path)[1];
  const text = git(['show', `${sha}:${path}`]);
  const problems = [];
  if (!new RegExp(`^# ${id}:\\s*\\S`, 'm').test(text))
    problems.push(`heading "# ${id}: …" missing`);
  // A value is on the field's line or, as a nested list, on the indented lines below it
  // (V0.md's Before → after). An empty field followed by the next field is missing.
  for (const field of ['Commit', 'Milestone', 'Fixtures', 'Before → after', 'Finding', 'Revert']) {
    if (!new RegExp(`\\*\\*${field}:\\*\\*[ \\t]*(\\S|\\n[ \\t]+\\S)`).test(text))
      problems.push(`**${field}:** missing`);
  }
  const commitLine = /\*\*Commit:\*\*(.*)/.exec(text)?.[1] ?? '';
  if (commitLine && !commitLine.includes(subject)) {
    problems.push(`**Commit:** does not quote the subject "${subject}"`);
  }
  if (!/`[^`]+`/.test(/\*\*Fixtures:\*\*(.*)/.exec(text)?.[1] ?? '')) {
    problems.push('**Fixtures:** names no fixture in backticks');
  }
  return problems.map((p) => `${path}: ${p}`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const listedText = (() => {
    try {
      return readFileSync(join(repoRoot, BASELINES), 'utf8');
    } catch {
      return '';
    }
  })();
  const listed = listedText
    .split('\n')
    .map((l) => l.replace(/#.*/, '').trim())
    .filter(Boolean);
  const commits = git(['rev-list', '--reverse', `${opts.base}..${opts.head}`])
    .split('\n')
    .filter(Boolean);
  const inRange = new Set(commits);
  const listedPatchIds = new Map(); // patch-id -> listed sha (for listed SHAs outside the range)
  for (const sha of listed) {
    if (!/^[0-9a-f]{40}$/.test(sha)) {
      console.error(`check-visual-ledger: ${BASELINES}: "${sha}" is not a full commit SHA`);
      process.exit(1);
    }
    if (!inRange.has(sha)) {
      const id = patchId(sha);
      if (id) listedPatchIds.set(id, sha);
    }
  }

  const errors = [];
  const warnings = [];
  const replacements = new Map();
  let visualCommits = 0;
  for (const sha of commits) {
    const subject = git(['log', '-1', '--format=%s', sha]);
    const body = git(['log', '-1', '--format=%B', sha]);
    const changes = git(['diff-tree', '--root', '--no-commit-id', '--name-status', '-r', sha])
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [status, ...paths] = line.split('\t');
        return { status: status[0], path: paths[paths.length - 1] };
      });
    const shots = changes.filter((c) => SHOTS.test(c.path));
    const rows = changes.filter((c) => ROW.test(c.path) && c.status !== 'D');
    const tags = visualTags(body);
    for (const row of rows.filter((r) => r.status === 'A'))
      errors.push(...checkRowFormat(sha, row.path, subject));
    if (shots.length === 0 && !tags.present) continue;
    visualCommits++;
    const short = `${sha.slice(0, 10)} ${subject}`;
    let exception = listed.includes(sha);
    if (!exception && listedPatchIds.size > 0 && shots.length > 0) {
      const old = listedPatchIds.get(patchId(sha));
      if (old) {
        exception = true;
        replacements.set(old, sha);
        warnings.push(
          `${short}: listed as ${old.slice(0, 10)} before a rebase; run with --refresh`,
        );
      }
    }
    const rowIds = rows.map((r) => ROW.exec(r.path)[1]);
    if (exception) {
      console.log(
        `  baseline  ${short} (${shots.length} screenshots${rowIds.length ? `, ${rowIds.join(', ')}` : ''})`,
      );
      continue;
    }
    if (rowIds.length === 0) {
      errors.push(
        `${short}: ${shots.length ? `touches ${shots.length} screenshot file(s)` : 'has a visual: paragraph'} but adds or edits no ${LEDGER}/V<n>.md`,
      );
      continue;
    }
    const missing = tags.ids.filter((id) => !rowIds.includes(id));
    if (missing.length)
      errors.push(
        `${short}: visual: names ${missing.join(', ')} but the commit does not add or edit ${missing.map((m) => `${m}.md`).join(', ')}`,
      );
    console.log(`  visual    ${short} → ${rowIds.join(', ')}`);
  }

  if (opts.refresh && replacements.size > 0) {
    let text = listedText;
    for (const [old, sha] of replacements) text = text.replace(old, sha);
    writeFileSync(join(repoRoot, BASELINES), text);
    console.log(`check-visual-ledger: refreshed ${replacements.size} SHA(s) in ${BASELINES}`);
  }
  for (const sha of listed) {
    if (!inRange.has(sha) && ![...replacements.keys()].includes(sha)) {
      warnings.push(`${BASELINES}: ${sha.slice(0, 10)} is not in ${opts.base}..${opts.head}`);
    }
  }
  for (const w of warnings) console.warn(`check-visual-ledger: warning: ${w}`);
  console.log(
    `check-visual-ledger: ${commits.length} commits in ${opts.base}..${opts.head}, ${visualCommits} with visual changes, ${listed.length} listed baseline commit(s)`,
  );
  if (errors.length) {
    for (const e of errors) console.error(`check-visual-ledger: FAIL: ${e}`);
    process.exit(1);
  }
  console.log('check-visual-ledger: OK');
}

try {
  main();
} catch (error) {
  console.error(`check-visual-ledger: ${error.message}`);
  process.exit(2);
}
