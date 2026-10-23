// Known M7 type-level defects (plan RC15, §4.4: one self-contained public type
// system). Each snippet is the documented or obvious pattern a typed-rows user
// writes; it must compile under `strict` against the public entry. The
// snippets compile once, in one TypeScript program, with the compiler API.
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

const entry = decodeURIComponent(new URL('../../src/index.ts', import.meta.url).pathname);
/** Snippets live in memory, next to this file, so nothing is written to disk. */
const snippetDir = decodeURIComponent(new URL('./__types__/', import.meta.url).pathname);

const header = `
import { createChart, type ChartHandle, type ChartOptions, type ChartPlugin } from ${JSON.stringify(entry.replace(/\.ts$/, ''))};
declare const el: HTMLElement;
interface Sample { time: Date; cpu: number; memory: number }
declare const samples: Sample[];
interface Loss { step: number; loss: number }
interface Acc { step: number; acc: number }
declare const losses: Loss[];
declare const accs: Acc[];
void createChart; void el; void samples; void losses; void accs;
export {};
`;

/** One snippet per expected-to-compile pattern. */
const snippets: Record<string, string> = {
  perSeriesRows: `
    createChart(el, {
      x: 'step',
      series: [
        { id: 'loss', data: losses, y: 'loss' },
        { id: 'acc', data: accs, y: 'acc' },
      ],
    });`,
  typedHandleIsAChartHandle: `
    const handle: ChartHandle = createChart<Loss>(el, { data: losses, x: 'step', series: [{ y: 'loss' }] });
    void handle;`,
  genericPlugin: `
    const readout: ChartPlugin = { id: 'readout' };
    createChart(el, { data: samples, x: 'time', series: [{ y: 'cpu' }], plugins: [readout] });`,
  mappedSeries: `
    interface Run { id: string; name: string; samples: { step: number; loss: number }[] }
    const runs: Run[] = [];
    const series = runs.map((run) => ({ id: run.id, label: run.name, data: run.samples, y: 'loss' }));
    createChart(el, { x: 'step', series });`,
  numericFormat: `
    createChart(el, {
      data: samples,
      x: 'time',
      series: [{ y: 'cpu' }],
      axes: { y: { format: (value) => \`\${value.toFixed(1)}%\` } },
    });`,
  separateOptions: `
    const options = {
      data: samples,
      x: 'time',
      series: [{ y: 'cpu', type: 'area' }],
    } satisfies ChartOptions<Sample>;
    createChart(el, options);`,
  misspelledFieldIsRejected: `
    // @ts-expect-error a misspelled field must stay a type error (control)
    createChart(el, { data: samples, x: 'time', series: [{ y: 'cpuu' }] });`,
};

const diagnostics = new Map<string, string[]>();

beforeAll(() => {
  const files = new Map(
    Object.entries(snippets).map(([name, body]) => [
      `${snippetDir}${name}.ts`,
      { name, text: `${header}\n${body}\n` },
    ]),
  );
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
    types: [],
    isolatedModules: true,
  };
  const host = ts.createCompilerHost(options);
  const { getSourceFile, fileExists, readFile } = host;
  host.getSourceFile = (file, language, ...rest) => {
    const virtual = files.get(file);
    return virtual
      ? ts.createSourceFile(file, virtual.text, language)
      : getSourceFile.call(host, file, language, ...rest);
  };
  host.fileExists = (file) => files.has(file) || fileExists.call(host, file);
  host.readFile = (file) => files.get(file)?.text ?? readFile.call(host, file);
  const program = ts.createProgram([...files.keys()], options, host);
  for (const [file, { name }] of files) {
    const source = program.getSourceFile(file);
    const found = source
      ? [...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source)]
      : [];
    diagnostics.set(
      name,
      found.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n').split('\n')[0]),
    );
  }
}, 60_000);

describe('typed rows compile with the public types', () => {
  it('a misspelled field stays a type error (control)', () => {
    expect(diagnostics.get('misspelledFieldIsRejected')).toEqual([]);
  });

  it.fails('[dataapi-08] series with different row shapes type each series by its own data', () => {
    expect(diagnostics.get('perSeriesRows')).toEqual([]);
  });

  it.fails('[dataapi-08] a typed handle is assignable to ChartHandle', () => {
    expect(diagnostics.get('typedHandleIsAChartHandle')).toEqual([]);
  });

  it.fails('[dataapi-08][dxtrial-05] a ChartPlugin is assignable to a typed chart', () => {
    expect(diagnostics.get('genericPlugin')).toEqual([]);
  });

  it.fails('[dxtrial-05] series built with .map() compile', () => {
    expect(diagnostics.get('mappedSeries')).toEqual([]);
  });

  it.fails('[dxtrial-05] a value axis format receives a number', () => {
    expect(diagnostics.get('numericFormat')).toEqual([]);
  });

  it('options declared separately with `satisfies ChartOptions<Row>` compile (control)', () => {
    expect(diagnostics.get('separateOptions')).toEqual([]);
  });
});
