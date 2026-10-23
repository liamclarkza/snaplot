import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FRAMEWORKS, exampleKind, optionsTabSource, tabFileName, tabSource } from './examples';

const OPTIONS = `import type { ChartOptions } from 'snaplot';

type Row = { day: number; high: number };

export default {
  data: [] as Row[],
  x: 'day',
  series: [{ y: 'high' }],
} satisfies ChartOptions<Row>;
`;

describe('[uisite-16][docs-04] option-level examples become one runnable file per tab', () => {
  it('vanilla: the createChart import, the options, then a sized mount', () => {
    expect(optionsTabSource(OPTIONS, 'vanilla')).toBe(
      [
        "import { createChart } from 'snaplot';",
        "import type { ChartOptions } from 'snaplot';",
        '',
        'type Row = { day: number; high: number };',
        '',
        'const options = {',
        '  data: [] as Row[],',
        "  x: 'day',",
        "  series: [{ y: 'high' }],",
        '} satisfies ChartOptions<Row>;',
        '',
        '// <div id="chart" style="height: 280px"></div>',
        "createChart(document.getElementById('chart')!, options);",
        '',
      ].join('\n'),
    );
  });

  it('React and Solid: the Chart import and <Chart {...options} height={280} />', () => {
    for (const [framework, from] of [
      ['react', 'snaplot/react'],
      ['solid', 'snaplot/solid'],
    ] as const) {
      const source = optionsTabSource(OPTIONS, framework);
      expect(source.startsWith(`import { Chart } from '${from}';\n`)).toBe(true);
      expect(source).toContain('const options = {');
      expect(source).not.toContain('export default');
      expect(
        source.endsWith(
          'export function Example() {\n  return <Chart {...options} height={280} />;\n}\n',
        ),
      ).toBe(true);
    }
  });

  it('needs exactly one default export', () => {
    expect(() => optionsTabSource('const a = 1;\n', 'vanilla')).toThrow(/exactly one/);
    expect(() => optionsTabSource('export default {};\nexport default {};\n', 'vanilla')).toThrow(
      /found 2/,
    );
  });

  it('integration examples show their own file verbatim', () => {
    const files = { vanilla: 'a', react: 'b\n', solid: 'c' };
    expect(tabSource('integration', 'vanilla', { files })).toBe('a\n');
    expect(tabSource('integration', 'react', { files })).toBe('b\n');
    expect(tabFileName('frameworks/legend', 'integration', 'solid')).toBe('legend.solid.tsx');
    expect(tabFileName('start/minimal', 'options', 'react')).toBe('minimal.tsx');
  });
});

describe('example names resolve to files, or fail the build', () => {
  it('an options file, or all three integration files', () => {
    expect(exampleKind('a/b', new Set(['a/b.options.ts']))).toBe('options');
    expect(exampleKind('a/b', new Set(['a/b.ts', 'a/b.react.tsx', 'a/b.solid.tsx']))).toBe(
      'integration',
    );
    expect(() => exampleKind('a/b', new Set(['a/b.ts', 'a/b.react.tsx']))).toThrow(
      /missing a\/b\.solid\.tsx/,
    );
    expect(() => exampleKind('a/b', new Set(['a/b.options.ts', 'a/b.ts']))).toThrow(/both/);
    expect(() => exampleKind('a/c', new Set())).toThrow(/needs a\/c\.options\.ts/);
  });

  it('every example on disk is complete and every options file converts', () => {
    const root = fileURLToPath(new URL('../examples', import.meta.url));
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    const files = walk(root)
      .map((f) => relative(root, f))
      .filter((f) => !f.startsWith('data/'));
    const names = new Set(
      files.map((f) => f.replace(/(\.options\.ts|\.react\.tsx|\.solid\.tsx|\.ts)$/, '')),
    );
    expect(names.size).toBeGreaterThan(0);
    for (const name of names) {
      const kind = exampleKind(name, new Set(files));
      if (kind === 'options') {
        const source = readFileSync(join(root, `${name}.options.ts`), 'utf8');
        for (const { id } of FRAMEWORKS) expect(() => optionsTabSource(source, id)).not.toThrow();
      }
    }
  });
});
