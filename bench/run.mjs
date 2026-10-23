#!/usr/bin/env node
// One-sided bench run of this checkout (for profiling and quick checks; the gate is ab.mjs).
//
//   npm run bench -- [--profile desktop|mobile|both] [--filter <area|name>[,…]] [--set M<N>]
//                    [--runs 1] [--raster gpu|software] [--headed] [--heap-profile]
//                    [--out bench/results/latest.json]
//
// Builds the bench page, runs each scenario on a fresh page and writes the aggregates as JSON
// (for compare.mjs) plus a Markdown table next to it.

import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { loadPlaywright, serve } from './lib/browser.mjs';
import { load1, machine, parseArgs, playwrightVersion, profilesFrom } from './lib/env.mjs';
import { loadGate, setScenarios } from './lib/gate.mjs';
import { waitWhileLocked } from './lib/lock.mjs';
import { matchesFilter, measure } from './lib/measure.mjs';
import { lockPath, resultsDir } from './lib/paths.mjs';
import { runReport } from './lib/report.mjs';
import { buildPage, worktreeSide } from './lib/sides.mjs';
import { aggregate } from './lib/stats.mjs';

const USAGE = `usage: npm run bench -- [--profile desktop|mobile|both] [--filter <area|name>[,…]]
       [--set M<N>] [--runs N] [--raster gpu|software] [--headed] [--heap-profile]
       [--out <file.json>]`;

const argv = process.argv.slice(2);
const args = parseArgs(
  argv,
  {
    profile: { type: 'string', default: 'both' },
    filter: { type: 'string', default: '' },
    set: { type: 'string' },
    runs: { type: 'string', default: '1' },
    raster: { type: 'string', default: 'gpu' },
    headed: { type: 'boolean', default: false },
    'heap-profile': { type: 'boolean', default: false },
    out: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
  USAGE,
);
if (args.help) {
  console.log(USAGE);
  process.exit(0);
}

const log = (line) => console.log(line);
const gate = loadGate();
const inSet = args.set ? setScenarios(gate, args.set) : null;
const profiles = profilesFrom(args.profile);
const runs = Number(args.runs);
const out = args.out ?? join(resultsDir, 'latest.json');

// A one-sided run does not hold the lock, but it must not disturb another session's measurement.
await waitWhileLocked(lockPath(), { log });
const side = worktreeSide();
const page = await buildPage(side, 'run');
const server = await serve(page);
const { chromium } = await loadPlaywright();
const loadStart = load1();
const started = Date.now();
try {
  const measured = await measure({
    chromium,
    raster: args.raster,
    headed: args.headed,
    sides: [{ id: 'head', url: server.url }],
    profiles,
    select: (catalog) =>
      catalog
        .filter((s) => inSet === null || inSet.includes(s.name))
        .filter((s) => matchesFilter(args.filter, s.name, s.area))
        .map((s) => s.name),
    runs,
    loadPerCore: gate.noise.loadPerCore,
    heapProfile: args['heap-profile'],
    log,
  });
  const aggregates = {};
  for (const [profile, scenarios] of Object.entries(measured.profiles)) {
    aggregates[profile] = {};
    for (const [name, entry] of Object.entries(scenarios)) {
      aggregates[profile][name] = aggregate(entry.runs.head);
    }
  }
  const browser = { ...measured.info.head };
  delete browser.scenarios;
  const meta = {
    date: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    argv,
    side: { ref: side.ref, sha: side.sha, short: side.short, api: measured.info.head.api },
    machine: machine(),
    node: process.version,
    playwright: playwrightVersion(),
    browser,
    raster: args.raster,
    runs,
    profiles,
    load: { start: loadStart, end: load1() },
    noisyRounds: measured.rounds.filter((r) => r.noisy).length,
    totalRounds: measured.rounds.length,
    loadPerCore: gate.noise.loadPerCore,
    noiseThreshold: cpus().length * gate.noise.loadPerCore,
  };
  const markdown = runReport({ meta, aggregates });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    `${JSON.stringify({ kind: 'run', meta, aggregates, profiles: measured.profiles }, null, 1)}\n`,
  );
  writeFileSync(out.replace(/\.json$/, '.md'), markdown);
  console.log(`\n${markdown}`);
  console.log(`wrote ${out}`);
} finally {
  await server.close();
}
