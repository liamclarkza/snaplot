#!/usr/bin/env node
// Finding trace check (plan P12, §12 M3b scope 5, M14, M17).
//
//   node scripts/overhaul/trace-check.mjs [--milestone M<N> [--partial]] [--coverage] [--release]
//                                         [--run <suites>|all|none] [--no-run] [--skip <suites>]
//                                         [--no-browser] [--<suite>-report <file>]
//
// Reads scripts/overhaul/trace-ids.json (authoritative), the expected-failure
// ledger (scripts/ledger.mjs) and the test reports, then checks:
//
// 1. Locks. Every required id (or part) whose owners have all merged (an
//    `ovh-<m>-done` tag reachable from HEAD) is locked:
//    - a test lock needs a PASSING test (not an expected failure) whose own
//      title contains `[id]` or `[id:part]` in a report read below. A whole-id
//      tag locks the id's declared parts; an ad-hoc part tag (`[uisite-03:library]`)
//      does not lock the whole id;
//    - a gate lock needs every owning milestone's handoff (docs/handoff/m<N>.md)
//      to name the id in the Closes block of its Summary: the paragraph that
//      starts with "Closes", or the table or list right after a "Closes …:"
//      line. A part needs its part id, or the whole id without a suffix.
//    With `--milestone M<N>`, the ids M<N> owns are checked as if M<N> had
//    merged: run it in the milestone's worktree before asking to merge.
// 2. No closed id remains in the ledger (no marker names it or an ad-hoc part of it).
// 3. Ledger hygiene: every marker names an id that exists in trace-ids.json; a
//    marker in a milestone file (test/ledger/m10-*.test.ts,
//    test/browser/m12a-*.spec.ts, test/visual/expected/m10.ts) names only ids
//    that milestone owns; wont-do files name only §6 won't-do parts; the
//    ledger's own errors (scripts/ledger.mjs) are problems here too.
// 4. Every marker ran as an expected failure, in the suite that executes it
//    (see scripts/ledger.mjs): per suite, each marker is matched to an expected
//    failure with the same test file and title, the counts are equal, and an
//    expected failure the ledger does not list is a problem.
// 5. `--milestone M<N>`: no marker is left in M<N>'s own files. Flip it, or
//    move it to a later owner's file and say so in the handoff. `--partial`
//    (a timeboxed milestone, EXECUTION.md rule 5) reports these as notes.
// 6. `--release`: the ledger holds only §6 won't-do part ids.
// `--coverage` instead prints every required unit that has neither a ledger
// marker, nor a gate lock, nor a closing milestone in M0–M2 (whose passing test
// lock then counts), and fails if there is any.
//
// Suites and reports (packages/snaplot/test-results/):
// - vitest: vitest-ledger.json, from scripts/overhaul/vitest-ledger-reporter.mjs
//   (vitest's JSON reporter cannot tell an expected failure from a pass);
// - consumers: consumers.json, written by scripts/check-consumers.mjs (vitest's
//   JSON reporter; a passed test that the ledger lists as `it.fails` failed as
//   expected, because an unexpected pass is reported as failed);
// - browser: browser.json (test/browser/playwright.config.ts);
// - visual: visual/report.json (M3a's packages/snaplot/playwright.config.ts,
//   geometry project);
// - conformance: conformance.json (M13's test/conformance/playwright.config.ts).
// By default every suite that exists is run first (`npm run build` precedes the
// consumers). `--run <suites>` runs only those, `--no-run` (= `--run none`)
// reads the last reports. `--skip <suites>` neither runs nor verifies a suite
// (its markers are listed as unverified notes); `--no-browser` = `--skip browser`.
// A suite that has markers but no report is a problem. Playwright runs wait
// while the bench lock exists (plan §11.1).

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUITES, scanLedger } from '../ledger.mjs';
import { loadTrace, MILESTONES, mainCheckout, mergedMilestones, units } from './trace-ids.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const pkg = path.join(root, 'packages/snaplot');
const results = path.join(pkg, 'test-results');
const EARLY = new Set(['M0', 'M1', 'M2']);

const REPORTS = {
  vitest: path.join(results, 'vitest-ledger.json'),
  consumers: path.join(results, 'consumers.json'),
  browser: path.join(results, 'browser.json'),
  visual: path.join(results, 'visual', 'report.json'),
  conformance: path.join(results, 'conformance.json'),
};
const COMMANDS = {
  vitest: 'npm run trace-check (vitest with scripts/overhaul/vitest-ledger-reporter.mjs)',
  consumers: 'npm run build && npm run check:package',
  browser: 'npm run test:browser',
  visual: 'npm run test:visual -- --project geometry',
  conformance: 'npm run build && npm run conformance:install && npm run test:conformance',
  site: '(no reader yet: extend trace-check.mjs)',
};

function flag(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function list(value) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
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
// Runs

/** Block while another session holds the bench lock (stale after 2 hours). */
function waitForBenchLock() {
  let lock;
  try {
    lock = path.join(mainCheckout(), '.claude', 'bench.lock');
  } catch {
    return;
  }
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  let told = false;
  while (existsSync(lock)) {
    let age = 0;
    try {
      age = Date.now() - statSync(lock).mtimeMs;
    } catch {
      break;
    }
    if (age > 2 * 3600_000) break;
    if (!told) console.error(`trace-check: waiting for the bench lock ${lock}`);
    told = true;
    Atomics.wait(sleeper, 0, 0, 5000);
  }
}

function spawn(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: pkg,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.status ?? 1;
}

const RUNNERS = {
  vitest: {
    available: () => true,
    run: () =>
      spawn(
        'npx',
        [
          'vitest',
          'run',
          '--reporter=dot',
          `--reporter=${path.join(here, 'vitest-ledger-reporter.mjs')}`,
        ],
        { SNAPLOT_LEDGER_REPORT: REPORTS.vitest },
      ),
  },
  consumers: {
    available: () => existsSync(path.join(pkg, 'scripts/check-consumers.mjs')),
    run: () => spawn('npm', ['run', 'build']) || spawn('node', ['scripts/check-consumers.mjs']),
  },
  browser: {
    available: () => existsSync(path.join(pkg, 'test/browser/playwright.config.ts')),
    run: () => {
      waitForBenchLock();
      return spawn('npx', ['playwright', 'test', '-c', 'test/browser/playwright.config.ts']);
    },
  },
  visual: {
    available: () => existsSync(path.join(pkg, 'test/visual/run.mjs')),
    // run.mjs waits for the bench lock itself.
    run: () => spawn('node', ['test/visual/run.mjs', '--project', 'geometry']),
  },
  conformance: {
    available: () => existsSync(path.join(pkg, 'test/conformance/run.mjs')),
    // install.mjs and run.mjs wait for the bench lock themselves.
    run: () =>
      spawn('npm', ['run', 'build']) ||
      spawn('node', ['test/conformance/install.mjs']) ||
      spawn('node', ['test/conformance/run.mjs']),
  },
};

// ---------------------------------------------------------------------------
// Reports

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

const toRepo = (file) => path.relative(root, file).split(path.sep).join('/');

/** vitest-ledger-reporter output → normalised test records. */
function vitestTests(report) {
  return report.tests.map((test) => ({
    suite: 'vitest',
    file: toRepo(test.file),
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

/** A consumer-project path → its source under packages/snaplot/test/consumers/. */
function consumerFile(name) {
  const parts = name.split(/[\\/]/);
  const at = parts.findIndex((part) => part.startsWith('snaplot-consumer-'));
  const rest = at >= 0 ? parts.slice(at + 1) : parts.slice(-1);
  return ['packages/snaplot/test/consumers', ...rest].join('/');
}

/** vitest JSON reporter output of the consumer project → normalised test records. */
function consumerTests(report, markerKeys) {
  const out = [];
  for (const file of report.testResults ?? []) {
    const source = consumerFile(file.name);
    for (const test of file.assertionResults ?? []) {
      let outcome;
      if (test.status === 'passed')
        outcome = markerKeys.has(`${source}\0${test.title}`) ? 'expected-fail' : 'pass';
      else if (test.status === 'failed') outcome = 'fail';
      else outcome = 'skip';
      out.push({ suite: 'consumers', file: source, title: test.title, outcome });
    }
  }
  return out;
}

/** Playwright JSON reporter output → normalised test records. */
function playwrightTests(report, suite) {
  const out = [];
  const testDir = report.config?.rootDir ?? '';
  const walk = (node) => {
    for (const spec of node.specs ?? []) {
      for (const test of spec.tests) {
        const file = toRepo(path.resolve(testDir, spec.file));
        let outcome;
        if (test.status === 'skipped') outcome = 'skip';
        else if (test.status !== 'expected') outcome = 'fail';
        else outcome = test.expectedStatus === 'failed' ? 'expected-fail' : 'pass';
        out.push({ suite, file, title: spec.title, outcome });
      }
    }
    for (const child of node.suites ?? []) walk(child);
  };
  for (const node of report.suites ?? []) walk(node);
  return out;
}

// ---------------------------------------------------------------------------
// Matching

const baseOf = (id) => id.split(':')[0];

/** Does a marker id `tag` name the trace unit `key` (for "still in the ledger")? */
function names(tag, key) {
  if (tag === key) return true;
  if (!key.includes(':') && tag.startsWith(`${key}:`)) return true; // ad-hoc part of a whole id
  if (!tag.includes(':') && key.startsWith(`${tag}:`)) return true; // a whole-id tag names its parts
  return false;
}

/** Does a passing test's id `tag` lock the unit `key`? An ad-hoc part never locks the whole id. */
function locks(tag, key) {
  if (tag === key) return true;
  return !tag.includes(':') && key.startsWith(`${tag}:`);
}

function titleIds(title) {
  return [
    ...title.matchAll(/\[((?:[a-z]+(?:-[a-z]+)*-\d{2}(?::[a-z0-9-]+)?)|(?:perf:[a-z0-9-]+))\]/g),
  ].map((match) => match[1]);
}

function fileMilestone(file) {
  const base = path.basename(file);
  if (/^wont-do/.test(base)) return "won't do";
  let match = base.match(/^m(\d+)([a-c]?)-.*\.(test|spec)\.[cm]?[jt]sx?$/);
  if (!match && file.includes('/test/visual/expected/'))
    match = base.match(/^m(\d+)([a-c]?)\.[cm]?[jt]s$/);
  return match ? `M${match[1]}${match[2]}` : null;
}

/** The Closes block of a handoff's Summary section (see the header). */
export function closesBlock(markdown) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => /^## Summary\b/.test(line));
  if (start < 0) return '';
  let end = lines.findIndex((line, i) => i > start && /^## /.test(line));
  if (end < 0) end = lines.length;
  const summary = lines.slice(start + 1, end);
  const out = [];
  for (let i = 0; i < summary.length; i++) {
    if (!/^\s*(?:[-*]\s+)?(?:\*\*)?Closes\b/.test(summary[i])) continue;
    let j = i;
    for (; j < summary.length && summary[j].trim() !== ''; j++) out.push(summary[j]);
    // "Closes, with their locks:" alone, then a table or a list.
    if (j === i + 1 && /:\s*(?:\*\*)?\s*$/.test(summary[i])) {
      while (j < summary.length && summary[j].trim() === '') j++;
      if (j < summary.length && /^\s*[|*-]/.test(summary[j]))
        for (; j < summary.length && summary[j].trim() !== ''; j++) out.push(summary[j]);
    }
    i = j;
  }
  return out.join('\n');
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Does a Closes block name the unit `key`? */
export function closesNames(block, key) {
  if (new RegExp(`(?<![\\w-])${escapeRegExp(key)}(?![\\w-]|:[a-z0-9])`).test(block)) return true;
  if (!key.includes(':')) return false;
  return new RegExp(`(?<![\\w-])${escapeRegExp(baseOf(key))}(?![\\w:-])`).test(block);
}

function handoffRecords(milestone, key) {
  const file = path.join(root, 'docs/handoff', `${milestone.toLowerCase()}.md`);
  if (!existsSync(file)) return false;
  return closesNames(closesBlock(readFileSync(file, 'utf8')), key);
}

// ---------------------------------------------------------------------------

function main(args) {
  const milestone = normaliseMilestone(flag(args, '--milestone'));
  const coverageMode = args.includes('--coverage');
  const release = args.includes('--release');
  const partial = args.includes('--partial');
  const skip = new Set(list(flag(args, '--skip')));
  if (args.includes('--no-browser')) skip.add('browser');
  for (const suite of skip)
    if (!SUITES.includes(suite)) throw new Error(`trace-check: unknown suite ${suite}`);
  const runValue = args.includes('--no-run') ? 'none' : (flag(args, '--run') ?? 'all');
  const runnable = Object.keys(RUNNERS).filter((suite) => RUNNERS[suite].available());
  const toRun = (runValue === 'all' ? runnable : runValue === 'none' ? [] : list(runValue)).filter(
    (suite) => !skip.has(suite),
  );
  for (const suite of toRun)
    if (!RUNNERS[suite]?.available())
      throw new Error(`trace-check: cannot run suite ${suite} in this tree`);

  const trace = loadTrace();
  const merged = mergedMilestones(root);
  const problems = [];
  const notes = [];
  const markers = scanLedger(root);

  // Reports. A run must write a fresh report.
  const reportFile = {
    vitest: flag(args, '--vitest-report') ?? REPORTS.vitest,
    consumers: flag(args, '--consumers-report') ?? REPORTS.consumers,
    browser: flag(args, '--browser-report') ?? REPORTS.browser,
    visual: flag(args, '--visual-report') ?? REPORTS.visual,
    conformance: flag(args, '--conformance-report') ?? REPORTS.conformance,
  };
  const mtime = (file) => (existsSync(file) ? statSync(file).mtimeMs : 0);
  for (const suite of toRun) {
    const before = mtime(reportFile[suite]);
    const status = RUNNERS[suite].run();
    if (status) problems.push(`${suite} run is red (a test failed or an expected failure passed)`);
    if (mtime(reportFile[suite]) <= before)
      problems.push(`${suite} run wrote no report at ${toRepo(reportFile[suite])}`);
  }
  const markerKeys = (suite) =>
    new Set(
      markers.filter((m) => m.suite === suite).map((m) => `${m.testFile ?? m.file}\0${m.title}`),
    );
  const readers = {
    vitest: (report) => vitestTests(report),
    consumers: (report) => consumerTests(report, markerKeys('consumers')),
    browser: (report) => playwrightTests(report, 'browser'),
    visual: (report) => playwrightTests(report, 'visual'),
    conformance: (report) => playwrightTests(report, 'conformance'),
  };
  const tests = [];
  const verified = new Set();
  for (const suite of SUITES) {
    const count = markers.filter((m) => m.suite === suite).length;
    if (skip.has(suite)) {
      if (count) notes.push(`${count} ${suite} markers not verified (--skip ${suite})`);
      continue;
    }
    const file = reportFile[suite];
    if (!file || !existsSync(file)) {
      if (count || suite === 'vitest')
        problems.push(
          `no ${suite} report${file ? ` at ${toRepo(file)}` : ''} for ${count} markers: run ${COMMANDS[suite]}, or pass --skip ${suite}`,
        );
      continue;
    }
    try {
      tests.push(...readers[suite](readJson(file)));
      verified.add(suite);
    } catch (error) {
      problems.push(`unreadable ${suite} report ${toRepo(file)}: ${error.message}`);
    }
  }

  const passing = tests.filter((test) => test.outcome === 'pass');
  const lockedByTest = (key) =>
    passing.some((test) => titleIds(test.title).some((tag) => locks(tag, key)));
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
    if (marker.problem) problems.push(`ledger: ${marker.problem} at ${where}`);
    const owner = fileMilestone(marker.file);
    if (marker.owner && marker.owner !== owner)
      problems.push(
        `geometry entry owned by ${marker.owner} in an ${owner ?? '(unowned)'} file (${where})`,
      );
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

  // 4. Every marker executed as an expected failure, per suite.
  const counted = {};
  const markerCount = {};
  for (const suite of SUITES) {
    const suiteMarkers = markers.filter((m) => m.suite === suite);
    markerCount[suite] = suiteMarkers.length;
    if (!verified.has(suite)) continue;
    const ran = tests.filter((t) => t.suite === suite && t.outcome === 'expected-fail');
    counted[suite] = ran.length;
    const pool = new Map();
    for (const test of ran) {
      const key = `${test.file}\0${test.title}`;
      pool.set(key, (pool.get(key) ?? 0) + 1);
    }
    for (const marker of suiteMarkers) {
      const key = `${marker.testFile ?? marker.file}\0${marker.title}`;
      const left = pool.get(key) ?? 0;
      if (left > 0) pool.set(key, left - 1);
      else
        problems.push(
          `marker did not run as an expected failure (${suite}): ${marker.file}:${marker.line} ${marker.title}`,
        );
    }
    for (const [key, left] of pool) {
      if (left <= 0) continue;
      const [file, title] = key.split('\0');
      problems.push(
        `${left} expected failure(s) in ${suite} not in the ledger: ${file} › ${title}`,
      );
    }
    if (ran.length !== suiteMarkers.length)
      problems.push(
        `${suite} ran ${ran.length} expected failures; the ledger has ${suiteMarkers.length} ${suite} markers`,
      );
  }
  const ledgerLine = () => {
    const shown = SUITES.filter((s) => markerCount[s] || verified.has(s));
    return (
      `ledger: ${markers.length} markers (${shown.map((s) => `${s} ${markerCount[s]}`).join(', ')}); ` +
      `executed expected failures: ${shown.map((s) => `${s} ${verified.has(s) ? counted[s] : 'not read'}`).join(', ')}`
    );
  };

  // Coverage mode.
  if (coverageMode) {
    const uncovered = new Map();
    const by = { ledger: 0, gate: 0, test: 0, early: 0 };
    for (const unit of allUnits.filter((u) => !u.perf)) {
      const earlyOwner = unit.owners.some((owner) => EARLY.has(owner));
      const early = unit.owners.length > 0 && unit.owners.every((owner) => EARLY.has(owner));
      if (inLedger(unit.key).length > 0) by.ledger++;
      else if (unit.lock.kind === 'gate') by.gate++;
      // A passing test covers only what an M0–M2 milestone closed; an open
      // defect needs a marker (P12).
      else if (earlyOwner && lockedByTest(unit.key)) by.test++;
      else if (early) by.early++;
      else uncovered.set(unit.key, unit);
    }
    const bases = new Set([...uncovered.values()].map((unit) => unit.base));
    for (const unit of uncovered.values())
      console.log(`uncovered: ${unit.key.padEnd(40)} owners ${unit.owners.join(', ') || '—'}`);
    console.log(
      `\ncoverage: ${bases.size} of ${trace.requiredCount} required ids uncovered` +
        ` (units covered by a ledger marker ${by.ledger}, a gate lock ${by.gate},` +
        ` an M0–M2 passing test lock ${by.test}, closed in M0–M2 ${by.early})`,
    );
    console.log(ledgerLine());
    for (const note of notes) console.log(`  note: ${note}`);
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
      const missing = unit.owners.filter((owner) => !handoffRecords(owner, unit.key));
      ok = missing.length === 0;
      if (!ok)
        problems.push(
          `gate lock for [${unit.key}] (${unit.lock.name}) not in the Summary "Closes" block of ${missing.map((m) => `docs/handoff/${m.toLowerCase()}.md`).join(', ')}`,
        );
    } else {
      ok = lockedByTest(unit.key);
      if (!ok)
        problems.push(
          `no passing test titled [${unit.key}]${skip.size ? ` (suites skipped: ${[...skip].join(', ')})` : ''}`,
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
    // 5. The milestone's own files hold no marker.
    for (const marker of markers.filter((m) => fileMilestone(m.file) === milestone)) {
      const message = `${milestone} file still holds a marker: ${marker.file}:${marker.line} ${marker.title} (flip it, or move it to a later owner's file and say so in the handoff)`;
      (partial ? notes : problems).push(message);
    }
  }

  // 6. Release.
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
  console.log(`  ${ledgerLine()}`);
  for (const note of notes) console.log(`  note: ${note}`);
  for (const problem of problems) console.error(`trace-check: ${problem}`);
  console.log(problems.length ? `FAIL (${problems.length} problems)` : 'OK');
  return problems.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
