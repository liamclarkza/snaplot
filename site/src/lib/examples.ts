/**
 * The example pipeline (plan §8.3). Every sample on the site is a file under `src/examples/` that
 * the build type-checks (`npm run check:examples`) and the smoke spec executes in each tab.
 *
 * - **Option-level examples** are written once, as `<page>/<name>.options.ts`, which default-exports
 *   options with `satisfies ChartOptions<Row>`. Each framework tab shows one runnable file: the
 *   tab's import, the options file with its default export bound to `options`, then the tab's
 *   mount of 3–5 lines. Copy copies exactly that file.
 * - **Integration examples**, whose code differs by framework, are three hand-written files:
 *   `<name>.ts` (default `(el) => ChartHandle`), `<name>.react.tsx` and `<name>.solid.tsx` (each a
 *   default component). Each tab shows its file verbatim.
 *
 * This module is plain TypeScript with no Astro or Vite imports, so the check script and the tests
 * run it directly under Node's type stripping.
 */

export type Framework = 'vanilla' | 'react' | 'solid';
export type ExampleKind = 'options' | 'integration';

export interface FrameworkTab {
  id: Framework;
  label: string;
  /** Code language for the highlighter. */
  lang: 'ts' | 'tsx';
  /** Suffix of the integration file and of the generated per-tab file. */
  suffix: '.ts' | '.react.tsx' | '.solid.tsx';
}

export const FRAMEWORKS: readonly FrameworkTab[] = [
  { id: 'vanilla', label: 'Vanilla', lang: 'ts', suffix: '.ts' },
  { id: 'react', label: 'React', lang: 'tsx', suffix: '.react.tsx' },
  { id: 'solid', label: 'Solid', lang: 'tsx', suffix: '.solid.tsx' },
];

/** The height every option-level example mounts at, in CSS pixels. */
export const EXAMPLE_HEIGHT = 280;

/** The fixed mount templates (plan §8.1): one import line, then the mount after the options. */
const TEMPLATES: Record<Framework, { imports: string; mount: string }> = {
  vanilla: {
    imports: "import { createChart } from 'snaplot';",
    mount: [
      `// <div id="chart" style="height: ${EXAMPLE_HEIGHT}px"></div>`,
      "createChart(document.getElementById('chart')!, options);",
    ].join('\n'),
  },
  react: {
    imports: "import { Chart } from 'snaplot/react';",
    mount: [
      'export function Example() {',
      `  return <Chart {...options} height={${EXAMPLE_HEIGHT}} />;`,
      '}',
    ].join('\n'),
  },
  solid: {
    imports: "import { Chart } from 'snaplot/solid';",
    mount: [
      'export function Example() {',
      `  return <Chart {...options} height={${EXAMPLE_HEIGHT}} />;`,
      '}',
    ].join('\n'),
  },
};

const DEFAULT_EXPORT = /^export default /gm;

/**
 * The runnable file a tab shows and copies for an option-level example: the tab's import, the
 * options file with `export default` replaced by `const options =`, then the tab's mount.
 */
export function optionsTabSource(optionsSource: string, framework: Framework): string {
  const exports = optionsSource.match(DEFAULT_EXPORT) ?? [];
  if (exports.length !== 1) {
    throw new Error(
      `an options example needs exactly one line starting with "export default " (found ${exports.length})`,
    );
  }
  const template = TEMPLATES[framework];
  const body = optionsSource.replace(DEFAULT_EXPORT, 'const options = ').trim();
  return `${template.imports}\n${body}\n\n${template.mount}\n`;
}

/** The text a tab shows (and Copy copies), given the example's source files. */
export function tabSource(
  kind: ExampleKind,
  framework: Framework,
  sources: { options?: string; files?: Partial<Record<Framework, string>> },
): string {
  if (kind === 'options') {
    if (sources.options === undefined) throw new Error('missing the options file');
    return optionsTabSource(sources.options, framework);
  }
  const file = sources.files?.[framework];
  if (file === undefined) throw new Error(`missing the ${framework} file`);
  return file.endsWith('\n') ? file : `${file}\n`;
}

/** The file name a tab's code frame shows. */
export function tabFileName(name: string, kind: ExampleKind, framework: Framework): string {
  const base = name.split('/').pop() ?? name;
  const tab = FRAMEWORKS.find((f) => f.id === framework)!;
  if (kind === 'integration') return `${base}${tab.suffix}`;
  return framework === 'vanilla' ? `${base}.ts` : `${base}.tsx`;
}

/**
 * Which kind an example name is, from the files that exist (paths relative to `src/examples/`).
 * Throws with the expected file names when neither set is complete, so a typo fails the build.
 */
export function exampleKind(name: string, files: ReadonlySet<string>): ExampleKind {
  const hasOptions = files.has(`${name}.options.ts`);
  const integration = FRAMEWORKS.map((f) => `${name}${f.suffix}`);
  const present = integration.filter((file) => files.has(file));
  if (hasOptions && present.length > 0) {
    throw new Error(`example "${name}" has both ${name}.options.ts and ${present.join(', ')}`);
  }
  if (hasOptions) return 'options';
  if (present.length === integration.length) return 'integration';
  const missing = integration.filter((file) => !files.has(file));
  throw new Error(
    `example "${name}" needs ${name}.options.ts, or all of ${integration.join(', ')} (missing ${missing.join(', ')})`,
  );
}
