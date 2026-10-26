// The M15a pages (plan §8.1 pages 1, 2, 4–8, 13 and the page-20 draft) against the example style
// guide: every page runs examples (three tabs each, which the smoke spec executes), every example
// is a file under src/examples/ on real data with a provenance line and an accessible name, and
// the framework pages teach their own framework (docs-01, dxtrial-16, frameworks-18).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const site = fileURLToPath(new URL('..', import.meta.url));
const docs = join(site, 'src/content/docs');
const examples = join(site, 'src/examples');

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

const read = (path: string) => readFileSync(path, 'utf8');
const page = (slug: string) => read(join(docs, `${slug}.mdx`));

/** The example names a page mounts with <Example name="…" />. */
const examplesOn = (text: string) =>
  [...text.matchAll(/<Example name="([^"]+)"/g)].map((m) => m[1]);

/** The pages M15a writes, with the least number of examples each runs. */
const PAGES: Record<string, number> = {
  introduction: 1,
  'first-chart': 1,
  'frameworks/vanilla': 3,
  'frameworks/react': 3,
  'frameworks/solid': 3,
  'guides/data': 4,
  'guides/updating': 3,
  'guides/linked-charts': 2,
  'migrate-0-12': 1,
};

/** The example folders M15a owns (plan §12 M15a). */
const OWNED = ['start', 'frameworks', 'data-guide', 'updating', 'linked'];
const ownedFiles = OWNED.flatMap((folder) => walk(join(examples, folder))).map((file) => ({
  path: relative(examples, file),
  text: read(file),
}));

describe('the M15a pages', () => {
  it('[frameworks-18] every page is written, not an outline, and runs its examples', () => {
    const files = walk(examples).map((file) => relative(examples, file));
    for (const [slug, least] of Object.entries(PAGES)) {
      const text = page(slug);
      expect(text, slug).not.toMatch(/:::note\[Draft\]|Outline only/);
      const names = examplesOn(text);
      expect(names.length, `${slug} runs at least ${least} example(s)`).toBeGreaterThanOrEqual(
        least,
      );
      for (const name of names) {
        expect(
          files.some((file) => file.startsWith(`${name}.`)),
          `${slug}: example ${name}`,
        ).toBe(true);
      }
    }
  });

  it('[docs-01] each framework page mounts examples from its own folder', () => {
    for (const framework of ['vanilla', 'react', 'solid']) {
      const names = examplesOn(page(`frameworks/${framework}`));
      expect(
        names.filter((name) => name?.startsWith(`frameworks/${framework}-`)).length,
        framework,
      ).toBeGreaterThan(0);
    }
  });
});

describe('[dxtrial-16] the examples behind them', () => {
  it('[dxtrial-16] exist in every owned folder', () => {
    for (const folder of OWNED) {
      expect(walk(join(examples, folder)).length, folder).toBeGreaterThan(0);
    }
  });

  it('read real data: the docs data slices, or an inline extract that names its source', () => {
    const synthetic = ownedFiles.filter(
      (file) => !/from '\.\.\/data\//.test(file.text) && !/\/\/ Source: /.test(file.text),
    );
    expect(synthetic.map((file) => file.path)).toEqual([]);
  });

  it('never make data up or use placeholder names', () => {
    const found = ownedFiles.filter((file) =>
      /Math\.random|value1|value2|Series A|Metric A/.test(file.text),
    );
    expect(found.map((file) => file.path)).toEqual([]);
  });

  it('give every chart an accessible name', () => {
    const found = ownedFiles.filter((file) => {
      const charts = (
        file.text.match(/createChart(<[^>]*>)?\(|<Chart\b|^export default \{/gm) ?? []
      ).length;
      const names = (file.text.match(/ariaLabel/g) ?? []).length;
      return names < charts;
    });
    expect(found.map((file) => file.path)).toEqual([]);
  });

  it('import React code from snaplot/react and Solid code from snaplot/solid', () => {
    for (const file of ownedFiles) {
      if (file.path.endsWith('.react.tsx'))
        expect(file.text, file.path).toMatch(/'snaplot\/react'/);
      if (file.path.endsWith('.solid.tsx'))
        expect(file.text, file.path).toMatch(/'snaplot\/solid'/);
    }
  });
});

describe('[docs-01][dxtrial-16] what each framework page teaches', () => {
  it('[dxtrial-16] React: useRef, the hooks, state options, LegendTable, useMemo, React 18 and 19, Next.js, jsdom', () => {
    const text = page('frameworks/react');
    for (const term of [
      'useRef',
      'useChartState',
      'useCursor',
      'onViewportChange',
      'LegendTable',
      'useMemo',
      'appendData',
      'React 18.3',
      "'use client'",
      'jsdom',
      'createChartGroup',
    ]) {
      expect(text, term).toContain(term);
    }
  });

  it('[docs-01] Solid: refs (function and variable), the primitives with accessors, LegendTable, createMemo, SSR and the solid condition', () => {
    const text = page('frameworks/solid');
    for (const term of [
      'ref={chart}',
      'createSignal',
      'createChartState',
      'createCursor',
      'LegendTable',
      'createMemo',
      'SolidStart',
      'solid.jsx',
      'createChartGroup',
    ]) {
      expect(text, term).toContain(term);
    }
  });

  it('[docs-01] Vanilla: lifecycle, update and setOptions, events, groups, the legend table, cleanup and the no-build path', () => {
    const text = page('frameworks/vanilla');
    for (const term of [
      'createChart',
      'destroy()',
      'setOptions',
      'update(',
      "chart.on('",
      'onFollowingChange',
      'createChartGroup',
      'createLegendTable',
      '<script type="module">',
      'cdn.jsdelivr.net/npm/snaplot@',
    ]) {
      expect(text, term).toContain(term);
    }
  });
});
