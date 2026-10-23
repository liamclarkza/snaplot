// Gate evaluation: ratios, heap, self-test and budgets for one A/B (or one compare) against
// bench/gate.json. Pure functions; the drivers do the I/O.

import { readFileSync } from 'node:fs';
import { gatePath } from './paths.mjs';
import { flooredRatio, isTimeMetric, round } from './stats.mjs';

export function loadGate(path = gatePath) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function setNames(gate) {
  return Object.keys(gate.sets);
}

/** The set's scenario names, or `null` for a `*` set (every scenario). */
export function setScenarios(gate, setName = 'default') {
  const set = gate.sets[setName];
  if (!set)
    throw new Error(`unknown --set ${setName} (gate.json has ${setNames(gate).join(', ')})`);
  return set.scenarios === '*' ? null : set.scenarios;
}

/** Scenarios named anywhere in gate.json (explicitly, not through `*`). */
export function listedScenarios(gate) {
  const listed = new Set();
  for (const set of Object.values(gate.sets)) {
    if (Array.isArray(set.scenarios)) for (const name of set.scenarios) listed.add(name);
  }
  for (const b of gate.budgets ?? []) listed.add(b.scenario);
  for (const o of gate.overrides ?? []) listed.add(o.scenario);
  return listed;
}

function overridesFor(gate, setName, scenario) {
  return (gate.overrides ?? []).filter(
    (o) => o.scenario === scenario && (o.set === '*' || o.set === setName),
  );
}

/**
 * The ratio checks for one scenario: the primary metric against the set's ratio (or an override),
 * plus any extra overridden metrics.
 */
export function ratioChecks(gate, setName, scenario, primaryPath) {
  const set = gate.sets[setName] ?? gate.sets.default;
  const overrides = overridesFor(gate, setName, scenario);
  const checks = [];
  const primaryOverride = overrides.find((o) => o.metric === primaryPath);
  checks.push({ metric: primaryPath, max: primaryOverride?.max ?? set.ratio ?? gate.ratio });
  for (const o of overrides) {
    if (o.metric !== primaryPath) checks.push({ metric: o.metric, max: o.max });
  }
  return checks;
}

function ratioOf(gate, metric, head, base) {
  if (head === undefined || base === undefined) return null;
  if (metric.startsWith('heap.') || metric === 'allocKBPerOp') {
    return flooredRatio(head, base, gate.heap?.floorKB ?? 0);
  }
  return flooredRatio(head, base, isTimeMetric(metric) ? gate.floorMs : 0);
}

/**
 * Evaluates one profile's scenarios.
 *
 * @param {object} args
 * @param {object} args.gate        parsed gate.json
 * @param {string} args.setName     the --set (or 'default')
 * @param {Record<string, object>} args.base  scenario name → aggregate (lib/stats.mjs), or {}
 * @param {Record<string, object>} args.head
 * @param {boolean} [args.selfTest] base and head are the same commit: check 1.0 ± tolerance
 * @param {boolean} [args.allowNew] accept head-only scenarios that gate.json does not list
 * @param {Record<string, boolean>} [args.noisy] scenario → whether any of its rounds ran loaded
 */
export function evaluateProfile({ gate, setName, base, head, selfTest, allowNew, noisy = {} }) {
  const required = setScenarios(gate, setName);
  const isRequired = (name) => required === null || required.includes(name);
  const listed = listedScenarios(gate);
  const names = [...new Set([...Object.keys(head), ...Object.keys(base)])];
  const rows = [];
  for (const name of names) {
    const h = head[name];
    const b = base[name];
    const row = {
      name,
      area: h?.area ?? b?.area,
      required: isRequired(name),
      primary: (h ?? b)?.primaryPath ?? 'busy.median',
      base: b ? (b.values[(h ?? b).primaryPath] ?? null) : null,
      head: h ? (h.values[(h ?? b).primaryPath] ?? null) : null,
      ratio: null,
      limit: null,
      checks: [],
      verdict: 'ok',
      blocking: false,
      noisy: false,
      noise: '',
      spread: null,
      bestRatio: null,
      notes: [],
    };
    // Noise: a loaded round, or runs on one side that disagree beyond `noise.spread`.
    const spread = Math.max(spreadOf(gate, b), spreadOf(gate, h));
    row.spread = round(spread, 2);
    const spreadNoisy = spread > (gate.noise?.spread ?? Number.POSITIVE_INFINITY);
    row.noisy = noisy[name] === true || spreadNoisy;
    row.noise = [noisy[name] ? 'load' : '', spreadNoisy ? `spread ${row.spread}×` : '']
      .filter(Boolean)
      .join(', ');
    const fail = (verdict, note) => {
      row.verdict = verdict;
      if (note) row.notes.push(note);
      if (row.required) row.blocking = true;
    };
    rows.push(row);
    if (!h) {
      fail('missing', 'the head did not run this scenario');
      continue;
    }
    if (h.errors.length && h.measured === 0) {
      fail('error', h.errors[0]);
      continue;
    }
    if (h.unsupported) {
      row.verdict = 'n/a';
      row.notes.push(`head API: ${h.unsupported}`);
      if (row.required) fail('unsupported', 'a required scenario must run on the head');
      continue;
    }
    if (!h.valid) {
      fail('invalid', 'the head run measured nothing real (validity check failed)');
      continue;
    }
    if (!b) {
      if (listed.has(name) || allowNew) {
        row.verdict = 'new';
        row.blocking = false;
      } else {
        row.verdict = 'unlisted';
        row.notes.push('head-only scenario missing from bench/gate.json (or pass --allow-new)');
        row.blocking = true;
      }
      continue;
    }
    if (b.unsupported) {
      row.verdict = 'n/a';
      row.notes.push(`base API: ${b.unsupported}`);
      continue;
    }
    if (!b.valid || b.measured === 0) {
      row.verdict = 'base invalid';
      row.notes.push(b.errors[0] ?? 'the base run measured nothing real');
      continue;
    }
    // Ratios: the primary metric and any overridden metrics.
    const checks = ratioChecks(gate, setName, name, row.primary);
    let worst = 'ok';
    for (const check of checks) {
      const ratio = ratioOf(gate, check.metric, h.values[check.metric], b.values[check.metric]);
      const c = { metric: check.metric, max: check.max, ratio: round(ratio, 3), verdict: 'ok' };
      if (ratio === null) c.verdict = 'n/a';
      else if (selfTest) {
        if (Math.abs(ratio - 1) > gate.selfTest.tolerance) c.verdict = 'self-test';
      } else if (ratio > check.max) c.verdict = 'slower';
      else if (ratio < 1 / Math.max(check.max, 1.0001) && check.max >= 1) c.verdict = 'improved';
      row.checks.push(c);
      if (c.verdict === 'slower' || c.verdict === 'self-test') worst = c.verdict;
      else if (c.verdict === 'improved' && worst === 'ok' && check.metric === row.primary)
        worst = 'improved';
    }
    const primaryCheck = row.checks[0];
    row.ratio = primaryCheck?.ratio ?? null;
    // Diagnostic only: the best (lowest) run on each side, robust to one-sided slow runs.
    row.bestRatio = round(
      ratioOf(gate, row.primary, minOf(h.primaryRuns), minOf(b.primaryRuns)),
      3,
    );
    row.limit = selfTest ? `1±${gate.selfTest.tolerance}` : primaryCheck?.max;
    // Heap per operation, where both sides measured it: the sampled allocation when both ran with
    // --heap-profile, else the usedJSHeapSize increments.
    const heapMetric =
      h.values.allocKBPerOp !== undefined && b.values.allocKBPerOp !== undefined
        ? 'allocKBPerOp'
        : 'heap.grossKBPerOp';
    const hh = h.values[heapMetric];
    const bh = b.values[heapMetric];
    if (hh !== undefined && bh !== undefined) {
      const ratio = ratioOf(gate, heapMetric, hh, bh);
      const c = {
        metric: heapMetric,
        max: gate.heap.ratio,
        ratio: round(ratio, 3),
        verdict: ratio !== null && ratio > gate.heap.ratio && !selfTest ? 'slower' : 'ok',
      };
      row.checks.push(c);
      if (c.verdict === 'slower') worst = 'heap';
    }
    if (worst === 'slower' || worst === 'self-test' || worst === 'heap') {
      fail(worst === 'heap' ? 'heap' : worst === 'self-test' ? 'self-test' : 'slower');
      if (!row.required) row.verdict = `${row.verdict} (not required)`;
    } else row.verdict = worst;
  }
  rows.sort((a, b) => order(a.area) - order(b.area) || a.name.localeCompare(b.name));
  return rows;
}

function minOf(values = []) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? Math.min(...finite) : undefined;
}

/** max/min of one side's per-run primary values (raised to the floor), 1 for a single run. */
function spreadOf(gate, agg) {
  const runs = (agg?.primaryRuns ?? [])
    .filter(Number.isFinite)
    .map((v) => Math.max(v, gate.floorMs));
  return runs.length > 1 ? Math.max(...runs) / Math.min(...runs) : 1;
}

const AREAS = ['legacy', 'api', 'streaming', 'interaction', 'scale'];
function order(area) {
  const i = AREAS.indexOf(area);
  return i < 0 ? AREAS.length : i;
}

/**
 * Absolute budgets on the head. `profile`/`raster` `*` match any. A `count` budget blocks in its
 * sets; a `time` budget blocks only when the set is in `budgetsBlockIn` (or `strict`).
 */
export function evaluateBudgets({ gate, setName, heads, raster, strict = false }) {
  const out = [];
  for (const b of gate.budgets ?? []) {
    const profiles = b.profile === '*' ? Object.keys(heads) : [b.profile];
    for (const profile of profiles) {
      // Only budgets on scenarios this run measured are reported.
      const agg = heads[profile]?.[b.scenario];
      if (!agg) continue;
      const row = {
        id: b.id,
        scenario: b.scenario,
        metric: b.metric,
        profile,
        raster: b.raster,
        limit: b.max !== undefined ? `≤ ${b.max}` : `≥ ${b.min}`,
        value: null,
        status: 'pending',
        blocking: false,
        sets: b.sets,
        was: b.was ?? null,
      };
      out.push(row);
      if (b.raster !== '*' && b.raster !== raster) {
        row.status = `not run (needs --raster ${b.raster})`;
        continue;
      }
      if (agg.unsupported) {
        row.status = 'n/a';
        continue;
      }
      const value = agg.values[b.metric];
      if (value === undefined || value === null) {
        row.status = 'no value';
        continue;
      }
      row.value = value;
      const met = b.max !== undefined ? value <= b.max : value >= b.min;
      row.status = met ? 'met' : 'missed';
      const inSet = b.sets.includes(setName) || setName === 'M14';
      const blocks =
        b.kind === 'count' ? inSet : inSet && (strict || gate.budgetsBlockIn.includes(setName));
      row.blocking = !met && blocks;
    }
  }
  return out;
}
