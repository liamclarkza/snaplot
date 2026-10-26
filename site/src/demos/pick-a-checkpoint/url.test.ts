import { describe, expect, it } from 'vitest';
import { readUrl, togglePin, writeUrl } from './url';

describe('[pick-a-checkpoint] URL state', () => {
  it('round-trips every key', () => {
    const search = '?epochs=12.5-30&pins=A-11,B-30&smoothing=0.6&by=accuracy';
    const state = readUrl(search);
    expect(state).toEqual({
      epochs: [12.5, 30],
      pins: [
        { run: 'A', epoch: 11 },
        { run: 'B', epoch: 30 },
      ],
      smoothing: 0.6,
      by: 'valAcc',
    });
    expect(writeUrl(state)).toBe(search);
  });

  it('tells "no pins" from "no pins key"', () => {
    expect(readUrl('?pins=').pins).toEqual([]);
    expect(readUrl('').pins).toBeUndefined();
    expect(writeUrl({ pins: [] })).toBe('?pins=');
    expect(writeUrl({})).toBe('');
  });

  it('drops malformed values instead of failing', () => {
    expect(readUrl('?epochs=30-12&pins=A11,b-3,B-x&smoothing=1.5&by=speed')).toEqual({ pins: [] });
    expect(readUrl('?epochs=-1-5&smoothing=-0.1')).toEqual({});
    expect(readUrl('?smoothing=0').smoothing).toBe(0);
  });

  it('writes the viewport and the smoothing at two decimals', () => {
    expect(writeUrl({ epochs: [12.3456, 30.019], smoothing: 0.6000001 })).toBe(
      '?epochs=12.35-30.02&smoothing=0.6',
    );
    // The default criterion stays out of the URL.
    expect(writeUrl({ by: 'valLoss' })).toBe('');
  });

  it('toggles pins and keeps them ordered', () => {
    const pins = togglePin([{ run: 'B', epoch: 30 }], { run: 'A', epoch: 11 });
    expect(pins).toEqual([
      { run: 'A', epoch: 11 },
      { run: 'B', epoch: 30 },
    ]);
    expect(togglePin(pins, { run: 'B', epoch: 30 })).toEqual([{ run: 'A', epoch: 11 }]);
  });
});
