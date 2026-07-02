#!/usr/bin/env node
// Compare a benchmark run against the tracked baseline.
//
//   node bench/compare.mjs                                # latest vs baseline
//   node bench/compare.mjs --current bench/results/pr.json --max-ratio 1.6
//
// Exits non-zero when any scenario's median frame time regresses beyond
// --max-ratio, or when a scenario that was valid in the baseline is now
// invalid or missing. Ratios are only meaningful when both runs come from
// the same machine; CI should compare two runs from the same job, or use
// a generous ratio to absorb runner variance.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const benchDir = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
function argValue(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const baselinePath = argValue('--baseline', join(benchDir, 'baselines', 'baseline.json'));
const currentPath = argValue('--current', join(benchDir, 'results', 'latest.json'));
const maxRatio = Number(argValue('--max-ratio', '1.5'));

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const current = JSON.parse(readFileSync(currentPath, 'utf8'));

let failures = 0;

for (const [profileName, baseProfile] of Object.entries(baseline.profiles)) {
  const curProfile = current.profiles[profileName];
  if (!curProfile) {
    console.log(`profile ${profileName}: missing from current run, skipping`);
    continue;
  }
  console.log(`\n#### ${profileName} (baseline ${baseline.meta.sha} -> current ${current.meta.sha})\n`);
  console.log('| scenario | base median | cur median | ratio | verdict |');
  console.log('| :-- | --: | --: | --: | :-- |');

  for (const base of baseProfile.results) {
    if (!base.frame || !base.valid) continue;
    const cur = curProfile.results.find((r) => r.name === base.name);
    if (!cur?.frame) {
      console.log(`| ${base.name} | ${base.frame.medianMs} | missing | | FAIL |`);
      failures++;
      continue;
    }
    if (!cur.valid) {
      console.log(`| ${base.name} | ${base.frame.medianMs} | ${cur.frame.medianMs} | | FAIL (invalid) |`);
      failures++;
      continue;
    }
    // Guard against ratio blowups on sub-millisecond medians: a 0.4ms ->
    // 0.9ms change is noise, not a regression worth failing CI over.
    const floor = 2;
    const baseMs = Math.max(base.frame.medianMs, floor);
    const curMs = Math.max(cur.frame.medianMs, floor);
    const ratio = curMs / baseMs;
    const verdict = ratio > maxRatio ? 'FAIL' : ratio < 1 / maxRatio ? 'improved' : 'ok';
    if (verdict === 'FAIL') failures++;
    console.log(
      `| ${base.name} | ${base.frame.medianMs} | ${cur.frame.medianMs} | ${ratio.toFixed(2)} | ${verdict} |`,
    );
  }
}

if (failures > 0) {
  console.error(`\n${failures} scenario(s) regressed beyond ${maxRatio}x`);
  process.exit(1);
}
console.log('\nno regressions beyond threshold');
