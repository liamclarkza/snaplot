// Shared helpers for the demo-data generators (plan §10.1 #4–#5). Node 22, no dependencies.
//
// Every generator follows the same shape:
// - online: download each raw file with retries, store it in the gitignored cache
//   `scripts/demo-data/.cache/<slug>/` and record its URL, SHA-256, size and retrieval date in
//   the cache manifest;
// - `--offline`: rebuild from that cache only, with the dates and hashes from the manifest, so
//   the outputs are byte-identical to the online run that filled the cache.
// Outputs never contain the current time, so two runs over the same cache are identical.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, inflateRawSync } from 'node:zlib';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, '../..');
export const CACHE = join(HERE, '.cache');
export const DATA = join(REPO, 'site/public/data');
export const SLICES = join(REPO, 'site/src/examples/data');

/** `--offline`, `--fallback`, `--quiet` and the positional arguments of a generator. */
export function parseArgs(argv = process.argv.slice(2)) {
  return {
    offline: argv.includes('--offline'),
    /** Build from the demo's plan §10.2 fallback source, as if the primary had failed. */
    fallback: argv.includes('--fallback'),
    quiet: argv.includes('--quiet'),
    positional: argv.filter((a) => !a.startsWith('--')),
  };
}

export function log(...args) {
  if (!process.argv.includes('--quiet')) console.log(...args);
}

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

export function gzipSize(buf) {
  return gzipSync(buf, { level: 9 }).length;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * GET a URL with up to `attempts` tries and exponential backoff (1 s, 2 s, 4 s …).
 * Throws `DownloadFailed` after the last attempt so the caller can apply its fallback.
 */
export async function download(url, { attempts = 3, timeoutMs = 180_000, accept } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(1000 * 2 ** (i - 1));
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'user-agent': 'snaplot-demo-data/1 (+https://github.com/liamclarkza/snaplot)',
          ...(accept ? { accept } : {}),
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (error) {
      lastError = error;
      log(`  attempt ${i + 1}/${attempts} failed for ${url}: ${error.message}`);
    }
  }
  const error = new Error(`download failed ${attempts} times: ${url}: ${lastError?.message}`);
  error.name = 'DownloadFailed';
  throw error;
}

/**
 * The raw-download cache of one demo. `get(name, url)` downloads (online) or reads (offline) a
 * file and returns its bytes; `save()` writes the manifest. The manifest is the record that
 * SOURCE.md is built from: url, sha256, bytes and retrievedAt for every raw file.
 */
export function openCache(slug, { offline }) {
  const dir = join(CACHE, slug);
  const manifestPath = join(dir, 'manifest.json');
  const previous = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, 'utf8'))
    : { files: {} };
  if (offline && !existsSync(manifestPath)) {
    throw new Error(
      `no raw cache for ${slug} at ${relative(REPO, dir)}; run \`npm run demo-data -- ${slug}\` online first`,
    );
  }
  const used = {};
  const extra = { ...(previous.extra ?? {}) };
  mkdirSync(dir, { recursive: true });

  return {
    dir,
    offline,
    /** Bytes of the cached file `name`, downloading it first when online. */
    async get(name, url, options = {}) {
      const path = join(dir, name);
      if (offline) {
        const entry = previous.files[name];
        if (!entry || !existsSync(path)) {
          throw new Error(`offline: ${name} is not in the ${slug} cache`);
        }
        const buf = readFileSync(path);
        if (sha256(buf) !== entry.sha256) {
          throw new Error(`offline: ${name} does not match its recorded SHA-256`);
        }
        used[name] = entry;
        return buf;
      }
      log(`  GET ${url}`);
      const buf = await download(url, options);
      writeFileSync(path, buf);
      used[name] = {
        url,
        sha256: sha256(buf),
        bytes: buf.length,
        retrievedAt: new Date().toISOString().slice(0, 10),
      };
      return buf;
    },
    /** Whether `name` was recorded by a previous run (offline planning reads this). */
    has(name) {
      return Boolean(previous.files[name]) && existsSync(join(dir, name));
    },
    /** Small JSON facts that offline runs need (for example a query plan). */
    extra,
    /** The entries used by this run, in first-use order. */
    files: used,
    save() {
      if (offline) return;
      const manifest = { slug, files: used, extra };
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    },
  };
}

/** The latest retrieval date among the files used (ISO date). */
export function retrievalDate(files) {
  return Object.values(files)
    .map((f) => f.retrievedAt)
    .sort()
    .at(-1);
}

/** Write a text or binary output, creating its directory. Returns the path. */
export function writeOut(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

/** Format generated JSON and TypeScript with the repo's pinned Biome, so `biome ci` passes. */
export function biomeFormat(paths) {
  if (paths.length === 0) return;
  const bin = join(REPO, 'node_modules/.bin/biome');
  execFileSync(bin, ['format', '--write', ...paths], { cwd: REPO, stdio: 'pipe' });
}

/** Round to `digits` decimals and drop a trailing `-0`. */
export function round(value, digits) {
  const f = 10 ** digits;
  const r = Math.round(value * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

/** A CSV line: numbers as given, strings quoted only when they need it. */
export function csvLine(values) {
  return values
    .map((v) => {
      if (v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
    })
    .join(',');
}

/** Parse a simple CSV (quoted fields allowed, no embedded newlines) into header + rows. */
export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const split = (line) => {
    const out = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const header = split(lines[0]);
  return { header, rows: lines.slice(1).map(split) };
}

/** Size facts of the files in a demo's data directory (raw and gzipped bytes). */
export function sizeOf(paths) {
  return paths.map((p) => {
    const buf = readFileSync(p);
    return { path: relative(REPO, p), bytes: statSync(p).size, gzip: gzipSize(buf) };
  });
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

/**
 * Render SOURCE.md (plan §10.1 #4). Every demo uses the same headings, so `check.mjs` and the
 * footer test (M16) can read the attribution line and the licence label mechanically.
 */
export function renderSourceMd(s) {
  const lines = [];
  lines.push(`# ${s.title}`, '');
  lines.push(`Demo \`${s.slug}\`. ${s.summary}`, '');
  lines.push('## Source', '');
  for (const u of s.urls) lines.push(`- ${u}`);
  lines.push('', '## Licence', '', s.licence, '');
  for (const e of s.licenceEvidence) lines.push(`- ${e}`);
  lines.push('', '## Attribution', '', s.attribution, '');
  lines.push('## Retrieved', '', s.retrieved, '');
  lines.push('## Regenerate', '', '```sh', ...s.regenerate, '```', '');
  lines.push('## Rows', '');
  for (const r of s.rows) lines.push(`- ${r}`);
  lines.push('', '## Files', '', '| File | Bytes | Gzipped |', '|---|---:|---:|');
  for (const f of s.files) lines.push(`| \`${f.path}\` | ${f.bytes} | ${kb(f.gzip)} |`);
  lines.push('', '## Raw downloads (SHA-256)', '');
  if (s.raw.length === 0) lines.push('None.');
  else {
    lines.push('| File | URL | Bytes | SHA-256 |', '|---|---|---:|---|');
    for (const r of s.raw)
      lines.push(`| \`${r.name}\` | ${r.url} | ${r.bytes} | \`${r.sha256}\` |`);
  }
  lines.push('', '## Processing', '');
  for (const p of s.processing) lines.push(`- ${p}`);
  lines.push('', '## Oracle', '');
  for (const o of s.oracle) lines.push(`- ${o}`);
  lines.push('', '## Design reference', '', s.reference, '');
  if (s.notes?.length) {
    lines.push('## Notes', '');
    for (const n of s.notes) lines.push(`- ${n}`);
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/** Wait while the shared bench lock exists (plan §11.1); a lock older than 2 hours is stale. */
export async function waitForBenchLock() {
  let common;
  try {
    common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: REPO })
      .toString()
      .trim();
  } catch {
    return;
  }
  const lock = resolve(REPO, common, '..', '.claude', 'bench.lock');
  while (existsSync(lock)) {
    const age = Date.now() - statSync(lock).mtimeMs;
    if (age > 2 * 60 * 60 * 1000) return;
    log(`  waiting for the bench lock ${lock}`);
    await sleep(30_000);
  }
}

/** A seeded PRNG (mulberry32). Returns floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Read the entries of a zip archive (stored or deflated, no zip64): the end-of-central-directory
 * record gives the central directory, each central header gives a local header, and the data
 * after it is inflated with `inflateRawSync`. Returns a map of name → bytes.
 */
export function readZip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('zip: no end-of-central-directory record');
  const entries = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < entries; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip: bad central header');
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const skip = nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (buf.readUInt32LE(local) !== 0x04034b50)
      throw new Error(`zip: bad local header for ${name}`);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    if (method === 0) files.set(name, data);
    else if (method === 8) files.set(name, inflateRawSync(data));
    else throw new Error(`zip: unsupported method ${method} for ${name}`);
    p += 46 + skip;
  }
  return files;
}

/** The repo-relative path, for messages and SOURCE.md. */
export const rel = (p) => relative(REPO, p);
