#!/usr/bin/env node
// Same-run interleaved A/B (plan §3.4, §12 M4; gate G12).
//
//   npm run bench:ab -- --base <ref> [--head <ref>] [--profile desktop|mobile|both] [--runs 3]
//                       [--raster gpu|software] [--set M<N>] [--filter <group>] [--api v012|v1|v2]
//
// Both sides are built from git (or the working tree for the head), measured in the same browser
// in interleaved pairs, and compared as the median of medians against bench/gate.json. The run
// holds the bench lock while it measures, records the load average, and writes
// bench/results/ab-<base>-<head>.{md,json}. Exit code 1 means a blocking failure.

import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { loadPlaywright, serve } from './lib/browser.mjs';
import {
  diagnosticEnv,
  load1,
  machine,
  parseArgs,
  playwrightVersion,
  profilesFrom,
} from './lib/env.mjs';
import { evaluateBudgets, evaluateProfile, loadGate, setScenarios } from './lib/gate.mjs';
import { acquireLock, waitWhileLocked } from './lib/lock.mjs';
import { matchesFilter, measure } from './lib/measure.mjs';
import { fromInvocation, lockPath, resultsDir } from './lib/paths.mjs';
import { abReport } from './lib/report.mjs';
import {
  buildPage,
  labelFor,
  prepareRef,
  prepareWorktree,
  resolveRef,
  worktreeSide,
} from './lib/sides.mjs';
import { aggregate } from './lib/stats.mjs';

const USAGE = `usage: npm run bench:ab -- --base <ref> [--head <ref>] [--profile desktop|mobile|both]
       [--runs N] [--raster gpu|software] [--set M<N>] [--filter <area|name>[,…]]
       [--api v012|v1|v2 | --api base:v012,head:v1] [--allow-new] [--strict-budgets]
       [--retries N] [--skip-build] [--headed] [--heap-profile] [--out <file.md>]`;

const argv = process.argv.slice(2);
const args = parseArgs(
  argv,
  {
    base: { type: 'string' },
    head: { type: 'string' },
    profile: { type: 'string', default: 'both' },
    runs: { type: 'string' },
    raster: { type: 'string', default: 'gpu' },
    set: { type: 'string' },
    filter: { type: 'string', default: '' },
    api: { type: 'string' },
    'allow-new': { type: 'boolean', default: false },
    'strict-budgets': { type: 'boolean', default: false },
    retries: { type: 'string' },
    'skip-build': { type: 'boolean', default: false },
    headed: { type: 'boolean', default: false },
    'heap-profile': { type: 'boolean', default: false },
    out: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
  USAGE,
);
if (args.help || !args.base) {
  console.log(USAGE);
  process.exit(args.help ? 0 : 2);
}

const log = (line) => console.log(line);
const gate = loadGate();
const setName = args.set ?? 'default';
const required = setScenarios(gate, setName);
const profiles = profilesFrom(args.profile);
const runs = Number(args.runs ?? gate.runs);
const retries = Number(args.retries ?? gate.noise.retries);
if (!Number.isInteger(runs) || runs < 1) {
  console.error('--runs must be a positive integer');
  process.exit(2);
}

function apiFor(sideId) {
  if (!args.api) return undefined;
  if (!args.api.includes(':')) return args.api;
  for (const part of args.api.split(',')) {
    const [side, api] = part.split(':');
    if (side === sideId) return api;
  }
  return undefined;
}

const base = resolveRef(args.base);
const head = args.head ? resolveRef(args.head) : worktreeSide();
const selfTest = head.kind === 'ref' && head.sha === base.sha;

// Do not install or build while another session measures (plan §11.1).
await waitWhileLocked(lockPath(), { log });
const sides = {};
sides.base = await prepareRef(base, { log });
sides.head =
  head.kind === 'ref'
    ? await prepareRef(head, { log })
    : await prepareWorktree(head, { log, skipBuild: args['skip-build'] });

log('building the bench page for each side');
const pages = {};
pages.base = await buildPage(sides.base, `${base.label}-${base.short}`);
pages.head =
  sides.head.root === sides.base.root
    ? pages.base
    : await buildPage(sides.head, `${head.label}-${head.short.replace('+', '-')}`);

const lock = await acquireLock(lockPath(), { log, info: { tool: 'bench:ab', args: argv } });
const releaseLock = () => lock.release();
process.on('exit', releaseLock);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    releaseLock();
    process.exit(130);
  });
}

const servers = { base: await serve(pages.base), head: await serve(pages.head) };
const { chromium } = await loadPlaywright();
const loadStart = load1();
const started = Date.now();
// With --set, only that set runs; without it, every scenario runs and `default` is the required set.
const inSet = (name) => !args.set || required === null || required.includes(name);
const select = (catalog) =>
  catalog
    .filter((s) => inSet(s.name) && matchesFilter(args.filter, s.name, s.area))
    .map((s) => s.name);

const sideList = [
  { id: 'base', url: servers.base.url, api: apiFor('base') },
  { id: 'head', url: servers.head.url, api: apiFor('head') },
];

let measured;
try {
  measured = await measure({
    chromium,
    raster: args.raster,
    headed: args.headed,
    sides: sideList,
    profiles,
    select,
    runs,
    loadPerCore: gate.noise.loadPerCore,
    heapProfile: args['heap-profile'],
    log,
  });

  // Re-measure blocking failures whose rounds ran noisy, up to `retries` times (plan §3.4).
  let evaluation = evaluate(measured);
  const retried = [];
  for (let attempt = 1; attempt <= retries; attempt++) {
    const redo = {};
    for (const [profile, rows] of Object.entries(evaluation.profiles)) {
      const names = rows.filter((r) => r.blocking && r.noisy).map((r) => r.name);
      if (names.length) redo[profile] = names;
    }
    if (Object.keys(redo).length === 0) break;
    for (const [profile, names] of Object.entries(redo)) {
      log(
        `\nretry ${attempt}/${retries} (${profile}): ${names.join(', ')} failed while the machine was noisy`,
      );
      const again = await measure({
        chromium,
        raster: args.raster,
        headed: args.headed,
        sides: sideList,
        profiles: [profile],
        select,
        only: names,
        runs,
        loadPerCore: gate.noise.loadPerCore,
        heapProfile: args['heap-profile'],
        log,
      });
      for (const name of names) measured.profiles[profile][name] = again.profiles[profile][name];
      measured.rounds.push(...again.rounds);
      retried.push(...names.map((name) => `${profile} ${name}`));
    }
    evaluation = evaluate(measured);
  }
  evaluation.retried = retried;

  const meta = {
    date: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    argv,
    base: { ref: base.ref, sha: base.sha, short: base.short, api: measured.info.base.api },
    head: { ref: head.ref, sha: head.sha, short: head.short, api: measured.info.head.api },
    machine: machine(),
    node: process.version,
    playwright: playwrightVersion(),
    browser: measured.info.head,
    raster: args.raster,
    diagnostics: diagnosticEnv(),
    set: setName,
    setRatio: gate.sets[setName].ratio,
    floorMs: gate.floorMs,
    filter: args.filter,
    runs,
    profiles,
    selfTest,
    tolerance: gate.selfTest.tolerance,
    lock: { path: lockPath(), waitedMs: lock.waitedMs },
    load: { start: loadStart, end: load1() },
    noisyRounds: measured.rounds.filter((r) => r.noisy).length,
    totalRounds: measured.rounds.length,
    loadPerCore: gate.noise.loadPerCore,
    noiseThreshold: cpus().length * gate.noise.loadPerCore,
  };
  delete meta.browser.scenarios;
  const out = args.out
    ? fromInvocation(args.out)
    : join(resultsDir, `ab-${labelFor(base.ref)}-${labelFor(head.ref)}.md`);
  mkdirSync(dirname(out), { recursive: true });
  // The raw measurements first, so a failure in the report cannot lose them.
  writeFileSync(
    out.replace(/\.md$/, '') + '.json',
    `${JSON.stringify({ kind: 'ab', meta, evaluation, profiles: measured.profiles, rounds: measured.rounds }, null, 1)}\n`,
  );
  const markdown = abReport({ meta, evaluation });
  writeFileSync(out, markdown);
  console.log(`\n${markdown}`);
  console.log(`wrote ${out}`);
  process.exitCode = evaluation.failures.length ? 1 : 0;
} finally {
  await servers.base.close();
  await servers.head.close();
  releaseLock();
}

function evaluate(m) {
  const aggregates = {};
  const evaluated = {};
  const failures = [];
  for (const profile of Object.keys(m.profiles)) {
    aggregates[profile] = { base: {}, head: {} };
    const noisy = {};
    for (const [name, entry] of Object.entries(m.profiles[profile])) {
      aggregates[profile].base[name] = aggregate(entry.runs.base);
      aggregates[profile].head[name] = aggregate(entry.runs.head);
      noisy[name] = entry.noisy;
    }
    const rows = evaluateProfile({
      gate,
      setName,
      base: aggregates[profile].base,
      head: aggregates[profile].head,
      selfTest,
      allowNew: args['allow-new'],
      noisy,
    });
    evaluated[profile] = rows;
    for (const row of rows) {
      if (!row.blocking) continue;
      const failed = row.checks
        .filter((c) => c.verdict === 'slower' || c.verdict === 'self-test')
        .map(
          (c) => `${c.metric} ${c.ratio}× > ${selfTest ? `1±${gate.selfTest.tolerance}` : c.max}`,
        );
      const detail = failed.length ? ` (${failed.join(', ')})` : '';
      failures.push(
        `${profile} ${row.name}: ${row.verdict}${detail}${row.noisy ? ', noisy' : ''}${row.notes.length ? `: ${row.notes.join('; ')}` : ''}`,
      );
    }
  }
  const heads = Object.fromEntries(Object.entries(aggregates).map(([p, a]) => [p, a.head]));
  const budgets = evaluateBudgets({
    gate,
    setName,
    heads,
    raster: args.raster,
    strict: args['strict-budgets'],
  });
  for (const b of budgets) {
    if (b.blocking) failures.push(`budget ${b.id} (${b.profile}): ${b.value} not ${b.limit}`);
  }
  const ratios = Object.values(evaluated)
    .flat()
    .filter((r) => r.required && r.ratio !== null);
  const outside = ratios
    .filter((r) => Math.abs(r.ratio - 1) > gate.selfTest.tolerance)
    .map((r) => `${r.name} ${r.ratio}`);
  return {
    profiles: evaluated,
    aggregates,
    budgets,
    failures,
    selfTest: { total: ratios.length, within: ratios.length - outside.length, outside },
    retried: [],
  };
}
