import { describe, expect, it } from 'vitest';
import csv from '../../../public/data/ridgecrest-aftershocks/events.csv?raw';
import oracleJson from '../../../public/data/ridgecrest-aftershocks/oracle.json?raw';
import {
  DAY,
  END,
  M71,
  START,
  dailyCounts,
  decay,
  decaySeries,
  formatDays,
  headline,
  parseEvents,
  type Quake,
} from './answer';

const events = parseEvents(csv);
const oracle = JSON.parse(oracleJson) as {
  days: { day: string; minMagnitude: number; count: number }[];
};

/**
 * An independent recount straight from the CSV text: no answer.ts, ISO-date keys instead of
 * millisecond arithmetic.
 */
function recount(text: string, fromIso: string, toIso: string) {
  const perDay = new Map<string, number>();
  const times: number[] = [];
  for (const line of text.trim().split('\n').slice(1)) {
    const cols = line.split(',');
    const time = Number(cols[0]);
    const iso = new Date(time).toISOString();
    if (iso < fromIso || iso >= toIso || Number.parseFloat(cols[4]) < 2.5) continue;
    const key = iso.slice(0, 10);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
    times.push(time);
  }
  const keys = [...perDay.keys()].sort();
  let peakKey = keys[0];
  for (const k of keys) if ((perDay.get(k) ?? 0) > (perDay.get(peakKey) ?? 0)) peakKey = k;
  const peak = perDay.get(peakKey) ?? 0;
  // Walk every calendar day after the peak, including days with no events.
  let belowKey: string | undefined;
  for (let d = new Date(`${peakKey}T00:00:00Z`); ; ) {
    d = new Date(d.getTime() + 86_400_000);
    const key = d.toISOString().slice(0, 10);
    if (key >= toIso.slice(0, 10)) break;
    if ((perDay.get(key) ?? 0) * 10 < peak) {
      belowKey = key;
      break;
    }
  }
  times.sort((a, b) => a - b);
  let seen = 0;
  let halfAt = Number.NaN;
  for (const t of times) {
    seen++;
    if (seen * 2 >= times.length) {
      halfAt = t;
      break;
    }
  }
  return {
    perDay,
    total: times.length,
    peakKey,
    peak,
    belowKey,
    halfDays: (halfAt - times[0]) / 864e5,
  };
}

describe('[ridgecrest-aftershocks] answer', () => {
  it('parses every event of the extract', () => {
    expect(events.length).toBe(39_244);
    expect(events.every((e) => Number.isFinite(e.time) && Number.isFinite(e.mag))).toBe(true);
    expect(events.find((e) => e.id === M71.id)?.time).toBe(M71.time);
  });

  it('oracle: daily M≥2.5 counts equal USGS /count for three UTC days (no answer.ts)', () => {
    const { perDay } = recount(csv, '2019-07-01', '2019-09-30');
    expect(oracle.days).toHaveLength(3);
    for (const o of oracle.days) {
      expect(o.minMagnitude).toBe(2.5);
      expect(perDay.get(o.day) ?? 0, o.day).toBe(o.count);
    }
  });

  it('the decay numbers equal an independent recount', () => {
    const r = recount(csv, '2019-07-01', '2019-09-30');
    const d = decay(events);
    expect(d.total).toBe(r.total);
    expect(new Date(d.peak?.day ?? 0).toISOString().slice(0, 10)).toBe(r.peakKey);
    expect(d.peak?.count).toBe(r.peak);
    expect(new Date(d.below?.day ?? 0).toISOString().slice(0, 10)).toBe(r.belowKey);
    expect(d.halfDays).toBeCloseTo(r.halfDays, 9);
  });

  it('daily counts agree with the oracle file through answer.ts too', () => {
    const counts = dailyCounts(events);
    expect(counts).toHaveLength(91);
    for (const o of oracle.days) {
      const day = Date.parse(`${o.day}T00:00:00Z`);
      expect(counts.find((c) => c.day === day)?.count).toBe(o.count);
    }
  });

  it('states the answer for the whole sequence', () => {
    const d = decay(events);
    expect(d.peakIsMainshock).toBe(true);
    expect(d.daysAfterPeak).toBe(2);
    expect(headline(d)).toBe(
      'Daily M≥2.5 count fell below 10% of its peak (1239) on 8 July, 2 days after the M7.1; half of the 3‑month total came in the first 1.9 days.',
    );
  });

  it('gives the same two numbers for a brushed window', () => {
    const from = Date.UTC(2019, 7, 1);
    const to = Date.UTC(2019, 8, 1);
    const r = recount(csv, '2019-08-01', '2019-09-01');
    const d = decay(events, from, to);
    expect(d.total).toBe(r.total);
    expect(d.peak?.count).toBe(r.peak);
    expect(new Date(d.below?.day ?? 0).toISOString().slice(0, 10)).toBe(r.belowKey);
    expect(d.halfDays).toBeCloseTo(r.halfDays, 9);
    expect(headline(d)).toMatch(
      /^Daily M≥2\.5 count fell below 10% of its peak \(\d+\) on \d+ (August|September), \d+ days? after its peak on \d+ August; half of the window's \d+ events came in its first \d+\.\d days\.$/,
    );
  });

  it('never shows NaN, Infinity or an empty placeholder', () => {
    const windows: [number, number][] = [
      [START, END],
      [START, START + DAY], // no M≥2.5 events
      [END, START], // inverted
      [M71.time, M71.time + 3_600_000], // one hour after the mainshock
      [Date.UTC(2019, 8, 25), END], // sparse tail
    ];
    for (const [from, to] of windows) {
      const text = headline(decay(events, from, to));
      expect(text, `${from}–${to}`).not.toMatch(/NaN|Infinity|undefined|null|\(\)/);
      expect(text.length).toBeGreaterThan(20);
    }
    expect(headline(decay(events, START, START + DAY))).toBe(
      'No M≥2.5 earthquakes in this window.',
    );
  });

  it('formats short and long spans', () => {
    expect(formatDays(0)).toBe('less than a minute');
    expect(formatDays(0.2 / 24)).toBe('12 minutes');
    expect(formatDays(0.25)).toBe('6 hours');
    expect(formatDays(1 / 24)).toBe('1 hour');
    expect(formatDays(1.86)).toBe('1.9 days');
    expect(formatDays(10)).toBe('10.0 days');
  });

  it('decay series: one-day bins after the M7.1 for a log–log plot', () => {
    const s = decaySeries(events);
    expect(s[0].daysSince).toBe(0.5);
    expect(s.every((p) => p.rate > 0 && p.daysSince > 0)).toBe(true);
    const sum = s.reduce((t, p) => t + p.rate, 0);
    const after = events.filter((e: Quake) => e.time >= M71.time && e.mag >= 2.5).length;
    expect(sum).toBe(after);
    // The rate decays: the first day holds more events than any later day.
    expect(Math.max(...s.slice(1).map((p) => p.rate))).toBeLessThan(s[0].rate);
  });
});
