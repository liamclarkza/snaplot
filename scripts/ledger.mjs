#!/usr/bin/env node
// Expected-failure ledger (plan P12, §12 M3b scope 6).
//
//   node scripts/ledger.mjs [--json] [--allow <id,id,...>] [--root <repo>]
//
// Scans packages/snaplot/{src,test}/** and site/tests/** for expected-failure
// markers and prints one line per marker: its finding ids, file:line and title.
// - vitest: `it.fails('<title>', …)` (also `test.fails`);
// - Playwright: `test.fail(true, '<ids>')` inside a `test('<title>', …)` body
//   (the title is the enclosing test's);
// - geometry (M3a): each `fails('<owner>', '<fixture>', '<check>', '<id>')` line
//   in packages/snaplot/test/visual/expected/m<N>.ts. geometry.spec.ts runs it as
//   `test.fail(true, `[${finding.id}] …`)` in a test titled
//   `${CHECKS[check]} [<id>]` (CHECKS from test/visual/checks.ts). That one
//   data-driven test.fail is the template of these entries, not a marker of its
//   own; `fixed(` lines are locks.
// A marker's ids are every `[id]` or `[id:part]` in its title (and, for
// Playwright, in the description), plus `[perf:<guard>]` ids.
//
// Each marker names the suite that executes it, so trace-check can match it to
// that suite's report:
// - `vitest`: `npm test`, every vitest marker in packages/snaplot/{src,test}/**
//   outside test/consumers/ (M3a's test/visual/*.test.ts included);
// - `consumers`: vitest markers in packages/snaplot/test/consumers/**, run by
//   `check:package` (scripts/check-consumers.mjs);
// - `browser`: Playwright markers in packages/snaplot/test/browser/**,
//   `npm run test:browser`;
// - `visual`: Playwright markers in packages/snaplot/test/visual/** and the
//   geometry entries, `npm run test:visual` (geometry project);
// - `site`: site/tests/**.
//
// `--json` prints the markers as a JSON array, one entry per marker, so its
// length equals the number of expected failures the suites execute.
// `--allow <ids>` exits non-zero if any marker carries an id outside the list
// (M17 passes the plan §6 won't-do part ids). These also exit non-zero, because
// the executed count could no longer equal the ledger length:
// - a marker without any id (P12 requires every known defect to name its finding);
// - a conditional `test.fail(<condition>, …)`;
// - a marker with a modifier (`it.fails.skip`, `it.skip.fails`, `.only`, `.each`, …);
// - a data-driven marker (a template title with `${…}`), except the registered
//   geometry template;
// - a geometry entry whose check has no title in checks.ts.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(here, '..');
const SCAN = ['packages/snaplot/src', 'packages/snaplot/test', 'site/tests'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'test-results', '.astro', '__screenshots__']);
const EXTENSIONS = /\.(m?[jt]sx?)$/;
const ID = /\[((?:[a-z]+(?:-[a-z]+)*-\d{2}(?::[a-z0-9-]+)?)|(?:perf:[a-z0-9-]+))\]/g;

/** The geometry entries of M3a and the spec that runs them. */
const GEOMETRY = {
  spec: 'packages/snaplot/test/visual/geometry.spec.ts',
  checks: 'packages/snaplot/test/visual/checks.ts',
  entries: /^packages\/snaplot\/test\/visual\/expected\/m\d+[a-c]?\.[cm]?[jt]s$/,
};

export const SUITES = ['vitest', 'consumers', 'browser', 'visual', 'site'];

/**
 * The suite that executes a marker of `runner` in `file` (a path relative to
 * the repository root). vitest files under test/visual/ (M3a's unit tests) run
 * in `npm test`.
 */
export function suiteOf(file, runner) {
  if (file.startsWith('site/')) return 'site';
  if (runner === 'vitest')
    return file.startsWith('packages/snaplot/test/consumers/') ? 'consumers' : 'vitest';
  if (file.startsWith('packages/snaplot/test/visual/')) return 'visual';
  return 'browser';
}

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

// After one of these (or at the start), a `/` opens a regular expression
// literal; after an identifier, a number, `)` or `]` it is a division.
const REGEX_AFTER = new Set('(,=:[!&|?{};+-*%<>~^'.split(''));
const REGEX_AFTER_WORD =
  /(?:^|[^\w$])(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/;

/** The end (exclusive) of the regex literal opening at `start`, or -1 if it is not one. */
function regexEnd(source, out, start) {
  let k = start - 1;
  while (k >= 0 && /\s/.test(out[k])) k--;
  const before = k < 0 ? '' : out[k];
  const word = out.slice(Math.max(0, k - 11), k + 1).join('');
  if (before !== '' && !REGEX_AFTER.has(before) && !REGEX_AFTER_WORD.test(word)) return -1;
  let inClass = false;
  for (let j = start + 1; j < source.length; j++) {
    const c = source[j];
    if (c === '\n') return -1;
    if (c === '\\') j++;
    else if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) return j + 1;
  }
  return -1;
}

/**
 * Blank out comments (keeping offsets and newlines), so a marker quoted in a
 * comment is not counted. String, template and regex literal contents are
 * kept; a quote inside a regex literal does not open a string.
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
      continue;
    }
    if (c === '/') {
      const end = regexEnd(source, out, i);
      if (end > 0) i = end - 1;
    }
  }
  return out.join('');
}

/** `CHECKS` of test/visual/checks.ts: check key → test title, or null without M3a. */
function geometryTitles(root) {
  const file = path.join(root, GEOMETRY.checks);
  if (!existsSync(file)) return null;
  const text = stripComments(readFileSync(file, 'utf8'));
  const start = text.search(/\bCHECKS\b[^=]*=\s*\{/);
  if (start < 0) return null;
  const body = text.slice(start, text.indexOf('}', start));
  const titles = new Map();
  for (const match of body.matchAll(/(\w+)\s*:\s*/g)) {
    const literal = readString(body, match.index + match[0].length);
    if (literal) titles.set(match[1], literal[0]);
  }
  return titles;
}

/** The geometry entries of one expected/m<N>.ts file. */
function scanGeometry(text, relative, titles) {
  const markers = [];
  // One string argument: its quote is group n, its value group n + 1.
  const arg = (n) => `(['"])((?:\\\\.|(?!\\${n}).)*)\\${n}`;
  const comma = '\\s*,\\s*';
  const pattern = new RegExp(
    `\\bfails\\(\\s*${arg(1)}${comma}${arg(3)}${comma}${arg(5)}${comma}${arg(7)}\\s*,?\\s*\\)`,
    'g',
  );
  for (const match of text.matchAll(pattern)) {
    const [owner, fixture, check, id] = [match[2], match[4], match[6], match[8]];
    const label = titles?.get(check);
    markers.push({
      runner: 'playwright',
      suite: 'visual',
      ids: idsIn(`[${id}]`),
      file: relative,
      line: lineOf(text, match.index),
      title: label ? `${label} [${id}]` : `(unknown geometry check ${check}) [${id}]`,
      testFile: GEOMETRY.spec,
      owner,
      fixture,
      check,
      ...(label ? {} : { problem: `geometry check "${check}" has no title in ${GEOMETRY.checks}` }),
    });
  }
  return markers;
}

/** The method chain after `it`/`test` at `index` (`.fails.skip` → ['fails', 'skip']). */
function chainAt(text, index) {
  const match = text.slice(index).match(/^\b(?:it|test)((?:\s*\.\s*[A-Za-z]+)+)\s*\(/);
  return match
    ? match[1]
        .split('.')
        .map((part) => part.trim())
        .filter(Boolean)
    : [];
}

export function scanFile(file, root = DEFAULT_ROOT, titles = undefined) {
  const text = stripComments(readFileSync(file, 'utf8'));
  const relative = path.relative(root, file).split(path.sep).join('/');
  if (GEOMETRY.entries.test(relative)) {
    return scanGeometry(text, relative, titles === undefined ? geometryTitles(root) : titles);
  }
  const markers = [];
  // vitest: it.fails('<title>' / test.fails('<title>', and modified forms.
  for (const match of text.matchAll(/\b(?:it|test)(?:\s*\.\s*[A-Za-z]+)+\s*\(\s*/g)) {
    const chain = chainAt(text, match.index);
    if (!chain.includes('fails')) continue;
    const literal = readString(text, match.index + match[0].length);
    const title = literal ? literal[0] : '';
    const problems = [];
    if (chain.length > 1)
      problems.push(`${['it', ...chain].join('.')}: a modified marker may not run once`);
    if (!literal) problems.push('the title is not a string literal');
    else if (text[match.index + match[0].length] === '`' && title.includes('${'))
      problems.push('a data-driven title: list each case as its own marker');
    markers.push({
      runner: 'vitest',
      suite: suiteOf(relative, 'vitest'),
      ids: [...new Set(idsIn(title))],
      file: relative,
      line: lineOf(text, match.index),
      title,
      ...(problems.length ? { problem: problems.join('; ') } : {}),
    });
  }
  // Playwright: test.fail(<condition>, '<description>') inside test('<title>', …)
  const tests = playwrightTests(text);
  for (const match of text.matchAll(/\btest\.fail\(\s*/g)) {
    const argsStart = match.index + match[0].length;
    const close = text.indexOf(')', argsStart);
    const args = text.slice(argsStart, close < 0 ? argsStart : close);
    // The registered data-driven template (geometry.spec.ts): its cases are the
    // expected/m<N>.ts entries.
    if (relative === GEOMETRY.spec && /^\s*true\s*,\s*`[^`]*\$\{/.test(args)) continue;
    // `test.fail(title, body)` (declaration form) has a string first argument.
    const declaration = readString(text, argsStart);
    let title;
    if (declaration) title = declaration[0];
    else {
      const enclosing = tests.filter((test) => test.index < match.index).at(-1);
      title = enclosing?.title ?? '';
    }
    const problems = [];
    if (!declaration && !/^\s*true\s*,/.test(args))
      problems.push(
        "a conditional test.fail: use test.fail(true, '[id]') so the count stays exact",
      );
    if (/`[^`]*\$\{/.test(args) || (declaration && text[argsStart] === '`' && title.includes('${')))
      problems.push('a data-driven description: list each case as its own marker');
    markers.push({
      runner: 'playwright',
      suite: suiteOf(relative, 'playwright'),
      ids: [...new Set([...idsIn(title), ...(declaration ? [] : idsIn(args))])],
      file: relative,
      line: lineOf(text, match.index),
      title,
      ...(problems.length ? { problem: problems.join('; ') } : {}),
    });
  }
  return markers;
}

export function scanLedger(root = DEFAULT_ROOT) {
  const files = SCAN.flatMap((dir) => walk(path.join(root, dir), []));
  const titles = geometryTitles(root);
  return files.sort().flatMap((file) => scanFile(file, root, titles));
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
    const bySuite = Object.fromEntries(SUITES.map((suite) => [suite, 0]));
    for (const marker of markers) {
      byRunner[marker.runner]++;
      bySuite[marker.suite]++;
    }
    const ids = new Set(markers.flatMap((marker) => marker.ids));
    const suites = SUITES.filter((suite) => bySuite[suite])
      .map((suite) => `${suite} ${bySuite[suite]}`)
      .join(', ');
    console.log(
      `\n${markers.length} expected-failure markers (vitest ${byRunner.vitest}, playwright ${byRunner.playwright}; by suite: ${suites || 'none'}), ${ids.size} distinct ids`,
    );
  }

  let status = 0;
  for (const marker of markers) {
    const where = `${marker.file}:${marker.line}`;
    if (marker.ids.length === 0) {
      console.error(`ledger: marker without an [id] at ${where}`);
      status = 1;
    }
    if (marker.problem) {
      console.error(`ledger: ${marker.problem} at ${where}`);
      status = 1;
    }
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
