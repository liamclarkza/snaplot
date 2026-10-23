import { describe, expect, it } from 'vitest';
import manifestText from '../package.json?raw';

// The golden public declarations (plan §11.3 G7). `npm run check:api` compares them with a build;
// these checks run on the committed copies, without one.
const golden = import.meta.glob<string>('../api/*.d.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const manifest = JSON.parse(manifestText) as {
  exports: Record<string, string | { types?: string }>;
};

/** P4: public declarations never name these engine types. */
const FORBIDDEN = ['EngineConfig', 'ChartCore', 'SeriesConfig', 'ChartInstance'];

describe('golden public declarations (api/*.d.ts)', () => {
  it('exist for exactly the entries the exports map types', () => {
    const typed = Object.values(manifest.exports).flatMap((target) =>
      typeof target === 'object' && target.types
        ? [target.types.replace('./dist/', '../api/')]
        : [],
    );
    expect(Object.keys(golden).sort()).toEqual([...new Set(typed)].sort());
  });

  // The public types are written in public/types.ts, not derived from the engine (research-12).
  it('[research-12] name no engine type (P4)', () => {
    const found = Object.entries(golden).flatMap(([file, text]) =>
      FORBIDDEN.filter((name) => new RegExp(`\\b${name}\\b`).test(text)).map(
        (name) => `${file}: ${name}`,
      ),
    );
    expect(found).toEqual([]);
  });
});
