// @vitest-environment jsdom
// The final public surface (plan §4.4, RC13): one core entry, one name per concept in each entry,
// adapters built on the public handle only, and a full-snapshot setter an adapter for any
// framework can drive. M13 finalises the adapters with the conformance suite.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as core from '../../src/index';
import * as react from '../../src/react';
import * as solid from '../../src/solid';
import { debug, type Fakes, installFakes } from '../fakes';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('[repo-19][frameworks-13] one entry and one name per concept', () => {
  it('[repo-19] snaplot/core and the stylesheet export are gone: one core entry', () => {
    const manifest = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
    expect(Object.keys(manifest.exports)).toEqual(['.', './react', './solid', './package.json']);
  });

  it('[frameworks-13] each entry exports the 1.0 names and no second way to do the same thing', () => {
    expect(Object.keys(core).sort()).toEqual([
      'createChart',
      'createChartGroup',
      'createLegendTable',
      'histogram',
    ]);
    expect(Object.keys(react).sort()).toEqual([
      'Chart',
      'LegendTable',
      'createChartGroup',
      'histogram',
      'useChartState',
      'useCursor',
    ]);
    expect(Object.keys(solid).sort()).toEqual([
      'Chart',
      'LegendTable',
      'createChartGroup',
      'createChartState',
      'createCursor',
      'histogram',
    ]);
  });

  it('[repo-19][frameworks-13] a name two entries export is one binding', () => {
    const coreNames = core as Record<string, unknown>;
    for (const entry of [react, solid] as Record<string, unknown>[]) {
      for (const name of Object.keys(entry).filter((key) => key in coreNames))
        expect(entry[name], name).toBe(coreNames[name]);
    }
  });
});

describe('[frameworks-12] the adapters use the public handle only', () => {
  /** Every relative import of the adapter sources, resolved against src/. */
  function adapterImports(): string[] {
    const src = join(pkg, 'src');
    const files = [
      join(src, 'react.ts'),
      join(src, 'solid.ts'),
      ...['react', 'solid'].flatMap((dir) =>
        readdirSync(join(src, dir))
          .filter((name) => /\.tsx?$/.test(name))
          .map((name) => join(src, dir, name)),
      ),
    ];
    return files.flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/from '(\.[^']+)'/g)].map((match) =>
        relative(src, resolve(dirname(file), match[1])),
      ),
    );
  }

  it('[frameworks-12] React and Solid import only src/public, besides their own modules', () => {
    const imports = adapterImports();
    expect(imports.length).toBeGreaterThan(0);
    for (const target of imports)
      expect(target).toMatch(/^(public\/|react\/|solid\/|adapters\/bind$)/);
  });
});

describe('[research-08] a full-snapshot setter is enough for an adapter', () => {
  let fakes: Fakes;
  beforeEach(() => {
    fakes = installFakes();
  });
  afterEach(() => {
    fakes.uninstall();
    vi.restoreAllMocks();
  });

  type Row = { t: number; cpu: number };
  const rows: Row[] = Array.from({ length: 50 }, (_, t) => ({ t, cpu: 40 + (t % 7) }));

  /** A store of whole option snapshots, as Vue, Svelte or a web component would hold. */
  function store(initial: core.ChartOptions<Row>) {
    let value = initial;
    const listeners = new Set<() => void>();
    return {
      get: () => value,
      set(next: core.ChartOptions<Row>) {
        value = next;
        for (const listener of listeners) listener();
      },
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
  }

  /** The whole adapter: createChart, setOptions on every snapshot, getState out. */
  function bind(element: HTMLElement, options: ReturnType<typeof store>) {
    const chart = core.createChart(element, options.get());
    const stop = options.subscribe(() => chart.setOptions(options.get()));
    const states: core.ChartState[] = [];
    const unsubscribe = chart.subscribe(() => states.push(chart.getState()));
    return {
      chart,
      states,
      destroy() {
        stop();
        unsubscribe();
        chart.destroy();
      },
    };
  }

  it('[research-08] snapshots apply what changed, state options included, and nothing else', () => {
    const element = document.createElement('div');
    fakes.layout.setSize(element, 480, 240);
    document.body.append(element);
    const base: core.ChartOptions<Row> = { data: rows, x: 't', series: [{ y: 'cpu' }] };
    const options = store(base);
    const bound = bind(element, options);
    const ingests = () => debug(bound.chart).ingestCount;
    const before = ingests();

    options.set({ ...base, axes: { y: { title: 'CPU (%)' } } });
    options.set({ ...base, axes: { y: { title: 'CPU (%)' } }, viewport: { x: [10, 20] } });
    fakes.frames.flush();
    expect(ingests()).toBe(before);
    expect(bound.chart.getState()).toMatchObject({ viewport: { x: [10, 20] }, following: false });
    expect(bound.states.at(-1)).toBe(bound.chart.getState());

    // An equal snapshot is a no-op; leaving the viewport out returns it to the default.
    const revision = bound.chart.getState().revision;
    options.set({ ...base, axes: { y: { title: 'CPU (%)' } }, viewport: { x: [10, 20] } });
    expect(bound.chart.getState().revision).toBe(revision);
    options.set({ ...base, axes: { y: { title: 'CPU (%)' } } });
    expect(bound.chart.getState().viewport).toEqual({});
    expect(ingests()).toBe(before);
    bound.destroy();
  });
});
