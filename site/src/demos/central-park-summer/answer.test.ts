import { describe, expect, it } from 'vitest';
import oracleJson from '../../../public/data/central-park-summer/oracle.json?raw';
import summerJson from '../../../public/data/central-park-summer/summer.json?raw';
import {
  type ClimateDay,
  type SummerAnswer,
  headline,
  parseSummer,
  recordsLine,
  rows,
  summarize,
} from './answer';

const data = parseSummer(summerJson);
const oracle = JSON.parse(oracleJson) as {
  monthlyNormals: { months: { month: string; tmaxNormal: number; years: number }[] };
  recordHighs: { day: string; rawTenthsC: number; recordHigh: number; year: number }[];
};
// The gitignored raw download, present only where the generator has run (lazy: not loaded
// unless the recompute test runs).
const raw = import.meta.glob<string>(
  '../../../../scripts/demo-data/.cache/central-park-summer/USW00094728.csv',
  { query: '?raw', import: 'default' },
);
const rawLoader = Object.values(raw)[0];

describe('[central-park-summer] answer', () => {
  it('states the answer', () => {
    const a = summarize(data);
    expect(a.days).toBe(92);
    expect(a.aboveNormal).toBe(8);
    expect(headline(a)).toBe(
      '8 days between June and August 2025 had highs above the normal range; the mean high was 0.1 °F above the 1991–2020 median.',
    );
    expect(recordsLine(a)).toBe(
      'Record highs: June 23 tied (96 °F, 1888); June 24 (99 °F; old record 96 °F in 1888).',
    );
  });

  it('oracle: 1991–2020 monthly mean highs are within ±1 °F of NCEI normals (no answer.ts)', () => {
    expect(oracle.monthlyNormals.months.map((m) => m.month)).toEqual(['06', '07', '08']);
    for (const m of oracle.monthlyNormals.months) {
      const days = data.climatology.filter((c) => c.day.startsWith(`${m.month}-`));
      const mean = days.reduce((s, c) => s + c.meanHigh, 0) / days.length;
      expect(Math.abs(mean - m.tmaxNormal), `month ${m.month}: ${mean}`).toBeLessThanOrEqual(1);
    }
  });

  it('oracle: five spot-checked record highs equal the raw maxima (no answer.ts)', () => {
    expect(oracle.recordHighs).toHaveLength(5);
    for (const s of oracle.recordHighs) {
      const c = data.climatology.find((d) => d.day === s.day);
      expect(c?.recordHigh, s.day).toBe(s.recordHigh);
      expect(c?.recordHighYear, s.day).toBe(s.year);
      expect(Math.round(((s.rawTenthsC / 10) * 9) / 5 + 32)).toBe(s.recordHigh);
    }
  });

  it.skipIf(!rawLoader)(
    'recomputes the whole extract from the raw cache and matches the committed JSON',
    async () => {
      const text = await rawLoader();
      const expected = recompute(text);
      expect(expected.summer2025).toEqual(data.summer2025);
      expect(expected.climatology).toEqual(data.climatology);
      for (const s of oracle.recordHighs) {
        expect(expected.rawMax.get(s.day)).toBe(s.rawTenthsC);
      }
    },
    60_000,
  );

  it('joins each summer day to its climatology', () => {
    const r = rows(data);
    expect(r).toHaveLength(92);
    expect(r[0].date).toBe('2025-06-01');
    expect(r.at(-1)?.date).toBe('2025-08-31');
    for (const d of r) {
      expect(d.normalLow).toBeLessThanOrEqual(d.normalMedian);
      expect(d.normalMedian).toBeLessThanOrEqual(d.normalHigh);
      expect(d.normalHigh).toBeLessThanOrEqual(d.recordHigh);
      expect(d.low).toBeLessThanOrEqual(d.high);
    }
  });

  it('words one day, a cool summer and an exactly normal one', () => {
    const base: SummerAnswer = {
      days: 92,
      aboveNormal: 1,
      aboveNormalDates: ['2025-07-01'],
      belowNormal: 0,
      meanAnomaly: -2.26,
      recordHighs: [],
      recordLows: [],
    };
    expect(headline(base)).toBe(
      '1 day between June and August 2025 had a high above the normal range; the mean high was 2.3 °F below the 1991–2020 median.',
    );
    expect(headline({ ...base, aboveNormal: 0, meanAnomaly: 0.04 })).toBe(
      '0 days between June and August 2025 had highs above the normal range; the mean high equalled the 1991–2020 median.',
    );
    expect(recordsLine(base)).toBe('');
  });
});

/**
 * A second, independent implementation of the generator's reduction (plan §10.2: "recomputes
 * from the raw cache and matches the committed JSON").
 */
function recompute(text: string) {
  const lines = text.split('\n');
  const header = lines[0].split('","').map((h) => h.replaceAll('"', ''));
  expect(header.slice(12, 16)).toEqual(['TMAX', 'TMAX_ATTRIBUTES', 'TMIN', 'TMIN_ATTRIBUTES']);
  const keys: string[] = [];
  for (let d = Date.UTC(2020, 0, 1); d < Date.UTC(2021, 0, 1); d += 864e5) {
    keys.push(new Date(d).toISOString().slice(5, 10));
  }
  const slot = new Map(keys.map((k, i) => [k, i]));
  const f = (tenths: number) => Math.round(((tenths / 10) * 9) / 5 + 32) || 0; // no -0
  const hi = keys.map(() => ({ v: -Infinity, y: 0 }));
  const lo = keys.map(() => ({ v: Infinity, y: 0 }));
  const exact: number[][] = keys.map(() => []);
  const window: number[][] = keys.map(() => []);
  const rawMax = new Map<string, number>();
  const summer: { date: string; high: number; low: number }[] = [];
  const field = /"([^"]*)"|,(?=,)|^(?=,)/g;
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const cells: string[] = [];
    for (const m of line.matchAll(field)) cells.push(m[1] ?? '');
    const date = cells[1];
    const year = Number(date.slice(0, 4));
    const mmdd = date.slice(5);
    const value = (i: number) =>
      cells[i]?.trim() && !(cells[i + 1] ?? '').split(',')[1] ? Number(cells[i]) : null;
    const tmax = value(12);
    const tmin = value(14);
    const i = slot.get(mmdd) ?? -1;
    if (year >= 1869 && year <= 2024) {
      if (tmax !== null && f(tmax) >= hi[i].v) hi[i] = { v: f(tmax), y: year };
      if (tmin !== null && f(tmin) <= lo[i].v) lo[i] = { v: f(tmin), y: year };
      if (tmax !== null && tmax >= (rawMax.get(mmdd) ?? -Infinity)) rawMax.set(mmdd, tmax);
    }
    if (year >= 1991 && year <= 2020 && tmax !== null) {
      exact[i].push(f(tmax));
      for (let k = -7; k <= 7; k++) window[(i + k + 366) % 366].push(f(tmax));
    }
    if (date >= '2025-06-01' && date <= '2025-08-31' && tmax !== null && tmin !== null) {
      summer.push({ date, high: f(tmax), low: f(tmin) });
    }
  }
  const pct = (sorted: number[], p: number) => {
    const h = (sorted.length - 1) * p;
    const a = Math.floor(h);
    const b = Math.min(a + 1, sorted.length - 1);
    return sorted[a] + (h - a) * (sorted[b] - sorted[a]);
  };
  const r = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
  const climatology: ClimateDay[] = keys.map((day, i) => {
    const s = [...window[i]].sort((a, b) => a - b);
    return {
      day,
      recordHigh: hi[i].v,
      recordHighYear: hi[i].y,
      recordLow: lo[i].v,
      recordLowYear: lo[i].y,
      normalP10: r(pct(s, 0.1), 1),
      normalMedian: r(pct(s, 0.5), 1),
      normalP90: r(pct(s, 0.9), 1),
      meanHigh: r(exact[i].reduce((t, v) => t + v, 0) / exact[i].length, 2),
      normalCount: s.length,
    };
  });
  return { climatology, summer2025: summer, rawMax };
}
