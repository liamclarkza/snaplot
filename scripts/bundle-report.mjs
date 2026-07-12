// Bundle size report + budget gate for the snaplot library.
//
// Runs the library build once, then reports the transitive raw and gzip
// size of each published entry (index / core / solid) and the shipped
// stylesheet, and exits non-zero if any entry is over budget.
//
// "Transitive" matters here: Vite code-splits the shared implementation
// into a hashed chunk (e.g. legendTableColumns-XXXX.js) that every entry
// imports, so the entry .js file on its own (index.js is ~1.4 KB) tells
// you almost nothing about download cost. We follow the relative imports
// out of each entry, gzip the concatenated bytes of the whole reachable
// set, and budget against that. The chunk hash changes per build, so the
// closure is computed from the import statements rather than a fixed name.
//
// solid-js is a peer dependency (external, not bundled) and is excluded
// from the closure the same way any bare specifier is.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'packages', 'snaplot', 'dist');

// Per-entry gzip budgets in bytes, set ~10% above the measured baseline
// recorded inline next to each budget. Bumping a budget is a deliberate
// act: it means the published download got bigger, so re-measure and move
// the baseline comment with it.
const GZIP_BUDGETS = {
  'index.js': 68_000, // baseline 62_054 (0.10 features + live CSS-var theming)
  'core.js': 68_000, // baseline 61_747
  'solid.js': 66_000, // baseline 59_802 (excludes external solid-js)
  'legend-table.css': 2_150, // baseline 1_956 (0.12 geometry-aware legend marks)
};

const ENTRIES = Object.keys(GZIP_BUDGETS);

/** Relative import specifiers ("./chunk.js") referenced by a module's source. */
function localImports(code) {
  const specifiers = [];
  const patterns = [/from\s*"(\.[^"]+)"/g, /import\s*"(\.[^"]+)"/g];
  for (const re of patterns) {
    let match;
    while ((match = re.exec(code)) !== null) specifiers.push(match[1]);
  }
  return specifiers;
}

/** All dist files reachable from an entry by following relative imports. */
function transitiveClosure(entry) {
  const seen = new Set();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    // CSS entries have no import graph to walk.
    if (file.endsWith('.css')) continue;
    const code = readFileSync(join(distDir, file), 'utf8');
    for (const spec of localImports(code)) {
      const resolved = normalize(join(dirname(file), spec));
      if (!seen.has(resolved)) stack.push(resolved);
    }
  }
  return [...seen];
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

console.log('Building snaplot library (npm run build -w packages/snaplot)...');
execSync('npm run build -w packages/snaplot', { cwd: root, stdio: 'inherit' });

const rows = [];
let overBudget = false;

for (const entry of ENTRIES) {
  const files = transitiveClosure(entry);
  const buffers = files.map((f) => readFileSync(join(distDir, f)));
  const raw = buffers.reduce((sum, b) => sum + b.length, 0);
  const gzip = gzipSync(Buffer.concat(buffers)).length;
  const budget = GZIP_BUDGETS[entry];
  const over = gzip > budget;
  if (over) overBudget = true;
  rows.push({
    entry,
    chunks: files.length,
    raw,
    gzip,
    budget,
    over,
    shared: files.filter((f) => !ENTRIES.includes(f)),
  });
}

const pad = (s, n) => String(s).padEnd(n);
console.log('');
console.log(
  `${pad('entry', 18)}${pad('raw', 12)}${pad('gzip', 12)}${pad('budget', 12)}status`,
);
console.log('-'.repeat(66));
for (const r of rows) {
  console.log(
    `${pad(r.entry, 18)}${pad(formatKb(r.raw), 12)}${pad(formatKb(r.gzip), 12)}` +
      `${pad(formatKb(r.budget), 12)}${r.over ? 'OVER' : 'ok'}`,
  );
}

console.log('');
console.log('gzip is measured over the concatenated transitive closure of');
console.log('each entry, so shared chunks are counted once per entry:');
for (const r of rows) {
  if (r.shared.length > 0) {
    console.log(`  ${r.entry}: + ${r.shared.join(', ')}`);
  }
}

if (overBudget) {
  console.error('');
  console.error('Bundle budget exceeded. Either trim the entry or, if the');
  console.error('growth is intended, raise the budget and its baseline');
  console.error('comment in scripts/bundle-report.mjs.');
  process.exit(1);
}

console.log('All entries within budget.');
