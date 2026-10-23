#!/usr/bin/env node
// Compares two saved bench runs against bench/gate.json.
//
//   node bench/compare.mjs --base <a.json> --current <b.json> [--set M<N>] [--allow-new]
//
// Each file is a run.mjs output (`kind: 'run'`) or an ab.mjs output (`kind: 'ab'`, whose head is
// used; pass `--side base` to read its base instead). Ratios are only meaningful between runs from
// the same machine and session; the gate proper is the same-run A/B, `npm run bench:ab`. A
// scenario present only in the current run fails unless gate.json lists it or `--allow-new` is
// passed (gap-perf-gate-08). The tracked bench/baselines/ is history only and is not read.

import { readFileSync } from 'node:fs';
import { parseArgs } from './lib/env.mjs';
import { evaluateBudgets, evaluateProfile, loadGate } from './lib/gate.mjs';
import { fromInvocation } from './lib/paths.mjs';

const USAGE = `usage: node bench/compare.mjs --base <a.json> --current <b.json> [--set M<N>]
       [--allow-new] [--base-side base|head] [--current-side base|head]`;

const args = parseArgs(
  process.argv.slice(2),
  {
    base: { type: 'string' },
    baseline: { type: 'string' },
    current: { type: 'string' },
    set: { type: 'string', default: 'default' },
    'allow-new': { type: 'boolean', default: false },
    'base-side': { type: 'string', default: 'head' },
    'current-side': { type: 'string', default: 'head' },
    'max-ratio': { type: 'string' },
    help: { type: 'boolean', default: false },
  },
  USAGE,
);
if (args.help) {
  console.log(USAGE);
  process.exit(0);
}
const basePath = args.base ?? args.baseline;
if (!basePath || !args.current) {
  console.error(
    'compare needs --base and --current result files. bench/baselines/ is history only; ' +
      'gate a change with `npm run bench:ab -- --base <ref>` (same-run A/B).',
  );
  console.error(USAGE);
  process.exit(2);
}

function sideOf(path, side) {
  const doc = JSON.parse(readFileSync(fromInvocation(path), 'utf8'));
  if (doc.kind === 'run') return doc.aggregates;
  if (doc.kind === 'ab') {
    return Object.fromEntries(
      Object.entries(doc.evaluation.aggregates).map(([p, a]) => [p, a[side]]),
    );
  }
  throw new Error(
    `${path}: not a bench result (expected kind "run" or "ab"; old baselines are history only)`,
  );
}

const gate = loadGate();
if (args['max-ratio']) gate.sets[args.set].ratio = Number(args['max-ratio']);
const base = sideOf(basePath, args['base-side']);
const current = sideOf(args.current, args['current-side']);

let failures = 0;
const heads = {};
for (const profile of Object.keys(current)) {
  heads[profile] = current[profile];
  const rows = evaluateProfile({
    gate,
    setName: args.set,
    base: base[profile] ?? {},
    head: current[profile],
    allowNew: args['allow-new'],
  });
  console.log(`\n#### ${profile}\n`);
  console.log('| scenario | metric | base | current | ratio | limit | verdict | notes |');
  console.log('| :-- | :-- | --: | --: | --: | --: | :-- | :-- |');
  for (const row of rows) {
    if (row.blocking) failures++;
    const v = (x) => (x === null || x === undefined ? '–' : x);
    console.log(
      `| ${row.name} | ${row.primary} | ${v(row.base)} | ${v(row.head)} | ${v(row.ratio)} | ${v(row.limit)} | ${row.blocking ? `**${row.verdict}**` : row.verdict} | ${row.notes.join('; ')} |`,
    );
  }
}
for (const b of evaluateBudgets({ gate, setName: args.set, heads, raster: 'gpu' })) {
  if (b.blocking) {
    failures++;
    console.log(`budget ${b.id} (${b.profile}): ${b.value} not ${b.limit}`);
  }
}
if (failures > 0) {
  console.error(`\n${failures} blocking failure(s) against ${basePath}`);
  process.exit(1);
}
console.log('\nno blocking failures');
