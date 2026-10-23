import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatValue, MAX_READOUT_DECIMALS, scaleStepDecimals, stepDecimals } from './format';

// The expectations assume an English default locale (grouping with ",").
afterEach(() => vi.restoreAllMocks());

/** Deterministic PRNG (mulberry32) so the property runs are reproducible. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const parse = (text: string) => Number(text.replace(/,/g, ''));
const fractionDigits = (text: string) => (text.split('.')[1] ?? '').length;

describe('formatValue (plan P9)', () => {
  it('reads the plan examples at an integer step', () => {
    expect(formatValue(0.4567, { stepDecimals: 0 })).toBe('0.46');
    expect(formatValue(0.0004567, { stepDecimals: 0 })).toBe('0.00046');
    expect(formatValue(39.27, { stepDecimals: 0 })).toBe('39.27');
    expect(formatValue(1138371, { stepDecimals: 0 })).toBe('1,138,371');
  });

  it('adds two decimals to the step, capped at six', () => {
    expect(formatValue(1.23456789, { stepDecimals: 1 })).toBe('1.235');
    expect(formatValue(1.23456789, { stepDecimals: 3 })).toBe('1.23457');
    expect(formatValue(1.23456789, { stepDecimals: 9 })).toBe('1.234568');
    expect(formatValue(1.5)).toBe('1.5');
    expect(formatValue(2, { stepDecimals: 2 })).toBe('2');
  });

  it('handles signs, zero and non-finite values', () => {
    expect(formatValue(-0.8)).toBe('-0.8');
    expect(formatValue(-1234.5)).toBe('-1,234.5');
    expect(formatValue(0)).toBe('0');
    expect(formatValue(-0)).toBe('0');
    expect(formatValue(-0.0004567)).toBe('-0.00046');
    expect(formatValue(Number.NaN)).toBe('');
    expect(formatValue(Number.POSITIVE_INFINITY)).toBe('∞');
  });

  it('property: a readout is within half a unit of its last digit and never hides a non-zero value', () => {
    const next = random(0x5eed);
    for (let run = 0; run < 4000; run++) {
      const step = Math.floor(next() * 8);
      const magnitude = 10 ** (Math.floor(next() * 18) - 9);
      const value = (next() - 0.5) * 2 * magnitude;
      const text = formatValue(value, { stepDecimals: step });
      const digits = Math.min(MAX_READOUT_DECIMALS, step + 2);
      const unit = 10 ** -digits;
      expect(text).not.toMatch(/^-?0$/);
      if (Math.abs(value) >= unit / 2) {
        expect(fractionDigits(text)).toBeLessThanOrEqual(digits);
        expect(Math.abs(parse(text) - value)).toBeLessThanOrEqual(
          unit / 2 + Math.abs(value) * 1e-12,
        );
      } else {
        // Two significant digits: within 5% of the value.
        expect(Math.abs(parse(text) - value)).toBeLessThanOrEqual(Math.abs(value) * 0.05);
      }
    }
  });

  it('reuses one Intl formatter per option set', () => {
    formatValue(1.25, { stepDecimals: 4, locale: 'en-GB' });
    const spy = vi.spyOn(Intl, 'NumberFormat');
    for (let i = 0; i < 100; i++) formatValue(i + 0.125, { stepDecimals: 4, locale: 'en-GB' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('honours an explicit locale', () => {
    expect(formatValue(1234.5, { locale: 'de-DE' })).toBe('1.234,5');
  });
});

describe('stepDecimals', () => {
  it('counts the decimals of a tick step', () => {
    expect(stepDecimals(5)).toBe(0);
    expect(stepDecimals(200000)).toBe(0);
    expect(stepDecimals(0.2)).toBe(1);
    expect(stepDecimals(0.25)).toBe(2);
    expect(stepDecimals(0.30000000000000004)).toBe(1);
    expect(stepDecimals(-0.05)).toBe(2);
    expect(stepDecimals(0)).toBe(0);
    expect(stepDecimals(Number.NaN)).toBe(0);
  });
});

describe('scaleStepDecimals', () => {
  it('uses the step of the ticks a linear axis draws', () => {
    expect(scaleStepDecimals({ type: 'linear', min: 0, max: 6 })).toBe(0);
    expect(scaleStepDecimals({ type: 'linear', min: 0, max: 1 })).toBe(1);
    expect(scaleStepDecimals({ type: 'linear', min: 0, max: 1_200_000 })).toBe(0);
    expect(scaleStepDecimals({ type: 'linear', min: 0, max: 1 }, [0, 0.25, 0.5])).toBe(2);
    expect(scaleStepDecimals({ type: 'linear', min: 0, max: 1 }, undefined, 3)).toBe(1);
  });

  it('uses the smallest visible decade on log axes and 0 elsewhere', () => {
    expect(scaleStepDecimals({ type: 'log', min: 0.05, max: 100 })).toBe(2);
    expect(scaleStepDecimals({ type: 'log', min: 1, max: 1000 })).toBe(0);
    expect(scaleStepDecimals({ type: 'time', min: 0, max: 86_400_000 })).toBe(0);
  });
});
