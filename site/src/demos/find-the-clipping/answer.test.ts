import { describe, expect, it } from 'vitest';
import recordingJson from '../../../public/data/find-the-clipping/recording.json?raw';
import { type ClipReport, RULE, formatMs, headline, rmsDb, scan, timecode } from './answer';

const recording = JSON.parse(recordingJson) as {
  kind: 'recording' | 'synthetic';
  sampleRate: number;
  channels: number;
  samples: number;
  rule: typeof RULE;
  reference: {
    clippedRuns: number;
    longestRun: { start: number; samples: number };
    silences: number;
    peak: number;
    runs: [number, number][];
    silenceSpans: [number, number][];
  };
};

/** A seeded generator (mulberry32) for repeatable random signals. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A 0.5-amplitude sine at `rate` Hz sampling. */
function sine(n: number, rate: number, freq = 50): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / rate);
  return out;
}

/**
 * The brute-force oracle (no answer.ts): a '1'/'0' mask per sample frame, and a regular
 * expression for runs of at least three.
 */
function bruteForce(channels: Float32Array[], rate: number) {
  const n = channels[0].length;
  const limit = 10 ** (-0.1 / 20);
  let mask = '';
  for (let i = 0; i < n; i++) mask += channels.some((c) => Math.abs(c[i]) >= limit) ? '1' : '0';
  const runs = [...mask.matchAll(/1{3,}/g)].map((m) => ({ start: m.index, length: m[0].length }));
  const win = Math.round(rate * 0.05);
  let quiet = '';
  for (let from = 0; from < n; from += win) {
    const rms = Math.max(
      ...channels.map((c) => {
        const part = Array.from(c.subarray(from, Math.min(n, from + win)));
        return Math.sqrt(part.reduce((s, v) => s + v * v, 0) / part.length);
      }),
    );
    quiet += rms < 10 ** (-50 / 20) ? 'q' : '-';
  }
  const silences = [...quiet.matchAll(/q+/g)]
    .map((m) => ({
      start: m.index * win,
      length: Math.min(n, (m.index + m[0].length) * win) - m.index * win,
    }))
    .filter((s) => s.length > 2 * rate);
  return { runs, silences };
}

describe('[find-the-clipping] answer', () => {
  it('finds runs of three or more, including one at the very end', () => {
    const rate = 1000;
    const x = sine(8000, rate);
    for (const [at, len] of [
      [100, 2],
      [200, 3],
      [300, 10],
      [7997, 3],
    ]) {
      for (let i = at; i < at + len; i++) x[i] = i % 2 ? -1.02 : 0.99;
    }
    x.fill(0, 1000, 3500); // 2.5 s of silence: counted
    x.fill(0, 5000, 6900); // 1.9 s: too short
    const r = scan([x], rate);
    expect(r.clippedRuns).toEqual([
      { start: 200, length: 3 },
      { start: 300, length: 10 },
      { start: 7997, length: 3 },
    ]);
    expect(r.longest).toEqual({ start: 300, length: 10 });
    expect(r.silences).toEqual([{ start: 1000, length: 2500 }]);
    expect(r.peak).toBeCloseTo(1.02, 6);
  });

  it('a frame is clipped when any channel is', () => {
    const rate = 1000;
    const left = sine(3000, rate);
    const right = sine(3000, rate);
    right.fill(1, 500, 505);
    const r = scan([left, right], rate);
    expect(r.channels).toBe(2);
    expect(r.clippedRuns).toEqual([{ start: 500, length: 5 }]);
    expect(scan([left], rate).clippedRuns).toEqual([]);
  });

  it('oracle: matches a brute-force count on random signals (no shared code)', () => {
    const rate = 2000;
    for (let seed = 1; seed <= 12; seed++) {
      const r = rng(seed);
      const chans = [sine(30_000, rate, 37), sine(30_000, rate, 53)];
      for (let k = 0; k < 40; k++) {
        const ch = chans[Math.floor(r() * 2)];
        const at = Math.floor(r() * 29_990);
        const len = 1 + Math.floor(r() * 6);
        for (let i = at; i < at + len; i++) ch[i] = r() < 0.5 ? -1 : 1;
      }
      const gap = Math.floor(r() * 20_000);
      for (const ch of chans) ch.fill(0, gap, gap + Math.floor(r() * 9000));
      const got = scan(chans, rate);
      const want = bruteForce(chans, rate);
      expect(got.clippedRuns, `seed ${seed}`).toEqual(want.runs);
      expect(got.silences, `seed ${seed}`).toEqual(want.silences);
    }
  });

  it('the bundled recording qualifies (reference scan in recording.json)', () => {
    expect(recording.rule).toEqual(RULE);
    const ref = recording.reference;
    expect(ref.clippedRuns).toBeGreaterThanOrEqual(3);
    expect(ref.silences).toBeGreaterThanOrEqual(1);
    expect(ref.runs).toHaveLength(ref.clippedRuns);
    expect(ref.runs.every(([, len]) => len >= RULE.minClipSamples)).toBe(true);
    expect(
      ref.silenceSpans.every(([, len]) => (len * 1000) / recording.sampleRate > RULE.minSilenceMs),
    ).toBe(true);
    expect(recording.samples / recording.sampleRate).toBeGreaterThanOrEqual(60);
    expect(recording.samples / recording.sampleRate).toBeLessThanOrEqual(240);
  });

  it('states the answer for the bundled recording', () => {
    const ref = recording.reference;
    const report: ClipReport = {
      sampleRate: recording.sampleRate,
      channels: recording.channels,
      samples: recording.samples,
      clippedRuns: ref.runs.map(([start, length]) => ({ start, length })),
      longest: { start: ref.longestRun.start, length: ref.longestRun.samples },
      silences: ref.silenceSpans.map(([start, length]) => ({ start, length })),
      peak: ref.peak,
    };
    expect(headline(report)).toBe(
      '12 clipped runs (samples at or above −0.1 dBFS); the longest is 0.091 ms (4 samples) at 00:35; 5 silences longer than 2 s.',
    );
  });

  it('words a clean recording', () => {
    const r = scan([sine(4000, 1000)], 1000);
    expect(headline(r)).toBe(
      'No clipped runs (samples at or above −0.1 dBFS); no silences longer than 2 s.',
    );
  });

  it('RMS loudness per window for the y2 line', () => {
    const rate = 1000;
    const full = new Float32Array(2000);
    for (let i = 0; i < 2000; i++) full[i] = Math.sin((2 * Math.PI * 50 * i) / rate);
    full.fill(0, 1000);
    const { time, db } = rmsDb([full], rate);
    expect(db).toHaveLength(40);
    expect(time[0]).toBeCloseTo(0.025, 12);
    expect(db[0]).toBeCloseTo(-3.0103, 3);
    expect(db[39]).toBe(-120);
  });

  it('timecodes and durations', () => {
    expect(timecode(35.0702)).toBe('00:35');
    expect(timecode(35.0702, true)).toBe('00:35.070');
    expect(timecode(3599.9)).toBe('59:59');
    expect(timecode(-1)).toBe('00:00');
    expect(formatMs(0.0907)).toBe('0.091 ms');
    expect(formatMs(3.75)).toBe('3.8 ms');
    expect(formatMs(250.4)).toBe('250 ms');
  });
});
