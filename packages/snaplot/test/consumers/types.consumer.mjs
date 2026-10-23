// TypeScript consumers under every module resolution a published ESM package meets, without
// skipLibCheck. Each probe below must be a type error; if an import silently became `any`, the
// `@ts-expect-error` is unused and tsc fails (frameworks-10, repo-01).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { consumerDir, jsEntries, node, write } from './helpers/consumer.mjs';

const SOURCE = `
import { createChart, createChartGroup, histogram, type ChartHandle, type ChartOptions } from 'snaplot';
import { Chart as ReactChart, type ChartProps as ReactProps } from 'snaplot/react';
import { Chart as SolidChart, type ChartProps as SolidProps } from 'snaplot/solid';
${jsEntries.map((spec, i) => `import * as entry${i} from '${spec}';`).join('\n')}

type Row = { time: number; cpu: number; label: string };

// Real types, not \`any\`: every assignment below is rejected.
// @ts-expect-error createChart is a function
export const notAny1: string = createChart;
// @ts-expect-error createChartGroup is a function
export const notAny2: string = createChartGroup;
// @ts-expect-error histogram is a function
export const notAny3: string = histogram;
// @ts-expect-error the React Chart is a component
export const notAny4: string = ReactChart;
// @ts-expect-error the Solid Chart is a component
export const notAny5: string = SolidChart;
${jsEntries.map((_, i) => `// @ts-expect-error a module namespace is not a string\nexport const entryProbe${i}: string = entry${i};`).join('\n')}

const rows: Row[] = [{ time: 1, cpu: 2, label: 'a' }];
// \`satisfies\`, not a \`ChartOptions<Row>\` annotation: until M8 deletes the framework's controlled
// props, ChartOptions' viewport and on*Change types differ from the props'. M8 restores the annotation.
const base = { data: rows, x: 'time', series: [{ y: 'cpu' }] } satisfies ChartOptions<Row>;
export const options: ChartOptions<Row> = base;
export const react: ReactProps<Row> = { ...base, viewport: { x: { min: 0, max: 2 } } };
export const solid: SolidProps<Row> = {
  ...base,
  ref: (chart: ChartHandle<Row> | undefined) => {
    chart?.setHighlight('cpu');
  },
};
export const misspelled: ReactProps<Row> = {
  series: [
    // @ts-expect-error misspelled fields are rejected
    { y: 'cpus' },
  ],
};
export const notNumeric: SolidProps<Row> = {
  series: [
    // @ts-expect-error string fields are not metrics
    { y: 'label' },
  ],
};
`;

const MODES = {
  node16: { module: 'node16', moduleResolution: 'node16' },
  nodenext: { module: 'nodenext', moduleResolution: 'nodenext' },
  bundler: { module: 'esnext', moduleResolution: 'bundler' },
};

function typecheck(mode) {
  const dir = join(consumerDir, `types-${mode}`);
  mkdirSync(dir, { recursive: true });
  write(`types-${mode}/consumer.ts`, SOURCE);
  write(
    `types-${mode}/tsconfig.json`,
    JSON.stringify({
      compilerOptions: {
        ...MODES[mode],
        target: 'es2022',
        lib: ['es2022', 'dom', 'dom.iterable'],
        strict: true,
        noEmit: true,
        skipLibCheck: false,
      },
      files: ['consumer.ts'],
    }),
  );
  return node([join(consumerDir, 'node_modules/typescript/bin/tsc'), '-p', dir]);
}

function expectClean(mode) {
  const result = typecheck(mode);
  expect(result.output, `tsc --moduleResolution ${mode}`).toBe('');
  expect(result.status).toBe(0);
}

describe('TypeScript consumers resolve real types without skipLibCheck', () => {
  it('bundler resolution', () => expectClean('bundler'));
  it('[frameworks-10][repo-01] node16 resolution', () => expectClean('node16'));
  it('[frameworks-10][repo-01] nodenext resolution', () => expectClean('nodenext'));
});
