// The measurement loop shared by run.mjs (one side) and ab.mjs (two sides): for each profile and
// scenario, `runs` interleaved rounds over the sides, alternating their order (ABBA…) so drift
// over a run affects both sides alike. Every run gets a fresh browser context, and the load
// average is sampled around each round to flag noisy rounds.

import { cpus, loadavg } from 'node:os';
import { launch, pageInfo, runScenario } from './browser.mjs';

/** True when `name`/`area` match a comma-separated filter (an area name or a name substring). */
export function matchesFilter(filter, name, area) {
  if (!filter) return true;
  return filter
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .some((t) => t === area || name.includes(t));
}

export function isNoisy(load, cores = cpus().length, perCore = 0.5) {
  return load > cores * perCore;
}

function fmt(v) {
  return v === null || v === undefined ? '–' : Number(v).toFixed(v < 10 ? 3 : 1);
}

/**
 * @param {object} o
 * @param {object} o.chromium          playwright's chromium
 * @param {string} o.raster            gpu | software
 * @param {boolean} [o.headed]
 * @param {{ id: string, url: string, api?: string }[]} o.sides
 * @param {string[]} o.profiles
 * @param {(scenarios: {name: string, area: string, primary: string}[]) => string[]} o.select
 * @param {number} o.runs
 * @param {number} [o.loadPerCore]
 * @param {(line: string) => void} o.log
 * @param {string[]} [o.only]          re-measure only these scenarios (retries)
 * @param {boolean} [o.heapProfile]    also sample allocations with the CDP heap profiler
 */
export async function measure(o) {
  const started = Date.now();
  let browser = await launch(o.chromium, o.raster, { headed: o.headed });
  const ensure = async () => {
    if (!browser.isConnected()) {
      o.log('  (relaunching the browser after a crash)');
      browser = await launch(o.chromium, o.raster, { headed: o.headed });
    }
    return browser;
  };
  const info = {};
  for (const side of o.sides)
    info[side.id] = await pageInfo(await ensure(), side.url, 'desktop', side.api);
  const catalog = new Map();
  for (const side of o.sides) for (const s of info[side.id].scenarios) catalog.set(s.name, s);
  const names = o.only ?? o.select([...catalog.values()]);
  const profiles = {};
  const rounds = [];
  try {
    for (const profile of o.profiles) {
      o.log(
        `\n=== ${profile} (${o.raster} raster): ${names.length} scenarios × ${o.runs} runs ===`,
      );
      profiles[profile] = {};
      for (const name of names) {
        const meta = catalog.get(name);
        const entry = Object.fromEntries(o.sides.map((s) => [s.id, []]));
        const skip = new Set();
        let noisy = false;
        for (let round = 0; round < o.runs; round++) {
          const order = round % 2 === 0 ? o.sides : [...o.sides].reverse();
          const load0 = loadavg()[0];
          for (const side of order) {
            if (skip.has(side.id)) continue;
            const result = await runScenario(await ensure(), {
              url: side.url,
              profile,
              name,
              api: side.api,
              heapProfile: o.heapProfile,
            });
            result.area ??= meta?.area;
            result.primary ??= meta?.primary;
            entry[side.id].push(result);
            if (result.unsupported) skip.add(side.id);
          }
          const load1 = loadavg()[0];
          const roundNoisy = isNoisy(Math.max(load0, load1), undefined, o.loadPerCore);
          noisy ||= roundNoisy;
          rounds.push({ profile, name, round, load: [load0, load1], noisy: roundNoisy });
        }
        profiles[profile][name] = { runs: entry, noisy };
        const summary = o.sides
          .map((side) => {
            const runs = entry[side.id];
            if (runs[0]?.unsupported) return `${side.id} n/a`;
            const err = runs.find((r) => r.error);
            if (err) return `${side.id} ERROR ${err.error.slice(0, 80)}`;
            const p = runs[0]?.primary ?? 'busy';
            return `${side.id} ${runs.map((r) => fmt(r[p]?.median)).join(' ')}${runs.every((r) => r.valid) ? '' : ' INVALID'}`;
          })
          .join(' | ');
        o.log(`  ${name.padEnd(30)} ${summary}${noisy ? '  (noisy)' : ''}`);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return { info, profiles, rounds, durationMs: Date.now() - started };
}
