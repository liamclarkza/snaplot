#!/usr/bin/env node
// Expected-failure ledger (plan P12, §12 M3b scope 6).
//
//   node scripts/ledger.mjs [--json] [--allow <id,id,...>] [--root <repo>]
//
// Scans packages/snaplot/{src,test}/** and site/tests/** for expected-failure
// markers and prints one line per marker: its finding ids, file:line and title.
// - vitest: `it.fails('<title>', …)` (also `test.fails`);
// - Playwright: `test.fail(true, '<ids>')` inside a `test('<title>', …)` body
//   (the title is the enclosing test's).
// A marker's ids are every `[id]` or `[id:part]` in its title (and, for
// Playwright, in the description), plus `[perf:<guard>]` ids.
//
// `--json` prints the markers as a JSON array, one entry per marker, so its
// length equals the number of expected failures vitest and Playwright execute.
// `--allow <ids>` exits non-zero if any marker carries an id outside the list
// (M17 passes the plan §6 won't-do part ids). A marker without any id also
// exits non-zero: P12 requires every known defect to name its finding.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(here, '..');
const SCAN = ['packages/snaplot/src', 'packages/snaplot/test', 'site/tests'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'test-results', '.astro', '__screenshots__']);
const EXTENSIONS = /\.(m?[jt]sx?)$/;
const ID = /\[((?:[a-z]+(?:-[a-z]+)*-\d{2}(?::[a-z0-9-]+)?)|(?:perf:[a-z0-9-]+))\]/g;

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (EXTENSIONS.test(name)) out.push(full);
  }
  return out;
}

/** The string literal starting at `start` (a quote) as [value, end], or null. */
function readString(text, start) {
  const quote = text[start];
  if (quote !== "'" && quote !== '"' && quote !== '`') return null;
  let value = '';
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') {
      value += text[i + 1];
      i++;
      continue;
    }
    if (c === quote) return [value, i + 1];
    value += c;
  }
  return null;
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function idsIn(text) {
  return [...text.matchAll(ID)].map((match) => match[1]);
}

/** Every `test('<title>'` (Playwright) opening in the file, by position. */
function playwrightTests(text) {
  const out = [];
  for (const match of text.matchAll(/\btest\(\s*/g)) {
    const literal = readString(text, match.index + match[0].length);
    if (literal) out.push({ index: match.index, title: literal[0] });
  }
  return out;
}

/**
 * Blank out comments (keeping offsets and newlines), so a marker quoted in a
 * comment is not counted. String and template contents are kept.
 */
export function stripComments(source) {
  const out = source.split('');
  let quote = null;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      continue;
    }
    if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') out[i++] = ' ';
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end < 0 ? source.length : end + 2;
      for (; i < stop; i++) if (source[i] !== '\n') out[i] = ' ';
      i--;
    }
  }
  return out.join('');
}

export function scanFile(file, root = DEFAULT_ROOT) {
  const text = stripComments(readFileSync(file, 'utf8'));
  const relative = path.relative(root, file).split(path.sep).join('/');
  const markers = [];
  // vitest: it.fails('<title>' / test.fails('<title>'
  for (const match of text.matchAll(/\b(?:it|test)\.fails\(\s*/g)) {
    const literal = readString(text, match.index + match[0].length);
    if (!literal) continue;
    markers.push({
      runner: 'vitest',
      ids: [...new Set(idsIn(literal[0]))],
      file: relative,
      line: lineOf(text, match.index),
      title: literal[0],
    });
  }
  // Playwright: test.fail(<condition>, '<description>') inside test('<title>', …)
  const tests = playwrightTests(text);
  for (const match of text.matchAll(/\btest\.fail\(\s*/g)) {
    const argsStart = match.index + match[0].length;
    const close = text.indexOf(')', argsStart);
    const args = text.slice(argsStart, close < 0 ? argsStart : close);
    // `test.fail(title, body)` (declaration form) has a string first argument.
    const declaration = readString(text, argsStart);
    let title;
    if (declaration) title = declaration[0];
    else {
      const enclosing = tests.filter((test) => test.index < match.index).at(-1);
      title = enclosing?.title ?? '';
    }
    markers.push({
      runner: 'playwright',
      ids: [...new Set([...idsIn(title), ...(declaration ? [] : idsIn(args))])],
      file: relative,
      line: lineOf(text, match.index),
      title,
      conditional: !declaration && !/^\s*true\s*,/.test(args),
    });
  }
  return markers;
}

export function scanLedger(root = DEFAULT_ROOT) {
  const files = SCAN.flatMap((dir) => walk(path.join(root, dir), []));
  return files.sort().flatMap((file) => scanFile(file, root));
}

function main(args) {
  const rootIndex = args.indexOf('--root');
  const root = rootIndex >= 0 ? path.resolve(args[rootIndex + 1]) : DEFAULT_ROOT;
  const markers = scanLedger(root);
  const allowIndex = args.indexOf('--allow');
  const allow =
    allowIndex >= 0
      ? new Set(
          (args[allowIndex + 1] ?? '')
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean),
        )
      : null;

  if (args.includes('--json')) {
    console.log(JSON.stringify(markers, null, 2));
  } else {
    for (const marker of markers) {
      const ids = marker.ids.length ? marker.ids.join(' ') : '(no id)';
      console.log(
        `${ids.padEnd(44)} ${`${marker.file}:${marker.line}`.padEnd(52)} ${marker.title}`,
      );
    }
    const byRunner = { vitest: 0, playwright: 0 };
    for (const marker of markers) byRunner[marker.runner]++;
    const ids = new Set(markers.flatMap((marker) => marker.ids));
    console.log(
      `\n${markers.length} expected-failure markers (vitest ${byRunner.vitest}, playwright ${byRunner.playwright}), ${ids.size} distinct ids`,
    );
  }

  let status = 0;
  const unnamed = markers.filter((marker) => marker.ids.length === 0);
  for (const marker of unnamed) {
    console.error(`ledger: marker without an [id] at ${marker.file}:${marker.line}`);
    status = 1;
  }
  for (const marker of markers.filter((m) => m.conditional)) {
    console.error(
      `ledger: conditional test.fail at ${marker.file}:${marker.line}; use test.fail(true, '[id]') so the count stays exact`,
    );
    status = 1;
  }
  if (allow) {
    const extra = markers.filter((marker) => marker.ids.some((id) => !allow.has(id)));
    for (const marker of extra) {
      console.error(
        `ledger: not allowed: ${marker.ids.filter((id) => !allow.has(id)).join(' ')} at ${marker.file}:${marker.line}`,
      );
    }
    if (extra.length) status = 1;
  }
  return status;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
