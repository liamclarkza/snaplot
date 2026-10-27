// Demo datasets (plan §10.1 #4–#6, §12 M6b).
//
//   npm run demo-data -- <slug> [--offline] [--fallback]   build one demo's data
//   npm run demo-data -- all [--offline]                    build every demo's data
//   npm run demo-data -- check [--require-cache]            verify every demo's data:
//     - SOURCE.md has every field (plan §10.1 #4) and an allowed licence;
//     - data is within its caps: ≤ 1 MB gzipped per demo (S1: ≤ 2 MB of compressed audio),
//       docs slices ≤ 20 KB each with a provenance comment;
//     - with the raw cache present: running the generator twice with --offline gives outputs
//       identical to each other and to the committed files (hash check).
//
// Generators are plain Node 22 scripts with no dependencies beyond the repo's own (Playwright
// for S1's decode, Biome to format generated JSON and TypeScript).

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE, DATA, HERE, REPO, SLICES, gzipSize, rel, sha256 } from './lib.mjs';

/** slug → generator and outputs. */
export const DEMOS = {
  'max-q': { script: 'max-q.mjs', slices: ['launch.ts'] },
  'hottest-year': { script: 'hottest-year.mjs', slices: ['global-temperature.ts'] },
  'pick-a-checkpoint': { script: 'train-digits.mjs', slices: ['training.ts'] },
  'battery-payback': { script: 'battery-payback.mjs', slices: ['household.ts'] },
  'find-the-clipping': {
    script: 'find-the-clipping.mjs',
    slices: ['waveform.ts'],
    audio: /\.(mp3|wav)$/,
  },
  // A seeded simulator (site/src/demos/deploy-482/simulator.ts): only SOURCE.md, no generator.
  'deploy-482': { script: null, slices: [] },
};
const ALIASES = { 'train-digits': 'pick-a-checkpoint' };

const MB = 1024 * 1024;
const FIELDS = [
  'Source',
  'Licence',
  'Attribution',
  'Retrieved',
  'Regenerate',
  'Rows',
  'Raw downloads (SHA-256)',
  'Oracle',
  'Design reference',
];
const ALLOWED_LICENCE = /public domain|CC0|CC BY 4\.0|MIT|BSD-3/i;
const BANNED_LICENCE = /\bSA\b|share-?alike|\bNC\b|non-?commercial|\bND\b|no-?deriv/i;

function run(slug, flags) {
  const { script } = DEMOS[slug];
  if (!script) {
    console.log(`${slug}: simulator, nothing to generate (site/src/demos/${slug}/simulator.ts)`);
    return;
  }
  execFileSync(process.execPath, [join(HERE, script), ...flags], { cwd: REPO, stdio: 'inherit' });
}

function outputs(slug) {
  const dir = join(DATA, slug);
  const files = existsSync(dir)
    ? readdirSync(dir)
        .sort()
        .map((f) => join(dir, f))
    : [];
  return [...files, ...DEMOS[slug].slices.map((s) => join(SLICES, s))];
}

const hashes = (slug) =>
  Object.fromEntries(outputs(slug).map((p) => [rel(p), sha256(readFileSync(p))]));

/** The SOURCE.md sections by heading. */
function sections(md) {
  const out = {};
  let current = null;
  for (const line of md.split('\n')) {
    const h = /^## (.+)$/.exec(line);
    if (h) {
      current = h[1].trim();
      out[current] = [];
    } else if (current) out[current].push(line);
  }
  for (const k of Object.keys(out)) out[k] = out[k].join('\n').trim();
  return out;
}

function checkSource(slug, problems) {
  const path = join(DATA, slug, 'SOURCE.md');
  if (!existsSync(path)) {
    problems.push(`${slug}: no SOURCE.md`);
    return;
  }
  const s = sections(readFileSync(path, 'utf8'));
  for (const f of FIELDS) {
    if (!s[f]) problems.push(`${slug}: SOURCE.md has no "${f}" section`);
  }
  const licence = (s.Licence ?? '').split('\n')[0];
  if (!ALLOWED_LICENCE.test(licence) || BANNED_LICENCE.test(licence)) {
    problems.push(`${slug}: licence "${licence}" is not public domain, CC BY 4.0, MIT or BSD-3`);
  }
  const attribution = s.Attribution ?? '';
  if (attribution.includes('\n')) problems.push(`${slug}: the attribution must be one line`);
  const simulated = /simulat/i.test(s.Source ?? '');
  if (!simulated && !/^\d{4}-\d{2}-\d{2}$/.test(s.Retrieved ?? '')) {
    problems.push(`${slug}: "Retrieved" is not an ISO date`);
  }
  if (!simulated && !/npm run demo-data -- /.test(s.Regenerate ?? '')) {
    problems.push(`${slug}: "Regenerate" does not give the npm run demo-data command`);
  }
  const raw = s['Raw downloads (SHA-256)'] ?? '';
  if (!simulated && !/`[0-9a-f]{64}`/.test(raw)) {
    problems.push(`${slug}: no SHA-256 recorded for the raw downloads`);
  }
}

function checkCaps(slug, problems, report) {
  const { audio } = DEMOS[slug];
  const dir = join(DATA, slug);
  let gz = 0;
  let audioBytes = 0;
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.md')) continue;
      const p = join(dir, f);
      if (audio?.test(f)) audioBytes += statSync(p).size;
      else gz += gzipSize(readFileSync(p));
    }
  }
  if (gz > MB) problems.push(`${slug}: ${(gz / MB).toFixed(2)} MB gzipped of data (cap 1 MB)`);
  if (audioBytes > 2 * MB) {
    problems.push(`${slug}: ${(audioBytes / MB).toFixed(2)} MB of audio (cap 2 MB)`);
  }
  report.push(
    `${slug}: data ${(gz / 1024).toFixed(1)} KB gzipped${audio ? `, audio ${(audioBytes / 1024).toFixed(1)} KB` : ''}`,
  );
  for (const s of DEMOS[slug].slices) {
    const p = join(SLICES, s);
    if (!existsSync(p)) {
      problems.push(`${slug}: missing docs slice ${rel(p)}`);
      continue;
    }
    const bytes = statSync(p).size;
    if (bytes > 20 * 1024) problems.push(`${rel(p)}: ${bytes} bytes (cap 20 KB)`);
    if (!readFileSync(p, 'utf8').startsWith('// Generated by `npm run demo-data -- ')) {
      problems.push(`${rel(p)}: no provenance comment`);
    }
    report.push(`  slice ${s}: ${(bytes / 1024).toFixed(1)} KB`);
  }
}

function check(requireCache) {
  const problems = [];
  const report = [];
  for (const slug of Object.keys(DEMOS)) {
    checkSource(slug, problems);
    checkCaps(slug, problems, report);
    if (!DEMOS[slug].script) continue;
    if (!existsSync(join(CACHE, slug, 'manifest.json'))) {
      const msg = `${slug}: no raw cache, determinism not checked (run \`npm run demo-data -- ${slug}\`)`;
      if (requireCache) problems.push(msg);
      else report.push(`  ${msg}`);
      continue;
    }
    const committed = hashes(slug);
    run(slug, ['--offline', '--quiet']);
    const first = hashes(slug);
    run(slug, ['--offline', '--quiet']);
    const second = hashes(slug);
    for (const [path, hash] of Object.entries(committed)) {
      if (first[path] !== hash) problems.push(`${path}: an offline rebuild differs from the file`);
      if (second[path] !== first[path]) problems.push(`${path}: two offline runs differ`);
    }
    for (const path of Object.keys(first)) {
      if (!(path in committed)) problems.push(`${path}: produced by the generator but missing`);
    }
    report.push(`  ${slug}: ${Object.keys(first).length} outputs identical across 2 offline runs`);
  }
  console.log(report.join('\n'));
  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s):\n${problems.map((p) => `- ${p}`).join('\n')}`);
    process.exit(1);
  }
  console.log('\ndemo-data check: OK');
}

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const [target] = args.filter((a) => !a.startsWith('--'));
if (target === 'check') check(flags.includes('--require-cache'));
else if (target === 'all') for (const slug of Object.keys(DEMOS)) run(slug, flags);
else if (target && (DEMOS[target] || ALIASES[target])) run(ALIASES[target] ?? target, flags);
else {
  console.error(
    `usage: npm run demo-data -- <${Object.keys(DEMOS).join('|')}|all|check> [--offline] [--fallback]`,
  );
  process.exit(1);
}
