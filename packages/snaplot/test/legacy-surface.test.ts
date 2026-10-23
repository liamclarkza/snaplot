// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChartOptions } from '../src/index';
import { type Fakes, hover, installFakes } from './fakes';

// arch-10: the public types dropped the engine's key-based sync (`syncKey` on
// cursor, highlight and zoom), but untyped options still pass through to the
// engine, so two charts given the same key link outside any createChartGroup.
// M2 deletes the engine sync; M7's normalize then rejects unknown keys.

type Row = { t: number; v: number };
const rows: Row[] = Array.from({ length: 100 }, (_, t) => ({ t, v: Math.sin(t / 5) }));

let fakes: Fakes;
beforeEach(() => {
  fakes = installFakes();
});
afterEach(() => fakes.uninstall());

/** Two charts over the same rows, each given `extra` as untyped options. */
function pair(extra: Record<string, unknown>) {
  const options = { data: rows, x: 't', series: [{ y: 'v' }], ...extra } as ChartOptions<Row>;
  return [fakes.mount(options), fakes.mount(options)] as const;
}

describe('[arch-10] the removed engine sync is unreachable through untyped options', () => {
  it.fails('[arch-10] an untyped cursor.syncKey does not link two charts', () => {
    const [a, b] = pair({ cursor: { syncKey: 'k' } });

    hover(a, 50, 0);

    expect(a.getState().cursor.x).not.toBeNull();
    expect(b.getState().cursor.x).toBeNull();
  });

  it.fails('[arch-10] an untyped highlight.syncKey does not link two charts', () => {
    const [a, b] = pair({ highlight: { syncKey: 'k' } });

    a.setHighlight('v');

    expect(a.getState().highlightedSeries).toBe('v');
    expect(b.getState().highlightedSeries).toBeNull();
  });

  it.fails('[arch-10] an untyped zoom.syncKey does not link two charts', () => {
    const [a, b] = pair({ zoom: { syncKey: 'k' } });
    const before = b.getAxis('x');

    // A keyboard zoom (`+` on the focused chart) is a local gesture.
    a.container.firstElementChild!.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: '+' }),
    );

    expect(a.getAxis('x')!.max - a.getAxis('x')!.min).toBeLessThan(before!.max - before!.min);
    expect(b.getAxis('x')).toEqual(before);
  });
});
