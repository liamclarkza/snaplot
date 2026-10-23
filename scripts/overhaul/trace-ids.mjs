#!/usr/bin/env node
// Finding traceability (plan §6, §14, P12, §12 M3b scope 4).
//
//   node scripts/overhaul/trace-ids.mjs [--force] [--check] [--plan <file>] [--results <file>]
//   node scripts/overhaul/trace-ids.mjs --render [--milestone M<N>] [--by milestone|root-cause|lock]
//
// Without `--render` it generates `scripts/overhaul/trace-ids.json` from three
// inputs, which live only in the main checkout (gitignored, so a worktree reads
// them by absolute path through the git common dir):
// - `notes/overhaul-audit/_results.json`: severity, verdict, category, title;
// - `notes/overhaul-audit/plan.md`: every milestone's **Closes** list (§12),
//   the §6 root-cause table and the §6 won't-do table;
// - the LOCKS table below: which ids are locked by a named gate instead of a
//   test whose title contains `[id]`.
//
// The JSON is authoritative once committed (plan §0): later milestones edit it
// by hand (for example M11 moves `gap-scale-longevity-06:shared-loop` to
// closed). So generation refuses to overwrite an existing file unless
// `--force` is given; `--check` only reports whether a regeneration would
// differ. `--render` prints views of the committed JSON for a handoff.
//
// Required ids (plan §0): every confirmed finding at any severity, plus every
// high-severity judgement finding (verdict n/a). 192 at the baseline.
//
// Part ids such as `backlog-15:categorical` keep their suffix everywhere. An id
// with parts is closed when every part that is not won't-do is closed.
//
// `status` is static: `wont-do` (plan §6) or `tracked`. Whether a tracked unit
// is closed is never stored; it is computed from the `ovh-<m>-done` tags of its
// owners (trace-check, `--render`), so the file stays valid across merges.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const TRACE_FILE = path.join(here, 'trace-ids.json');

/** Milestones in plan order (§0 table, M16 split into its three tracks). */
export const MILESTONES = [
  'M0',
  'M1',
  'M2',
  'M3a',
  'M3b',
  'M4',
  'M5',
  'M6a',
  'M6b',
  'M7',
  'M8',
  'M9a',
  'M9b',
  'M10',
  'M11',
  'M12a',
  'M12b',
  'M13',
  'M14',
  'M15a',
  'M15b',
  'M16a',
  'M16b',
  'M16c',
  'M17',
];

/**
 * Named gate locks (plan §6 "How the tests are written": a required id with no
 * automatable test has a named gate lock instead). Every other id is locked by
 * a passing test whose title contains `[id]` (or `[id:part]`). A gate lock
 * passes when an owning milestone's handoff records it (see trace-check.mjs).
 * Keys may be base ids or part ids.
 */
const LOCKS = {
  // M0: repository protection and cleanup.
  'repo-02': 'gate: baseline tag, bundle and tarball; git ls-files experiments = 0; clean npm ci',
  'repo-03': 'gate: clean npm ci (no lab workspace)',
  'repo-12': 'gate: biome format --check',
  'repo-17': 'gate: docs/backlog.md consolidated',
  'repo-20': 'gate: clean npm ci',
  'demos-11': 'gate: git ls-files experiments site = 0',
  'demos-17': 'gate: git ls-files experiments site = 0',
  'demos-19': 'gate: git ls-files experiments site = 0',
  'docs-15': 'gate: git ls-files experiments site = 0',
  'uisite-18': 'gate: git ls-files experiments site = 0',
  'backlog-26': 'gate: docs/backlog.md consolidated',
  // M2: deletions, measured by the metrics gate and the rg exit.
  'arch-09':
    'gate: M2 rg exit (SyncGroup|syncKey|setStoreData|ChartInstance|legendTablePlugin) is empty',
  'arch-19': 'gate: metrics (largest file ≤ 850) and check-architecture',
  'backlog-24': 'gate: M2 rg exit is empty',
  'dataapi-18': 'gate: M2 rg exit is empty',
  'repo-11': 'gate: metrics code lines drop ≥ 1,000',
  // M3a / M4: test and bench infrastructure.
  'repo-10': 'gate: test:visual --against HEAD twice shows zero diffs',
  'gap-perf-gate-02': 'gate: bench:ab self A/B within 1.0 ± 0.07; gate.json required sets',
  'gap-perf-gate-07': 'gate: bench:ab heap per operation reported',
  'gap-perf-gate-08': 'gate: bench:ab --base v0.12.0 --filter legacy completes (API adapters)',
  'backlog-23': 'gate: bench:ab full suite on both profiles',
  'gap-competitive-05:harness': 'gate: bench:ab firstpaint-line-1m and competitor-free harness',
  // M5: packaging and size.
  'frameworks-10': 'gate: check:package (tsc consumers under node16 and nodenext; attw)',
  'repo-01': 'gate: check:package',
  'repo-05': 'gate: check:package',
  'repo-07': 'gate: check:package',
  'repo-08': 'gate: check:package',
  'repo-09': 'gate: check:package',
  'repo-15:maps': 'gate: check:package (no sourcesContent in maps)',
  'repo-16': 'gate: check:package',
  'repo-18': 'gate: ci.yml parses and runs every gate',
  'backlog-22': 'gate: check:package',
  'research-06': 'gate: check:package',
  'gap-environments-08': 'gate: check:package',
  'gap-competitive-06:budget': 'gate: check:size',
  'frameworks-19':
    'gate: check-consumers one core copy in SSR [frameworks-19] (test.fails until M13)',
  'repo-15:ssr-dup': 'gate: check-consumers one core copy in SSR [frameworks-19]',
  // Perf findings measured by named bench budgets (plan §3.4).
  'gap-perf-gate-05':
    'gate: bench reingest-rows-200k-title ≤ 2/8 ms and react-rerender-200k-inline ≤ 3 ms',
  'gap-competitive-02': 'gate: bench mount-24-charts and per-chart idle canvas memory',
  'gap-competitive-03': 'gate: bench firstpaint-line-1m ≤ 45/150 ms',
  'gap-competitive-01:paint': 'gate: bench firstpaint-line-1m',
  'gap-competitive-01:ingest': 'gate: bench ingest-cols-1m ≤ 40/135 ms',
  'gap-perf-gate-03':
    'gate: bench hover-sync-{line,scatter,unsorted}-200k ≤ 0.2 ms per move on mobile',
  'gap-perf-gate-04': 'gate: bench ingest-cols-1m ≤ 40/135 ms',
  // Palettes (plan §5.3: check-palettes enforces the dark palette).
  'visuals-13:dark': 'gate: check:palettes [visuals-13:dark] (blocking from M11)',
  // Architecture and size targets.
  'arch-08': 'gate: metrics legend implementations = 1 list legend + 1 legend table',
  'arch-14': 'gate: metrics largest file ≤ 850 (cap 900); check-architecture; M9b probe snapshot',
  // Docs, site and demos (plan RC18, RC19).
  'docs-01': 'gate: site smoke [docs-01] (IA pages 4–6 in three tabs)',
  'docs-02': 'gate: TypeDoc notDocumented as an error = 0',
  'docs-03:types': 'gate: check:examples (strict tsc over every tab)',
  'docs-03:examples': 'gate: check:examples (strict tsc over every tab)',
  'docs-04': 'gate: site smoke [docs-04] (copied text equals the source and renders)',
  'docs-05': 'gate: site smoke [docs-05] (page 3 sizing)',
  'docs-06': 'gate: check-migration and copy lint',
  'docs-07': 'gate: check-migration and copy lint',
  'docs-08': 'gate: CHANGELOG lint',
  'docs-09': 'gate: site smoke [docs-09]',
  'docs-10': 'gate: site smoke [docs-10]',
  'docs-11': 'gate: site smoke [docs-11]',
  'docs-12': 'gate: site smoke [docs-12]',
  'docs-13': 'gate: site smoke [docs-13]',
  'docs-14': 'gate: site smoke [docs-14]',
  'docs-16': 'gate: site smoke [docs-16]',
  'docs-17': 'gate: site smoke [docs-17]',
  'dxtrial-16': 'gate: site smoke [dxtrial-16] (React page in three tabs)',
  'frameworks-18': 'gate: site smoke [frameworks-18]',
  'interact-20': 'gate: site smoke [interact-20]',
  'backlog-21': 'gate: site smoke [backlog-21]',
  'backlog-25': 'gate: CHANGELOG lint and release notes',
  'repo-13': 'gate: CONTRIBUTING lists the scripts and gates',
  'repo-14': 'gate: TypeDoc validation',
  'research-09': 'gate: site smoke [research-09]',
  'research-10': 'gate: sync-readme --check and homepage spec',
  'research-11': 'gate: homepage spec',
  'gap-overhaul-delta-05': 'gate: check-migration',
  'gap-scale-longevity-10': 'gate: site smoke [gap-scale-longevity-10]',
  'gap-competitive-04': 'gate: site smoke [gap-competitive-04]',
  'uisite-01': 'gate: site smoke [uisite-01]',
  'uisite-02': 'gate: site smoke [uisite-02]',
  'uisite-04': 'gate: site smoke [uisite-04]',
  'uisite-05': 'gate: site smoke [uisite-05]',
  'uisite-06': 'gate: site smoke [uisite-06]',
  'uisite-07': 'gate: site smoke [uisite-07]',
  'uisite-08': 'gate: lint-styles and lint-copy; 390/1280 screenshots',
  'uisite-09': 'gate: hub spec (thumbnails are real files)',
  'uisite-10': 'gate: thumbs --montage --check',
  'uisite-11': 'gate: homepage spec (code tab equals the executed file)',
  'uisite-12': 'gate: site smoke [uisite-12]',
  'uisite-13': 'gate: homepage spec',
  'uisite-14': 'gate: site smoke [uisite-14]',
  'uisite-15': 'gate: site smoke [uisite-15]',
  'uisite-16': 'gate: site smoke [uisite-16]',
  'uisite-17': 'gate: site smoke [uisite-17]',
  'uisite-19': 'gate: site smoke [uisite-19]',
  'uisite-20': 'gate: site smoke [uisite-20]',
  'uisite-21': 'gate: site smoke [uisite-21]',
  'demos-01': 'gate: hub spec (2 demos per framework)',
  'demos-02': 'gate: thumbs --montage --check; banned-pattern lint',
  'demos-03': 'gate: demo answer.test.ts with an independent oracle',
  'demos-04': 'gate: demo task spec (M16c)',
  'demos-05': 'gate: SOURCE.md fields; data-size.test.ts; generator hash check',
  'demos-08': 'gate: demo task spec (M16a)',
  'demos-09': 'gate: demo task spec (M16b)',
  'demos-12': 'gate: demo task spec (M16a)',
  'demos-14': 'gate: demo task spec (M16a)',
  'demos-15': 'gate: demo task spec (M16a)',
  'demos-18': 'gate: demo task spec (M16c)',
  'backlog-20': 'gate: demo task spec (M16a)',
};

/**
 * The plan §3.4 call-count guards, tested in packages/snaplot/test/perf-guards.test.ts
 * under `[perf:<guard>]` titles, with the milestone §3.4 names. The plugin
 * materialisation guard is `[arch-01]` (test/debug-counters.test.ts, M8).
 */
const PERF_GUARDS = {
  'perf:visible-range': ['M9a', 'render visits only the visible index range ±1'],
  'perf:materialize-legend': [
    'M12b',
    'materializeCount === 0 over 100 appends with the legend and legend table',
  ],
  'perf:overlay-only': ['M8,M11', 'cursor move dirties OVERLAY only'],
  'perf:paint-no-ingest': ['M8,M11', 'paint-class update never ingests'],
  'perf:line-at-rest': ['M11', 'line draws ≤ 4 points per device column at rest'],
  'perf:scatter-fidelity': [
    'M7,M11',
    'drawn ≥ 0.8·min(inView, budget) during gestures (sorted: M7 storage; unsorted: M11 sampling)',
  ],
  'perf:density-cache': ['M11', 'density cache hit on pan (0 rebins)'],
  'perf:pan-no-scan': ['M10', 'pan frame does not scan the full column'],
  'perf:hover-visits': ['M12a', 'hover on 200k sorted scatter visits ≤ 64 points'],
  'perf:group-offscreen': ['M11', 'a 20-member group with 18 offscreen paints 2 overlays per move'],
  'perf:labels-measured-once': ['M10', 'unchanged labels are not re-measured'],
  'perf:label-nodes-reused': ['M10,M11', 'label nodes are reused (node identity)'],
  'perf:no-layout-read': [
    'M10,M11',
    'render path reads no layout (spy on clientWidth/getBoundingClientRect = 0)',
  ],
  'perf:intl-reuse': ['M10', 'formatting 1,000 time labels constructs ≤ 4 Intl formatters'],
  'perf:columns-zero-copy': ['M7', 'columns ingest allocates no per-row JS arrays'],
  'perf:x-validated-once': ['M7', 'X validated once per source per update'],
  'perf:reingest-avoidance': [
    'M8',
    'title, theme, format identity, callbacks, plugins by id → 0 ingests',
  ],
  'perf:group-append': ['M8', 'alignPlots append → 0 setOptions'],
  'perf:offscreen': ['M11', 'offscreen chart paints 0 frames'],
  'perf:theme-coalesce': ['M11', '100 body class mutations in one frame → ≤ 1 resolve per chart'],
  'perf:state-coalesce': ['M8', '50 appends in one frame → 1 subscriber notification'],
};

/** Root causes (plan §6) for part ids the §6 table names only by their base id. */
const NOT_A_FINDING = new Set(['none']);

// ---------------------------------------------------------------------------
// Inputs

export function mainCheckout() {
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd: here,
    encoding: 'utf8',
  }).trim();
  return path.dirname(common);
}

function auditDir() {
  return path.join(mainCheckout(), 'notes', 'overhaul-audit');
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Parse a comma/semicolon list of ids with prefix inheritance and ranges
 * ("dataapi-02, 03, 05:x", "uisite-01, 04–07", "docs-06–14").
 */
export function parseIdList(text) {
  const ids = [];
  let prefix = null;
  const cleaned = text
    .replace(/\*\*/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/`/g, '');
  for (const raw of cleaned.split(/[,;]/)) {
    const token = raw.trim().replace(/\.$/, '').trim();
    if (!token) continue;
    const full = token.match(/^([a-z]+(?:-[a-z]+)*)-(\d{2})(:[a-z0-9-]+)?$/);
    if (full) {
      prefix = full[1];
      ids.push(`${full[1]}-${full[2]}${full[3] ?? ''}`);
      continue;
    }
    // A range, "04–07" after a prefix or "docs-06–14" (en dash or hyphen).
    const range = token.match(/^(?:([a-z]+(?:-[a-z]+)*)-)?(\d{2})\s*[–-]\s*(\d{2})$/);
    if (range && (range[1] || prefix)) {
      if (range[1]) prefix = range[1];
      for (let n = Number(range[2]); n <= Number(range[3]); n++)
        ids.push(`${prefix}-${String(n).padStart(2, '0')}`);
      continue;
    }
    const short = token.match(/^(\d{2})(:[a-z0-9-]+)?$/);
    if (short && prefix) {
      ids.push(`${prefix}-${short[1]}${short[2] ?? ''}`);
      continue;
    }
    const first = token.split(/\s+/)[0];
    if (NOT_A_FINDING.has(first)) continue;
    // Free text after a list (for example "none; it records …") is ignored.
  }
  return ids;
}

/** Every milestone's Closes list, in plan order. */
export function parseCloses(plan) {
  const lines = plan.split('\n');
  const closes = new Map();
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = line.match(/^#{3,4} (M\d+[a-c]?)\b/);
    if (heading) {
      current = heading[1];
      continue;
    }
    if (/^#{1,2} /.test(line)) current = null;
    if (!current) continue;
    const start = line.match(/^- \*\*Closes:\*\*(.*)$/);
    if (!start) continue;
    let text = start[1];
    for (let j = i + 1; j < lines.length && /^ {2,}- /.test(lines[j]); j++) {
      text += `; ${lines[j].replace(/^ +- /, '')}`;
    }
    closes.set(current, [...(closes.get(current) ?? []), ...parseIdList(text)]);
  }
  return closes;
}

function section(plan, heading) {
  const start = plan.indexOf(heading);
  if (start < 0) throw new Error(`trace-ids: plan section not found: ${heading}`);
  const rest = plan.slice(start + heading.length);
  const end = rest.search(/\n## /);
  return end < 0 ? rest : rest.slice(0, end);
}

function tableRows(text) {
  return text
    .split('\n')
    .filter((line) => line.startsWith('|') && !/^\|\s*-/.test(line))
    .map((line) =>
      line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim()),
    );
}

/** §6 root-cause table: RC → ids (base or part). */
export function parseRootCauses(plan) {
  const text = section(plan, '## 6. Bug-fix program');
  const byId = new Map();
  for (const cells of tableRows(text)) {
    const rc = cells[0]?.match(/^RC\d+$/)?.[0];
    if (!rc) continue;
    for (const id of parseIdList(cells[2] ?? '')) {
      byId.set(id, [...new Set([...(byId.get(id) ?? []), rc])]);
    }
  }
  return byId;
}

/** §6 won't-do table: part or base id → { item, reason }. */
export function parseWontDo(plan) {
  const text = section(plan, '## 6. Bug-fix program');
  const start = text.indexOf("**Won't do in this overhaul.**");
  const rows = tableRows(text.slice(start));
  const wontDo = new Map();
  for (const cells of rows) {
    if (cells[0] === 'Item') continue;
    for (const id of parseIdList(cells[1] ?? '')) {
      wontDo.set(id, { item: cells[0], reason: cells[2] });
    }
  }
  return wontDo;
}

/** §14 lock notes for the critical and high findings. */
export function parseLockNotes(plan) {
  const text = section(plan, '## 14. Traceability appendix');
  const notes = new Map();
  for (const cells of tableRows(text)) {
    if (!/^[a-z]+(?:-[a-z]+)*-\d{2}$/.test(cells[0] ?? '')) continue;
    notes.set(cells[0], cells[5]);
  }
  return notes;
}

function findings(results) {
  const all = new Map();
  for (const auditor of results.results) {
    for (const finding of auditor.findings) all.set(finding.id, finding);
  }
  return all;
}

export function isRequired(finding) {
  return (
    finding.verdict === 'confirmed' ||
    ((finding.verdict === undefined || finding.verdict === null || finding.verdict === 'n/a') &&
      (finding.severity === 'high' || finding.severity === 'critical'))
  );
}

function baseOf(id) {
  return id.split(':')[0];
}

function partOf(id) {
  return id.includes(':') ? id.slice(id.indexOf(':') + 1) : null;
}

function byMilestoneOrder(a, b) {
  return MILESTONES.indexOf(a) - MILESTONES.indexOf(b);
}

/** Milestones with an `ovh-<m>-done` tag reachable from HEAD. */
export function mergedMilestones(cwd = here) {
  let tags = '';
  try {
    tags = execFileSync('git', ['tag', '--merged', 'HEAD', '--list', 'ovh-*-done'], {
      cwd,
      encoding: 'utf8',
    });
  } catch {
    return new Set();
  }
  const merged = new Set();
  for (const tag of tags.split('\n')) {
    const match = tag.trim().match(/^ovh-(m\d+[a-c]?)-done$/);
    if (match) merged.add(match[1].toUpperCase().replace(/([A-C])$/, (c) => c.toLowerCase()));
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Generation

export function generate({ planFile, resultsFile }) {
  const plan = readFileSync(planFile, 'utf8');
  const resultsText = readFileSync(resultsFile, 'utf8');
  const all = findings(JSON.parse(resultsText));
  const closes = parseCloses(plan);
  const rootCauses = parseRootCauses(plan);
  const wontDo = parseWontDo(plan);
  const lockNotes = parseLockNotes(plan);

  const owners = new Map(); // id or part id → Set(milestone)
  for (const [milestone, ids] of closes) {
    for (const id of ids) {
      if (!owners.has(id)) owners.set(id, new Set());
      owners.get(id).add(milestone);
    }
  }

  const errors = [];
  const mentioned = new Set([...owners.keys(), ...wontDo.keys()].map(baseOf));
  for (const id of mentioned) {
    if (!all.has(id)) errors.push(`${id}: named in the plan but not in _results.json`);
  }

  const ids = {};
  const sortedIds = [...new Set([...all.keys()])].sort(compareIds);
  for (const id of sortedIds) {
    const finding = all.get(id);
    const required = isRequired(finding);
    const wholeOwners = [...(owners.get(id) ?? [])].sort(byMilestoneOrder);
    const partIds = [...new Set([...owners.keys(), ...wontDo.keys()])]
      .filter((key) => baseOf(key) === id && partOf(key))
      .sort();
    if (!required && wholeOwners.length === 0 && partIds.length === 0 && !wontDo.has(id)) continue;

    const parts = {};
    for (const partId of partIds) {
      const partOwners = [...(owners.get(partId) ?? [])].sort(byMilestoneOrder);
      const declined = wontDo.get(partId);
      if (declined && partOwners.length) {
        errors.push(`${partId}: both won't-do and closed by ${partOwners.join(', ')}`);
      }
      parts[partOf(partId)] = {
        owners: partOwners,
        status: declined ? 'wont-do' : 'tracked',
        lock: lockFor(partId),
        ...(declined ? { wontDo: declined } : {}),
      };
    }
    const declined = wontDo.get(id);
    const allOwners = [
      ...new Set([...wholeOwners, ...Object.values(parts).flatMap((part) => part.owners)]),
    ].sort(byMilestoneOrder);
    const partStatuses = Object.values(parts).map((part) => part.status);
    const status =
      declined ||
      (partStatuses.length && partStatuses.every((s) => s === 'wont-do') && !wholeOwners.length)
        ? 'wont-do'
        : 'tracked';
    if (required && allOwners.length === 0 && !declined && !partStatuses.includes('wont-do')) {
      errors.push(`${id}: required but in no Closes list and not won't-do`);
    }
    // The §6 table may name only parts ("frameworks-01:state"), declared or not.
    const rcKeys = [...rootCauses.keys()].filter((key) => baseOf(key) === id);
    const rcs = [...new Set(rcKeys.flatMap((key) => rootCauses.get(key)))].sort(
      (a, b) => Number(a.slice(2)) - Number(b.slice(2)),
    );
    ids[id] = {
      severity: finding.severity,
      verdict: finding.verdict ?? 'n/a',
      category: finding.category,
      title: finding.title,
      required,
      owners: allOwners,
      ...(wholeOwners.length && partIds.length ? { wholeOwners } : {}),
      rootCauses: rcs,
      status,
      lock: lockFor(id),
      ...(lockNotes.has(id) ? { lockNote: lockNotes.get(id) } : {}),
      ...(Object.keys(parts).length ? { parts } : {}),
      ...(declined ? { wontDo: declined } : {}),
    };
  }

  for (const key of Object.keys(LOCKS)) {
    const base = ids[baseOf(key)];
    if (!base) errors.push(`LOCKS names ${key}, which has no trace entry`);
    else if (partOf(key) && !base.parts?.[partOf(key)])
      errors.push(`LOCKS names part ${key}, which is not a declared part`);
  }

  const required = Object.values(ids).filter((entry) => entry.required).length;
  return {
    errors,
    json: {
      schema: 1,
      note:
        'Generated by scripts/overhaul/trace-ids.mjs from the audit results and the plan (M3b). ' +
        'Authoritative from then on: edit by hand, keep the shape. status is "wont-do" (plan §6) ' +
        'or "tracked"; closure is computed from the owners\' ovh-<m>-done tags, never stored. ' +
        'Locks: {kind:"test"} needs a passing test whose title contains [id] (or [id:part]); ' +
        '{kind:"gate"} needs the id in the Summary "Closes" block of every owning milestone\'s handoff.',
      generatedFrom: {
        plan: 'notes/overhaul-audit/plan.md',
        planSha256: sha256(plan),
        results: 'notes/overhaul-audit/_results.json',
        resultsSha256: sha256(resultsText),
      },
      milestones: MILESTONES,
      requiredCount: required,
      ids,
      perfGuards: Object.fromEntries(
        Object.entries(PERF_GUARDS).map(([id, [owners, title]]) => [
          id,
          {
            title,
            owners: owners.split(','),
            status: 'tracked',
            lock: { kind: 'test', title: `[${id}]` },
          },
        ]),
      ),
    },
  };
}

function lockFor(id) {
  const gate = LOCKS[id];
  if (gate) return { kind: 'gate', name: gate.replace(/^gate: /, '') };
  return { kind: 'test', title: `[${id}]` };
}

/** The live state of a unit: `wont-do`, `closed` (every owner merged) or `open`. */
export function liveStatus(unit, merged) {
  if (unit.status === 'wont-do') return 'wont-do';
  if (!unit.owners.length) return 'open';
  return unit.owners.every((owner) => merged.has(owner)) ? 'closed' : 'open';
}

export function compareIds(a, b) {
  const [pa, na] = splitId(a);
  const [pb, nb] = splitId(b);
  return pa === pb ? na - nb : pa < pb ? -1 : 1;
}

function splitId(id) {
  const match = baseOf(id).match(/^(.*)-(\d+)$/);
  return match ? [match[1], Number(match[2])] : [id, 0];
}

// ---------------------------------------------------------------------------
// Views

export function loadTrace(file = TRACE_FILE) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Flatten an id into its trace units: the whole id, or one unit per part. */
export function units(id, entry) {
  if (!entry.parts)
    return [{ key: id, owners: entry.owners, status: entry.status, lock: entry.lock }];
  const out = Object.entries(entry.parts).map(([part, value]) => ({
    key: `${id}:${part}`,
    owners: value.owners,
    status: value.status,
    lock: value.lock,
  }));
  if (entry.wholeOwners?.length) {
    out.unshift({ key: id, owners: entry.wholeOwners, status: entry.status, lock: entry.lock });
  }
  return out;
}

function render(trace, { by = 'milestone', milestone, merged = new Set() } = {}) {
  const lines = [];
  const required = Object.entries(trace.ids).filter(([, entry]) => entry.required);
  if (by === 'milestone') {
    for (const m of [...trace.milestones, "won't do"]) {
      if (milestone && m !== milestone) continue;
      const rows = [];
      for (const [id, entry] of required) {
        for (const unit of units(id, entry)) {
          const owned = m === "won't do" ? unit.status === 'wont-do' : unit.owners.includes(m);
          if (owned)
            rows.push(
              `  ${unit.key.padEnd(40)} ${liveStatus(unit, merged).padEnd(8)} ${lockText(unit.lock)}`,
            );
        }
      }
      if (!rows.length) continue;
      lines.push(`${m} (${rows.length})`, ...rows, '');
    }
  } else if (by === 'root-cause') {
    const groups = new Map();
    for (const [id, entry] of required) {
      for (const rc of entry.rootCauses.length ? entry.rootCauses : ['(none)']) {
        if (!groups.has(rc)) groups.set(rc, []);
        groups.get(rc).push(`${id} [${entry.owners.join(', ') || '—'}]`);
      }
    }
    const order = [...groups.keys()].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
    for (const rc of order)
      lines.push(`${rc} (${groups.get(rc).length}): ${groups.get(rc).join('; ')}`);
  } else if (by === 'lock') {
    const counts = { test: 0, gate: 0 };
    for (const [id, entry] of required) {
      for (const unit of units(id, entry)) counts[unit.lock.kind]++;
    }
    lines.push(`test locks: ${counts.test}; gate locks: ${counts.gate}`);
  }
  // An id is closed when every unit of it that is not won't-do is closed.
  const statuses = { open: 0, closed: 0, 'wont-do': 0 };
  for (const [id, entry] of required) {
    const live = units(id, entry).map((unit) => liveStatus(unit, merged));
    const open = live.filter((s) => s !== 'wont-do');
    statuses[!open.length ? 'wont-do' : open.every((s) => s === 'closed') ? 'closed' : 'open']++;
  }
  const tags = [...merged].sort(byMilestoneOrder).join(', ') || 'none';
  lines.push(
    `required: ${required.length} (open ${statuses.open}, closed ${statuses.closed}, won't do ${statuses['wont-do']}; merged: ${tags})`,
  );
  return lines.join('\n');
}

function lockText(lock) {
  return lock.kind === 'test' ? `test ${lock.title}` : `gate: ${lock.name}`;
}

// ---------------------------------------------------------------------------
// CLI

/** Format like the repo's biome config, so the committed file passes `biome ci`. */
function formatJson(text) {
  try {
    return execFileSync(
      'npx',
      ['--no-install', 'biome', 'format', `--stdin-file-path=${TRACE_FILE}`],
      {
        cwd: path.resolve(here, '../..'),
        input: text,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      },
    );
  } catch {
    return text;
  }
}

function flag(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function main(args) {
  if (args.includes('--render')) {
    const trace = loadTrace();
    console.log(
      render(trace, {
        by: flag(args, '--by') ?? 'milestone',
        milestone: flag(args, '--milestone'),
        merged: mergedMilestones(),
      }),
    );
    return 0;
  }
  const dir = auditDir();
  const planFile = flag(args, '--plan') ?? path.join(dir, 'plan.md');
  const resultsFile = flag(args, '--results') ?? path.join(dir, '_results.json');
  for (const file of [planFile, resultsFile]) {
    if (!existsSync(file)) {
      console.error(`trace-ids: missing input ${file}`);
      return 2;
    }
  }
  const { errors, json } = generate({ planFile, resultsFile });
  for (const error of errors) console.error(`trace-ids: ${error}`);
  const text = formatJson(`${JSON.stringify(json, null, 2)}\n`);
  if (args.includes('--check')) {
    const same = existsSync(TRACE_FILE) && readFileSync(TRACE_FILE, 'utf8') === text;
    console.log(
      same
        ? 'trace-ids.json matches a fresh generation'
        : 'trace-ids.json differs from a fresh generation',
    );
    return errors.length ? 1 : same ? 0 : 1;
  }
  if (existsSync(TRACE_FILE) && !args.includes('--force')) {
    console.error(
      'trace-ids: trace-ids.json exists and is authoritative (plan §0). Use --force to regenerate, --check to compare.',
    );
    return 1;
  }
  writeFileSync(TRACE_FILE, text);
  console.log(
    `trace-ids: wrote ${path.relative(process.cwd(), TRACE_FILE)} (${json.requiredCount} required ids)`,
  );
  return errors.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
