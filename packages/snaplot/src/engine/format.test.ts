import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  axisReadout,
  type FormatContext,
  formatBinRange,
  formatFieldValue,
  formatReadout,
  formatTick,
  formatValue,
  formatX,
  MAX_READOUT_DECIMALS,
  NO_AXIS_FORMAT,
  NO_FORMAT,
  scaleStepDecimals,
  stepDecimals,
} from './format';
import type { ChartSpec, Scale } from './spec';

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

// ─── The W5 contract (M9b, over today's behaviour; M10 implements §5.2) ───

function scale(key: string, type: Scale['type'], min: number, max: number): Scale {
  return {
    key,
    type,
    min,
    max,
    tickFormat: (v: number) => `${key}:${v}`,
  } as unknown as Scale;
}

function context(config: Partial<ChartSpec>, scales: Scale[]): FormatContext {
  return {
    config: { series: [], ...config } as ChartSpec,
    scales: new Map(scales.map((s) => [s.key, s])),
  };
}

const pct = (v: number) => `${v}%`;
const plain = context({ series: [{ label: 'a', yColumn: 1 }], axes: { x: {}, y: {} } }, [
  scale('x', 'linear', 0, 10),
  scale('y', 'linear', 0, 1),
]);
const formatted = context(
  {
    series: [
      { label: 'a', yColumn: 1 },
      { label: 'b', yColumn: 2, yAxis: 'y2', xAxis: 'x2' },
    ],
    axes: { x: { format: (v) => `x=${v}` }, y: { format: pct }, y2: {}, x2: {} },
    tooltip: { yFormat: (v, si) => `${v} (s${si})`, xFormat: (v) => `at ${v}` },
  },
  [
    scale('x', 'linear', 0, 10),
    scale('y', 'linear', 0, 1),
    scale('y2', 'linear', 0, 100),
    scale('x2', 'linear', 0, 5),
  ],
);

describe('formatTick (engine/format.ts contract)', () => {
  it('uses the axis format, else the scale tick format', () => {
    expect(formatTick(plain, 'x', 2)).toBe('x:2');
    expect(formatTick(formatted, 'x', 2)).toBe('x=2');
    expect(formatTick(plain, 'missing', 2)).toBe('2');
  });

  it("labels 'slot' ticks with the axis format, else integers as is and a value readout", () => {
    expect(formatTick(plain, 'x', 3, 'slot')).toBe('3');
    expect(formatTick(plain, 'x', 2.25, 'slot')).toBe('2.25');
    expect(formatTick(formatted, 'x', 2.25, 'slot')).toBe('x=2.25');
  });
});

describe('formatReadout (engine/format.ts contract)', () => {
  it('applies the tooltip format, then the series format, then the axis format, then the automatic readout', () => {
    expect(formatReadout(formatted, 1, 42)).toBe('42 (s1)');
    const noTooltip = context({ ...formatted.config, tooltip: {} }, [...formatted.scales.values()]);
    expect(formatReadout(noTooltip, 0, 0.5)).toBe('0.5%');
    expect(formatReadout(noTooltip, 1, 42.123)).toBe('42.12');
    const seriesFormat = context(
      {
        ...noTooltip.config,
        series: noTooltip.config.series.map((s, i) =>
          i === 0 ? { ...s, format: (v: number) => `#${v}` } : s,
        ),
      },
      [...formatted.scales.values()],
    );
    expect(formatReadout(seriesFormat, 0, 0.5)).toBe('#0.5');
    expect(formatReadout(seriesFormat, 1, 42.123)).toBe('42.12');
    expect(formatReadout(plain, 0, 0.123456)).toBe('0.123');
  });

  it('ignores the old call-site quirks: every call site reads the same', () => {
    expect(formatReadout(formatted, 0, 0.5, NO_AXIS_FORMAT)).toBe(formatReadout(formatted, 0, 0.5));
    expect(formatReadout(formatted, 0, 0.5, NO_FORMAT)).toBe(formatReadout(formatted, 0, 0.5));
  });
});

describe('formatX and formatBinRange (engine/format.ts contract)', () => {
  it('applies the tooltip X format, then the axis format, then the automatic readout', () => {
    expect(formatX(formatted, 3)).toBe('at 3');
    const noTooltip = context({ ...formatted.config, tooltip: {} }, [...formatted.scales.values()]);
    expect(formatX(noTooltip, 3, 'x')).toBe('x=3');
    expect(formatX(plain, 3.25, 'x')).toBe('3.25');
    expect(formatX(plain, 3, 'nope')).toBe('3');
    expect(formatX(formatted, 3, 'x', NO_FORMAT)).toBe(formatX(formatted, 3, 'x'));
  });

  it("writes a bin range through the series' X axis and separates edges a coarse format merges", () => {
    expect(formatBinRange(plain, 1, 2)).toBe('1 \u2013 2');
    const coarse = context(
      { series: [{ label: 'h', yColumn: 1 }], axes: { x: { format: () => 'same' } } },
      [scale('x', 'linear', 0, 1)],
    );
    expect(formatBinRange(coarse, 0.1, 0.2)).toBe('0.1 \u2013 0.2');
    const ranged = context(
      { ...plain.config, tooltip: { rangeFormat: (a, b, si) => `${a}..${b}#${si}` } },
      [],
    );
    expect(formatBinRange(ranged, 1, 2, 0)).toBe('1..2#0');
  });
});

describe('axisReadout and formatFieldValue', () => {
  it('reads at the tick step plus two decimals, a time axis through its tick format', () => {
    expect(axisReadout(plain, 'y', 0.123456)).toBe('0.123');
    expect(axisReadout(plain, 'x', 1.23456)).toBe('1.23');
    const time = context({ series: [], axes: { t: {} } }, [scale('t', 'time', 0, 1)]);
    expect(axisReadout(time, 't', 5)).toBe('t:5');
    expect(axisReadout(plain, 'missing', 1.23456)).toBe('1.23');
  });

  it('recomputes the step when the domain changes', () => {
    const y = scale('y', 'linear', 0, 1);
    const ctx = context({ series: [], axes: { y: {} } }, [y]);
    expect(axisReadout(ctx, 'y', 1.23456)).toBe('1.235');
    y.max = 1000;
    expect(axisReadout(ctx, 'y', 1.23456)).toBe('1.23');
  });

  it('writes field values to four places, or four significant digits when tiny or huge', () => {
    expect(formatFieldValue(3)).toBe('3');
    expect(formatFieldValue(1.5)).toBe('1.5');
    expect(formatFieldValue(0.000123456)).toBe('0.0001235');
    expect(formatFieldValue(123456.7)).toBe('1.235e+5');
    expect(formatFieldValue(Number.NaN)).toBe('');
  });
});
