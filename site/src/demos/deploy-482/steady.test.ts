import { describe, expect, it } from 'vitest';
import { STEPS, steadyMax } from './steady';

describe('steadyMax', () => {
  it('keeps headroom over the peak, and holds while the peak stays under it', () => {
    // A 700 ms peak with 1.6× headroom needs 1,120 ms: the 2,000 ms step, not 1,000.
    expect(steadyMax(undefined, 700, STEPS.latency, 1.6)).toBe(2_000);
    expect(steadyMax(2_000, 1_100, STEPS.latency, 1.6)).toBe(2_000);
    // Without headroom the first step at or above the peak.
    expect(steadyMax(undefined, 700, STEPS.latency)).toBe(1_000);
  });

  it('shrinks once the peak falls under 40% of the axis', () => {
    expect(steadyMax(2_000, 300, STEPS.latency, 1.6)).toBe(500);
  });
});
