// Copy lint for the site and the README (plan §8.3, §9): no marketing adjectives, no "live
// window" (D30: say "follow window"), no "!" in headings, sentence-case h1 and h2, at most one em
// dash per 400 words, and no "dense data" claim until ADR 0002 records that the first-paint budget was met.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const site = fileURLToPath(new URL('..', import.meta.url));
const repo = join(site, '..');
const src = join(site, 'src');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

const files = [
  ...walk(src)
    .filter((file) => /\.(astro|mdx|tsx)$/.test(file))
    .filter((file) => !relative(src, file).startsWith('content/docs/reference/api/')),
  join(repo, 'README.md'),
].map((file) => ({ path: relative(repo, file), text: readFileSync(file, 'utf8') }));

/** The prose of a file: fenced code, inline code, comments and import lines removed. */
function prose(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/^\s*(import|export)\s.*$/gm, ' ');
}

const BANNED = [
  'seamless',
  'effortless',
  'blazing',
  'lightning-fast',
  'powerful',
  'robust',
  'supercharge',
  'unlock',
  'elevate',
  'delve',
  'stunning',
  'beautiful',
  'game-chang',
  'live window',
];

/** Headings: Markdown #/## lines, <h1>/<h2> elements and frontmatter titles (each page's h1). */
function headings(file: { path: string; text: string }): { level: number; text: string }[] {
  const found: { level: number; text: string }[] = [];
  const body = file.text.replace(/```[\s\S]*?```/g, '');
  for (const m of body.matchAll(/^(#{1,6})\s+(.+)$/gm)) {
    found.push({ level: m[1]?.length ?? 0, text: m[2] ?? '' });
  }
  for (const m of body.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g)) {
    const text = (m[2] ?? '')
      .replace(/<[^>]+>/g, '')
      .replace(/\{[^}]*\}/g, 'X')
      .trim();
    found.push({ level: Number(m[1]), text });
  }
  const title = /^---\n[\s\S]*?^title:\s*(.+)$[\s\S]*?^---$/m.exec(file.text);
  if (title?.[1]) found.push({ level: 1, text: title[1].replace(/^['"]|['"]$/g, '') });
  return found;
}

/** Proper nouns that keep their capital in a sentence-case heading. */
const PROPER = new Set([
  'React',
  'Solid',
  'SolidStart',
  'Next.js',
  'Vue',
  'Svelte',
  'TypeScript',
  'JavaScript',
  'Chart.js',
  'NOAA',
  'Central',
  'Park',
  'Ridgecrest',
  'Internet',
  'Archive',
]);

/** A heading is Title Case when two or more words that are not sentence starts are capitalised. */
function isTitleCase(heading: string): boolean {
  const words = heading.split(/\s+/);
  let capitalised = 0;
  words.forEach((word, i) => {
    const sentenceStart = i === 0 || /[.:?]$/.test(words[i - 1] ?? '');
    const bare = word.replace(/^[^\w]+|[^\w.]+$/g, '');
    if (sentenceStart || bare.length < 2) return;
    // Identifiers (createChart, LegendTable), acronyms (SSR, API) and numbers are not words.
    if (/[a-z][A-Z]|^[A-Z0-9]+$|\d/.test(bare) || PROPER.has(bare)) return;
    if (/^[A-Z][a-z]/.test(bare)) capitalised++;
  });
  return capitalised >= 2;
}

/**
 * The D34 claim that snaplot suits dense data, in whatever words: "dense data", "dense datasets",
 * "dense charts", "live and dense". A mechanism, such as the README's "dense scatter uses cached
 * hit testing", says how something works, not what snaplot is for, and passes.
 */
function isDenseClaim(text: string): boolean {
  return /\bdense(?:,?\s+(?:and\s+)?(?:live|streaming|large))?\s+(?:data|datasets?|charts?|plots?|series|time[\s-]series)\b|\band\s+dense\b/i.test(
    text,
  );
}

describe('copy lint (plan §8.3)', () => {
  it('uses none of the banned words or phrases', () => {
    const found: string[] = [];
    for (const file of files) {
      const text = prose(file.text).toLowerCase();
      for (const word of BANNED) if (text.includes(word)) found.push(`${file.path}: "${word}"`);
    }
    expect(found).toEqual([]);
  });

  it('puts no "!" in headings', () => {
    const found = files.flatMap((file) =>
      headings(file)
        .filter((h) => h.text.includes('!'))
        .map((h) => `${file.path}: ${h.text}`),
    );
    expect(found).toEqual([]);
  });

  it('writes h1 and h2 in sentence case', () => {
    const found = files.flatMap((file) =>
      headings(file)
        .filter((h) => h.level <= 2 && isTitleCase(h.text))
        .map((h) => `${file.path}: ${h.text}`),
    );
    expect(found).toEqual([]);
  });

  it('uses at most one em dash per 400 words', () => {
    const found: string[] = [];
    for (const file of files) {
      const text = prose(file.text);
      const dashes = (text.match(/—/g) ?? []).length;
      const words = text.split(/\s+/).filter(Boolean).length;
      if (dashes > Math.max(1, words / 400)) {
        found.push(`${file.path}: ${dashes} em dashes in ${words} words`);
      }
    }
    expect(found).toEqual([]);
  });

  it('claims dense data only once ADR 0002 records that firstpaint-line-1m met its budget (D34)', () => {
    // M14 writes the line `firstpaint-line-1m: met` (or `missed`) into ADR 0002.
    const adr = join(repo, 'docs/decisions/0002-overhaul.md');
    const met = existsSync(adr) && /^firstpaint-line-1m: met\b/m.test(readFileSync(adr, 'utf8'));
    const found = met
      ? []
      : files.filter((file) => isDenseClaim(prose(file.text))).map((file) => file.path);
    expect(found).toEqual([]);
  });
});

describe('the Title Case detector', () => {
  it('flags Title Case and accepts sentence case, identifiers and proper nouns', () => {
    expect(isTitleCase('Your First Chart')).toBe(true);
    expect(isTitleCase('Zoom, Pan And Selection')).toBe(true);
    expect(isTitleCase('Your first chart')).toBe(false);
    expect(isTitleCase('React 18 and 19')).toBe(false);
    expect(isTitleCase('SolidStart and SSR')).toBe(false);
    expect(isTitleCase('update, setOptions and appendData')).toBe(false);
    expect(
      isTitleCase(
        'Canvas charts for live data. One options object for vanilla JS, React and Solid.',
      ),
    ).toBe(false);
  });
});

describe('the dense-claim detector (D34)', () => {
  it('flags the claim in its usual wordings and passes a mechanism', () => {
    expect(isDenseClaim('Canvas charts for live and dense data.')).toBe(true);
    expect(isDenseClaim('Built for dense datasets.')).toBe(true);
    expect(isDenseClaim('Dense charts stay responsive.')).toBe(true);
    expect(isDenseClaim('Made for dense, live data.')).toBe(true);
    expect(
      isDenseClaim(
        'Sorted series use binary-search culling; dense scatter uses cached hit testing.',
      ),
    ).toBe(false);
    expect(isDenseClaim('Scatter density and colorBy.')).toBe(false);
    expect(
      isDenseClaim(
        'Canvas charts for live data. One options object for vanilla JS, React and Solid.',
      ),
    ).toBe(false);
  });
});
