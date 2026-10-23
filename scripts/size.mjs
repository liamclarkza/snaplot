// Size gate (plan §11.3 G6): what an app pays for each import. Every entry in
// scripts/size-budgets.json is bundled from the built package the way a consumer's bundler would
// (esbuild, browser conditions, minified, NODE_ENV=production, peers external), then gzipped at
// level 9 and compared with its budget. Run `npm run build` first.
//
//   node scripts/size.mjs            table, exit 1 if any import is over budget
//   node scripts/size.mjs --json     the same, plus bytes per source module of each bundle
//   node scripts/size.mjs --update   reset every budget to the measured size + 2%
//
// Sizes are in KiB (1,024 bytes), the unit of the audit's tables and the plan's "KB" targets.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const budgetsFile = join(repo, 'scripts/size-budgets.json');
const pkg = join(repo, 'packages/snaplot');
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const update = args.includes('--update');
const HEADROOM = 1.02;

if (!existsSync(join(pkg, 'dist/index.js'))) {
  console.error('size: packages/snaplot/dist is missing. Run `npm run build` first.');
  process.exit(1);
}
function newest(dir) {
  let time = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    time = Math.max(time, entry.isDirectory() ? newest(path) : statSync(path).mtimeMs);
  }
  return time;
}
if (newest(join(pkg, 'src')) > statSync(join(pkg, 'dist/index.js')).mtimeMs) {
  console.warn('size: src/ is newer than dist/. Run `npm run build` for a current result.');
}

const config = JSON.parse(readFileSync(budgetsFile, 'utf8'));

/**
 * Bundles `export { name } from 'specifier'`. The first exported name of `names` is measured: an
 * entry may name the export it replaces while the new one does not exist yet.
 */
async function measure(specifier, names) {
  for (const name of names) {
    const result = await build({
      stdin: { contents: `export { ${name} } from '${specifier}';`, resolveDir: repo },
      bundle: true,
      minify: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      external: ['react', 'react/*', 'react-dom', 'react-dom/*', 'solid-js', 'solid-js/*'],
      define: { 'process.env.NODE_ENV': '"production"' },
      legalComments: 'none',
      sourcemap: 'external',
      outdir: 'out',
      write: false,
      logLevel: 'silent',
    }).catch((error) => error);
    if (result.errors?.length) {
      if (result.errors.some((e) => /No matching export/.test(e.text))) continue;
      throw new Error(`${specifier} { ${name} }: ${result.errors[0].text}`);
    }
    const code = result.outputFiles.find((file) => file.path.endsWith('.js')).contents;
    const map = result.outputFiles.find((file) => file.path.endsWith('.map')).text;
    const modules = asJson ? attribute(Buffer.from(code).toString('utf8'), JSON.parse(map)) : [];
    return { name, min: code.length, gzip: gzipSync(code, { level: 9 }).length, modules };
  }
  throw new Error(`${specifier} exports none of ${names.join(', ')}`);
}

const VLQ = Object.fromEntries(
  [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'].map((c, i) => [c, i]),
);
function decodeVlq(segment) {
  const values = [];
  let value = 0;
  let shift = 0;
  for (const char of segment) {
    const digit = VLQ[char];
    value += (digit & 31) << shift;
    if (digit & 32) shift += 5;
    else {
      values.push(value & 1 ? -(value >>> 1) : value >>> 1);
      value = 0;
      shift = 0;
    }
  }
  return values;
}

/**
 * Minified bytes per original source module, read through the bundle's sourcemap (esbuild
 * composes the dist maps, which point at src/). Each mapped segment owns the bytes up to the next.
 */
function attribute(code, map) {
  const bytes = new Map();
  const lines = code.split('\n');
  let source = 0;
  map.mappings.split(';').forEach((mappings, lineIndex) => {
    const line = lines[lineIndex] ?? '';
    let column = 0;
    const segments = mappings ? mappings.split(',').map(decodeVlq) : [];
    segments.forEach((segment, i) => {
      column += segment[0];
      if (segment.length > 1) source += segment[1];
      const end = i + 1 < segments.length ? column + segments[i + 1][0] : line.length;
      const owner = segment.length > 1 ? map.sources[source] : '(unmapped)';
      bytes.set(owner, (bytes.get(owner) ?? 0) + Buffer.byteLength(line.slice(column, end)));
    });
  });
  return [...bytes]
    .map(([path, size]) => ({ module: tidy(path), bytes: size }))
    .sort((a, b) => b.bytes - a.bytes);
}

function tidy(path) {
  const clean = path.replace(/^(\.\.\/)+/, '');
  const at = clean.indexOf('packages/snaplot/');
  if (at >= 0) return clean.slice(at);
  return clean.startsWith('src/') ? `packages/snaplot/${clean}` : clean;
}

const kib = (bytes) => (bytes / 1024).toFixed(1);
const rows = [];
for (const entry of config.imports) {
  const names = entry.fallback ? [entry.import, entry.fallback] : [entry.import];
  const measured = await measure(entry.from, names);
  if (update) {
    entry.measured = measured.gzip;
    entry.budget = Math.ceil(measured.gzip * HEADROOM);
  }
  rows.push({ ...entry, measured });
}
if (update) {
  writeFileSync(budgetsFile, `${JSON.stringify(config, null, 2)}\n`);
  console.log(
    'size: budgets reset to measured + 2%. Review the diff of scripts/size-budgets.json.',
  );
}

let over = 0;
const table = [
  '| import | min KiB | gzip KiB | budget KiB | headroom | |',
  '|---|---:|---:|---:|---:|---|',
];
for (const row of rows) {
  const { measured, budget } = row;
  const ok = measured.gzip <= budget;
  if (!ok) over++;
  const shown =
    measured.name === row.import ? row.label : `${row.label} (as ${measured.name} until it exists)`;
  table.push(
    `| ${shown} | ${kib(measured.min)} | ${kib(measured.gzip)} | ${kib(budget)} | ${(
      ((budget - measured.gzip) / budget) * 100
    ).toFixed(1)}% | ${ok ? 'ok' : 'OVER'} |`,
  );
}

if (asJson) {
  console.log(
    JSON.stringify(
      rows.map((row) => ({
        label: row.label,
        from: row.from,
        import: row.measured.name,
        minBytes: row.measured.min,
        gzipBytes: row.measured.gzip,
        budgetBytes: row.budget,
        modules: row.measured.modules,
      })),
      null,
      2,
    ),
  );
} else {
  console.log(table.join('\n'));
}
if (over > 0) {
  console.error(
    `size: ${over} import(s) over budget. \`node scripts/size.mjs --json\` lists bytes per module;` +
      ' raise a budget only with the reason in the commit.',
  );
  process.exit(1);
}
