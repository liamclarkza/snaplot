import { describe, expect, it } from 'vitest';
import { clock, headline, highlights, summarize } from './answer';
import { fly } from './flight';

const flight = fly();
const summary = summarize(flight);

describe('max-q answer', () => {
  it('finds Max-Q and the hardest push as a scan of the frames does', () => {
    const byQ = [...flight.frames].sort((a, b) => b.q - a.q)[0];
    const byG = [...flight.frames].sort((a, b) => b.accel - a.accel)[0];
    expect(summary.maxQ).toEqual(byQ);
    expect(summary.peakG).toEqual(byG);
    expect(summary.peakG.t).toBeLessThanOrEqual(summary.meco);
  });

  it('times the bucket around Max-Q', () => {
    expect(summary.bucket.from).toBeLessThan(summary.maxQ.t);
    expect(summary.bucket.to).toBeGreaterThan(summary.maxQ.t);
    expect(summary.bucket.low).toBeCloseTo(0.85, 6);
  });

  it('writes mission time as T+mm:ss', () => {
    expect(clock(0)).toBe('T+00:00');
    expect(clock(53.2)).toBe('T+00:53');
    expect(clock(465.1)).toBe('T+07:45');
    expect(clock(-10)).toBe('T−00:10');
    expect(clock(61.25, true)).toBe('T+01:01.3');
  });

  it('answers the question (golden, default flight)', () => {
    expect(headline(summary)).toBe(
      'Max-Q comes at T+00:53, 8.6 km up at Mach 1.26: 32.9 kPa, with the engines throttled to 85% to get through it.',
    );
    expect(highlights(summary)).toBe(
      'The hardest push, 5.2 g, comes just before MECO at T+02:17; the second stage shuts down at T+07:45 in a 201 × 220 km orbit.',
    );
  });
});
