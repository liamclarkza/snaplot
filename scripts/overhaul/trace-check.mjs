#!/usr/bin/env node
// Finding trace check (plan P12, §12 M3b scope 5, M14, M17).
//
//   node scripts/overhaul/trace-check.mjs [--milestone M<N>] [--coverage] [--release]
//                                         [--no-run] [--no-browser]
//                                         [--vitest-report <file>] [--browser-report <file,...>]
//
// Reads scripts/overhaul/trace-ids.json (authoritative), the expected-failure
// ledger (scripts/ledger.mjs) and the test reports, then checks:
//
// 1. Locks. Every required id (or part) whose owners have all merged (an
//    `ovh-<m>-done` tag reachable from HEAD) is locked:
//    - a test lock needs a PASSING test (not an expected failure) whose own
//      title contains `[id]` or `[id:part]`, in the vitest or Playwright report;
//    - a gate lock needs every owning milestone's handoff
//      (docs/handoff/m<N>.md) to record the id (its Closes list or gate notes).
//    With `--milestone M<N>`, the ids M<N> owns are checked as if M<N> had
//    merged: run it in the milestone's worktree before asking to merge.
// 2. No closed id remains in the ledger (no it.fails / test.fail names it).
// 3. Ledger hygiene: every marker id exists in trace-ids.json; a marker in a
//    milestone file (test/ledger/m10-*.test.ts, test/browser/m12a-*.spec.ts)
//    names only ids that milestone owns; wont-do files name only §6 won't-do
//    parts.
// 4. Every marker ran as an expected failure: the number of markers equals
//    the expected failures vitest and Playwright report (none silently skipped).
// 5. `--release`: the ledger holds only §6 won't-do part ids.
// `--coverage` instead prints every required id that has neither a ledger
// marker, nor a gate lock, nor a passing test lock, nor a closing milestone in
// M0–M2, and fails if there is any.
//
// The vitest report comes from scripts/overhaul/vitest-ledger-reporter.mjs
// (vitest's JSON reporter cannot tell an expected failure from a pass). By
// default both suites are run; `--no-run` reads the last reports from
// packages/snaplot/test-results/, and `--no-browser` skips Playwright (ids
// locked only by browser specs are then reported as unverified).

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanLedger } from '../ledger.mjs';
import { loadTrace, MILESTONES, mergedMilestones, units } from './trace-ids.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const pkg = path.join(root, 'packages/snaplot');
const results = path.join(pkg, 'test-results');
const VITEST_REPORT = path.join(results, 'vitest-ledger.json');
const BROWSER_REPORT = path.join(results, 'browser.json');
const EARLY = new Set(['M0', 'M1', 'M2']);

function flag(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function normaliseMilestone(value) {
  if (!value) return undefined;
  const match = value.match(/^m(\d+)([a-c]?)$/i);
  if (!match) throw new Error(`trace-check: bad milestone ${value}`);
  const id = `M${match[1]}${match[2].toLowerCase()}`;
  if (!MILESTONES.includes(id)) throw new Error(`trace-check: unknown milestone ${id}`);
  return id;
}

// ---------------------------------------------------------------------------
// Reports

function runVitest() {
  const result = spawnSync(
    'npx',
    [
      'vitest',
      'run',
      '--reporter=dot',
      `--reporter=${path.join(here, 'vitest-ledger-reporter.mjs')}`,
    ],
    {
      cwd: pkg,
      env: { ...process.env, SNAPLOT_LEDGER_REPORT: VITEST_REPORT },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  return result.status ?? 1;
}

function runBrowser() {
  const result = spawnSync(
    'npx',
    ['playwright', 'test', '-c', 'test/browser/playwright.config.ts'],
    { cwd: pkg, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return result.status ?? 1;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** vitest-ledger-reporter output → normalised test records. */
function vitestTests(report) {
  return report.tests.map((test) => ({
    runner: 'vitest',
    file: path.relative(root, test.file).split(path.sep).join('/'),
    title: test.title,
    outcome:
      test.state === 'passed'
        ? test.fails
          ? 'expected-fail'
          : 'pass'
        : test.state === 'skipped' || test.state === 'pending'
          ? 'skip'
          : 'fail',
  }));
}

/** Playwright JSON reporter output → normalised test records. */
function playwrightTests(report, source) {
  const out = [];
  const testDir = report.config?.rootDir ?? '';
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        const file = path
          .relative(root, path.resolve(testDir, spec.file))
          .split(path.sep)
          .join('/');
        let outcome;
        if (test.status === 'skipped') outcome = 'skip';
        else if (test.status !== 'expected') outcome = 'fail';
        else outcome = test.expectedStatus === 'failed' ? 'expected-fail' : 'pass';
        out.push({ runner: 'playwright', file, title: spec.title, outcome, source });
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  return out;
}

// ---------------------------------------------------------------------------
// Matching

const baseOf = (id) => id.split(':')[0];

/** Does a marker or title id `tag` name the trace unit `key`? */
function names(tag, key) {
  if (tag === key) return true;
  if (!key.includes(':') && tag.startsWith(`${key}:`)) return true; // ad-hoc part of a whole id
  if (!tag.includes(':') && key.startsWith(`${tag}:`)) return true; // a whole-id tag names its parts
  return false;
}

function titleIds(title) {
  return [
    ...title.matchAll(/\[((?:[a-z]+(?:-[a-z]+)*-\d{2}(?::[a-z0-9-]+)?)|(?:perf:[a-z0-9-]+))\]/g),
  ].map((match) => match[1]);
}

function fileMilestone(file) {
  const base = path.basename(file);
  if (/^wont-do/.test(base)) return "won't do";
  const match = base.match(/^m(\d+)([a-c]?)-.*\.(test|spec)\.[cm]?[jt]sx?$/);
  return match ? `M${match[1]}${match[2]}` : null;
}

function handoffMentions(milestone, id) {
  const file = path.join(root, 'docs/handoff', `${milestone.toLowerCase()}.md`);
  if (!existsSync(file)) return false;
  return readFileSync(file, 'utf8').includes(baseOf(id));
}

// ---------------------------------------------------------------------------

function main(args) {
  const milestone = normaliseMilestone(flag(args, '--milestone'));
  const coverageMode = args.includes('--coverage');
  const release = args.includes('--release');
  const noRun = args.includes('--no-run');
  const noBrowser = args.includes('--no-browser');

  const trace = loadTrace();
  const merged = mergedMilestones(root);
  const problems = [];
  const notes = [];

  // Reports.
  const vitestReport = flag(args, '--vitest-report') ?? VITEST_REPORT;
  const browserReports = (flag(args, '--browser-report') ?? BROWSER_REPORT)
    .split(',')
    .filter(Boolean);
  let vitestStatus = 0;
  let browserStatus = 0;
  if (!noRun) {
    vitestStatus = runVitest();
    if (!noBrowser) browserStatus = runBrowser();
  }
  if (vitestStatus) problems.push('vitest run is red (a test failed or an it.fails passed)');
  if (browserStatus) problems.push('Playwright run is red (a spec failed or a test.fail passed)');
  if (!existsSync(vitestReport)) {
    console.error(`trace-check: no vitest report at ${vitestReport}; run without --no-run`);
    return 2;
  }
  const tests = vitestTests(readJson(vitestReport));
  let browserRead = false;
  if (!noBrowser) {
    for (const file of browserReports) {
      if (!existsSync(file)) {
        problems.push(`missing Playwright report ${path.relative(root, file)}`);
        continue;
      }
      tests.push(...playwrightTests(readJson(file), file));
      browserRead = true;
    }
  }

  const markers = scanLedger(root);
  const passing = tests.filter((test) => test.outcome === 'pass');
  const lockedByTest = (key) =>
    passing.some((test) => titleIds(test.title).some((tag) => names(tag, key)));
  const inLedger = (key) => markers.filter((marker) => marker.ids.some((tag) => names(tag, key)));

  // Trace units: required finding ids (and parts) plus the §3.4 perf guards.
  const allUnits = [];
  for (const [id, entry] of Object.entries(trace.ids)) {
    if (!entry.required) continue;
    for (const unit of units(id, entry)) allUnits.push({ ...unit, base: id, perf: false });
  }
  for (const [id, guard] of Object.entries(trace.perfGuards ?? {})) {
    allUnits.push({
      key: id,
      base: id,
      owners: guard.owners,
      status: guard.status,
      lock: guard.lock,
      perf: true,
    });
  }

  // 3. Ledger hygiene.
  const knownBase = (tag) =>
    tag.startsWith('perf:') ? Boolean(trace.perfGuards?.[tag]) : Boolean(trace.ids[baseOf(tag)]);
  for (const marker of markers) {
    const where = `${marker.file}:${marker.line}`;
    if (!marker.ids.length) problems.push(`marker without an id at ${where}`);
    const owner = fileMilestone(marker.file);
    for (const tag of marker.ids) {
      if (!knownBase(tag)) {
        problems.push(`unknown id [${tag}] at ${where}`);
        continue;
      }
      if (tag.startsWith('perf:')) continue;
      const entry = trace.ids[baseOf(tag)];
      const part = tag.includes(':') ? entry.parts?.[tag.slice(tag.indexOf(':') + 1)] : null;
      if (tag.includes(':') && !part)
        notes.push(`ad-hoc part [${tag}] at ${where} (owners of ${baseOf(tag)})`);
      const owners = part ? part.owners : entry.owners;
      const wontDo = part ? part.status === 'wont-do' : entry.status === 'wont-do';
      if (owner === "won't do" && !wontDo)
        problems.push(`[${tag}] in a won't-do file is not a §6 won't-do part (${where})`);
      if (owner && owner !== "won't do" && !owners.includes(owner))
        problems.push(
          `[${tag}] in an ${owner} file but owned by ${owners.join(', ') || 'nobody'} (${where})`,
        );
    }
  }

  // 4. Every marker executed as an expected failure.
  const expected = tests.filter((test) => test.outcome === 'expected-fail');
  const counted = { vitest: 0, playwright: 0 };
  for (const test of expected) counted[test.runner]++;
  const markerCount = { vitest: 0, playwright: 0 };
  for (const marker of markers) markerCount[marker.runner]++;
  for (const marker of markers) {
    if (marker.runner === 'playwright' && !browserRead) continue;
    const ran = expected.some(
      (test) =>
        test.runner === marker.runner && test.file === marker.file && test.title === marker.title,
    );
    if (!ran)
      problems.push(
        `marker did not run as an expected failure: ${marker.file}:${marker.line} ${marker.title}`,
      );
  }
  if (markerCount.vitest !== counted.vitest)
    problems.push(
      `vitest ran ${counted.vitest} expected failures; the ledger has ${markerCount.vitest} vitest markers`,
    );
  if (browserRead && markerCount.playwright !== counted.playwright)
    problems.push(
      `Playwright ran ${counted.playwright} expected failures; the ledger has ${markerCount.playwright} Playwright markers`,
    );

  // Coverage mode.
  if (coverageMode) {
    const uncovered = new Map();
    const by = { ledger: 0, gate: 0, test: 0, early: 0 };
    for (const unit of allUnits.filter((u) => !u.perf)) {
      const early = unit.owners.length > 0 && unit.owners.every((owner) => EARLY.has(owner));
      if (inLedger(unit.key).length > 0) by.ledger++;
      else if (unit.lock.kind === 'gate') by.gate++;
      else if (lockedByTest(unit.key)) by.test++;
      else if (early) by.early++;
      else uncovered.set(unit.key, unit);
    }
    const bases = new Set([...uncovered.values()].map((unit) => unit.base));
    for (const unit of uncovered.values())
      console.log(`uncovered: ${unit.key.padEnd(40)} owners ${unit.owners.join(', ') || '—'}`);
    console.log(
      `\ncoverage: ${bases.size} of ${trace.requiredCount} required ids uncovered` +
        ` (units covered by a ledger marker ${by.ledger}, a gate lock ${by.gate},` +
        ` a passing test lock ${by.test}, closed in M0–M2 ${by.early})`,
    );
    console.log(
      `ledger: ${markers.length} markers (vitest ${markerCount.vitest}, playwright ${markerCount.playwright}); executed expected failures: vitest ${counted.vitest}, playwright ${browserRead ? counted.playwright : 'not run'}`,
    );
    for (const problem of problems) console.error(`trace-check: ${problem}`);
    return bases.size || problems.length ? 1 : 0;
  }

  // 1 and 2. Locks for closed units.
  const done = new Set([...merged, ...(milestone ? [milestone] : [])]);
  const checked = allUnits.filter((unit) => {
    if (unit.status === 'wont-do' || unit.owners.length === 0) return false;
    if (!unit.owners.every((owner) => done.has(owner))) return false;
    return milestone ? unit.owners.includes(milestone) : true;
  });
  let locked = 0;
  for (const unit of checked) {
    const markersLeft = inLedger(unit.key);
    for (const marker of markersLeft)
      problems.push(`closed [${unit.key}] still in the ledger at ${marker.file}:${marker.line}`);
    let ok;
    if (unit.lock.kind === 'gate') {
      const missing = unit.owners.filter((owner) => !handoffMentions(owner, unit.key));
      ok = missing.length === 0;
      if (!ok)
        problems.push(
          `gate lock for [${unit.key}] (${unit.lock.name}) not recorded in the handoff of ${missing.join(', ')}`,
        );
    } else {
      ok = lockedByTest(unit.key);
      if (!ok)
        problems.push(
          `no passing test titled [${unit.key}]${!browserRead ? ' (browser specs not read)' : ''}`,
        );
    }
    if (ok && markersLeft.length === 0) locked++;
  }
  if (milestone) {
    const pending = allUnits.filter(
      (unit) =>
        unit.owners.includes(milestone) && !checked.includes(unit) && unit.status !== 'wont-do',
    );
    for (const unit of pending)
      notes.push(
        `[${unit.key}] also waits on ${unit.owners.filter((o) => !done.has(o)).join(', ')}`,
      );
  }

  // 5. Release.
  if (release) {
    for (const marker of markers) {
      for (const tag of marker.ids) {
        if (tag.startsWith('perf:')) {
          problems.push(
            `release: perf guard [${tag}] still expected to fail (${marker.file}:${marker.line})`,
          );
          continue;
        }
        const entry = trace.ids[baseOf(tag)];
        const part = tag.includes(':') ? entry?.parts?.[tag.slice(tag.indexOf(':') + 1)] : null;
        const wontDo = part ? part.status === 'wont-do' : entry?.status === 'wont-do';
        if (!wontDo)
          problems.push(
            `release: [${tag}] is not a §6 won't-do part (${marker.file}:${marker.line})`,
          );
      }
    }
  }

  const scope = milestone
    ? `${milestone} (as merged)`
    : `merged: ${[...merged].sort((a, b) => MILESTONES.indexOf(a) - MILESTONES.indexOf(b)).join(', ') || 'none'}`;
  console.log(`trace-check: ${scope}`);
  console.log(`  closed units checked: ${checked.length}, locked: ${locked}`);
  console.log(
    `  ledger: ${markers.length} markers (vitest ${markerCount.vitest}, playwright ${markerCount.playwright}); executed expected failures: vitest ${counted.vitest}, playwright ${browserRead ? counted.playwright : 'not run'}`,
  );
  for (const note of notes) console.log(`  note: ${note}`);
  for (const problem of problems) console.error(`trace-check: ${problem}`);
  console.log(problems.length ? `FAIL (${problems.length} problems)` : 'OK');
  return problems.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
