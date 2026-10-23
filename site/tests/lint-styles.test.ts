// Style lint for the site (plan §9, uisite-19). Presentational inline styles and !important
// caused the old site's hover, focus and responsive bugs, so site/src has none; component styles
// live in classes with real :hover and :focus-visible states. Also: no shouting eyebrows, no
// gradients or shadows on the homepage, radius at most 6px, and tokens that keep their contrast.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const site = fileURLToPath(new URL('..', import.meta.url));
const src = join(site, 'src');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

/** site/src files of these kinds, minus generated and demo-owned data. */
const sources = walk(src)
  .filter((file) => /\.(astro|tsx|ts|mdx|css)$/.test(file))
  .filter((file) => !relative(src, file).startsWith('content/docs/reference/api/'))
  .map((file) => ({ path: relative(site, file), text: readFileSync(file, 'utf8') }));

/**
 * The only inline styles allowed: chart host heights (plan §9). Each entry names the file and a
 * pattern its inline style must match.
 */
const INLINE_STYLE_ALLOW: { file: RegExp; style: RegExp }[] = [
  { file: /^src\/(demos|examples)\//, style: /^style=\{\{\s*height:\s*\d+\s*\}\}$/ },
];

/** Blanks out comments, keeping offsets, so a rule can mention what it bans. */
function withoutComments(text: string): string {
  const blank = (c: string) => c.replace(/[^\n]/g, ' ');
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, blank)
    .replace(/(^|[^:])\/\/.*$/gm, (m, lead: string) => lead + blank(m.slice(lead.length)));
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

/** CSS rule blocks (selector and body), from .css files and <style> blocks. */
function cssBlocks(file: {
  path: string;
  text: string;
}): { selector: string; body: string; line: number }[] {
  const css = file.path.endsWith('.css')
    ? [{ text: file.text, offset: 0 }]
    : [...file.text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => ({
        text: m[1] ?? '',
        offset: (m.index ?? 0) + m[0].indexOf(m[1] ?? ''),
      }));
  const blocks = [];
  for (const { text, offset } of css) {
    const stripped = text.replace(/\/\*[\s\S]*?\*\//g, (c) => ' '.repeat(c.length));
    for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      blocks.push({
        selector: (m[1] ?? '').trim(),
        body: m[2] ?? '',
        line: lineOf(file.text, offset + (m.index ?? 0)),
      });
    }
  }
  return blocks;
}

describe('[uisite-19] no presentational inline styles and no !important in site/src', () => {
  it('has no inline style attributes outside the chart-height allow-list', () => {
    const found: string[] = [];
    for (const file of sources.filter((f) => /\.(astro|tsx|mdx)$/.test(f.path))) {
      // style={{…}} (JSX and Astro), style={…} and style="…" attributes in markup.
      for (const m of file.text.matchAll(/\sstyle=(\{\{[^}]*\}\}|\{[^}]*\}|"[^"]*"|'[^']*')/g)) {
        const attribute = m[0].trim();
        const allowed = INLINE_STYLE_ALLOW.some(
          (a) => a.file.test(file.path) && a.style.test(attribute),
        );
        // A style written inside a code sample's comment (e.g. the sized container hint) is text.
        const lineText = file.text.split('\n')[lineOf(file.text, m.index ?? 0) - 1] ?? '';
        if (!allowed && !/^\s*(\/\/|\*)/.test(lineText)) {
          found.push(`${file.path}:${lineOf(file.text, m.index ?? 0)} ${attribute}`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it('has no !important', () => {
    const found = sources.flatMap((file) =>
      [...withoutComments(file.text).matchAll(/!important/g)].map(
        (m) => `${file.path}:${lineOf(file.text, m.index ?? 0)}`,
      ),
    );
    expect(found).toEqual([]);
  });
});

describe('[uisite-19] the visual rules of plan §9', () => {
  it('has no uppercase eyebrows (text-transform: uppercase with letter-spacing over 0.05em)', () => {
    const found: string[] = [];
    for (const file of sources) {
      for (const block of cssBlocks(file)) {
        if (!/text-transform:\s*uppercase/.test(block.body)) continue;
        const spacing = /letter-spacing:\s*(-?[\d.]+)(em|px|rem)/.exec(block.body);
        if (!spacing) continue;
        const value = Number(spacing[1]);
        const em = spacing[2] === 'px' ? value / 16 : value;
        if (em > 0.05) found.push(`${file.path}:${block.line} ${block.selector}`);
      }
    }
    expect(found).toEqual([]);
  });

  it('has no gradients or shadows on the homepage', () => {
    const homepage = [
      'src/pages/index.astro',
      'src/layouts/Site.astro',
      'src/styles/site.css',
      'src/styles/base.css',
      'src/styles/tokens.css',
    ];
    const found = sources
      .filter((file) => homepage.includes(file.path))
      .flatMap((file) =>
        [...file.text.matchAll(/linear-gradient|radial-gradient|box-shadow/g)].map(
          (m) => `${file.path}:${lineOf(file.text, m.index ?? 0)} ${m[0]}`,
        ),
      );
    expect(found).toEqual([]);
  });

  it('keeps every border radius at 6px or less', () => {
    const found: string[] = [];
    for (const file of sources) {
      for (const block of cssBlocks(file)) {
        for (const m of block.body.matchAll(/border-radius:\s*([^;]+)/g)) {
          for (const v of (m[1] ?? '').matchAll(/([\d.]+)(px|rem|em|%)/g)) {
            const px = v[2] === 'px' ? Number(v[1]) : v[2] === '%' ? Infinity : Number(v[1]) * 16;
            if (px > 6) found.push(`${file.path}:${block.line} ${m[0]}`);
          }
        }
      }
    }
    expect(found).toEqual([]);
  });

  it('[uisite-07] applies tabular figures only to .num, tables and code', () => {
    const found: string[] = [];
    for (const file of sources) {
      for (const block of cssBlocks(file)) {
        if (!/font-variant-numeric:\s*tabular-nums/.test(block.body)) continue;
        const selectors = block.selector.split(',').map((s) => s.trim());
        const allowed = selectors.every((s) => /^(table|code|pre|kbd|\.num|td|th)\b/.test(s));
        if (!allowed) found.push(`${file.path}:${block.line} ${block.selector}`);
      }
    }
    expect(found).toEqual([]);
  });
});

describe('[uisite-06] the colour tokens keep their contrast', () => {
  const tokens = readFileSync(join(src, 'styles/tokens.css'), 'utf8');
  const theme = (selector: string) => {
    const start = tokens.indexOf(`${selector} {`);
    const body = tokens.slice(start, tokens.indexOf('}', start));
    const get = (name: string) => {
      const value = new RegExp(`--snaplot-${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(body)?.[1];
      if (!value) throw new Error(`no --snaplot-${name} in ${selector}`);
      return value;
    };
    return {
      background: get('background'),
      surface: get('surface'),
      ink: get('ink'),
      secondary: get('ink-secondary'),
      accent: get('accent'),
    };
  };
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
  };

  for (const [mode, selector] of [
    ['dark', ':root'],
    ['light', `:root[data-theme="light"]`],
  ] as const) {
    it(`${mode}: ink ≥ 7:1, secondary ink ≥ 7:1, accent ≥ 4.5:1 on the background`, () => {
      const t = theme(selector);
      expect(contrast(t.ink, t.background)).toBeGreaterThanOrEqual(7);
      expect(contrast(t.secondary, t.background)).toBeGreaterThanOrEqual(7);
      expect(contrast(t.accent, t.background)).toBeGreaterThanOrEqual(4.5);
      // Text on the surface (code blocks, the current page in the sidebar).
      expect(contrast(t.secondary, t.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.accent, t.surface)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
