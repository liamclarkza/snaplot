import { describe, expect, it } from 'vitest';
import { fft, spectrum } from './fft';

/** The oracle: a direct O(n²) DFT, sharing no code with fft.ts. */
function dft(x: Float64Array): { re: Float64Array; im: Float64Array } {
  const n = x.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    for (let t = 0; t < n; t++) {
      const a = (-2 * Math.PI * k * t) / n;
      re[k] += x[t] * Math.cos(a);
      im[k] += x[t] * Math.sin(a);
    }
  }
  return { re, im };
}

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5;
  };
}

describe('[find-the-clipping] fft', () => {
  it('oracle: equals a direct DFT on random input', () => {
    for (const n of [8, 64, 512]) {
      const rnd = seeded(n);
      const x = Float64Array.from({ length: n }, rnd);
      const re = Float64Array.from(x);
      const im = new Float64Array(n);
      fft(re, im);
      const want = dft(x);
      for (let k = 0; k < n; k++) {
        expect(re[k]).toBeCloseTo(want.re[k], 9);
        expect(im[k]).toBeCloseTo(want.im[k], 9);
      }
    }
  });

  it('rejects a length that is not a power of two', () => {
    expect(() => fft(new Float64Array(12), new Float64Array(12))).toThrow(/power of two/);
  });
});

describe('[find-the-clipping] spectrum', () => {
  const rate = 44_100;
  const size = 4096;
  /** A sine at an exact bin frequency, so the Hann window does not scallop it. */
  const tone = (bin: number, amplitude: number, n: number) =>
    Float32Array.from(
      { length: n },
      (_, i) => amplitude * Math.sin((2 * Math.PI * bin * i) / size),
    );

  it('reads a half-scale sine at its frequency and about −6 dBFS', () => {
    const x = tone(93, 0.5, rate);
    const s = spectrum([x], rate, 0, x.length);
    let peak = 0;
    for (let k = 1; k < s.db.length; k++) if (s.db[k] > s.db[peak]) peak = k;
    expect(s.freq[peak]).toBeCloseTo((93 * rate) / size, 6);
    expect(s.db[peak]).toBeCloseTo(-6.02, 1);
    expect(s.segments).toBeGreaterThan(1);
  });

  it('averages channels and stays finite on silence', () => {
    const silent = new Float32Array(rate);
    const s = spectrum([silent, tone(40, 1, rate)], rate, 0, rate);
    expect(Math.max(...s.db)).toBeCloseTo(10 * Math.log10(0.5), 1);
    const quiet = spectrum([silent], rate, 0, rate);
    expect(quiet.db.every(Number.isFinite)).toBe(true);
    expect(Math.min(...quiet.db)).toBe(-140);
  });

  it('shrinks the window for a short selection and caps the segments', () => {
    const x = tone(10, 0.5, rate);
    expect(spectrum([x], rate, 1000, 1700).size).toBe(512);
    expect(spectrum([x], rate, 1000, 1100).size).toBe(256);
    expect(spectrum([x], rate, 0, x.length, 8).segments).toBe(8);
    expect(spectrum([x], rate, 0, x.length).freq[0]).toBeCloseTo(rate / size, 9);
  });
});
