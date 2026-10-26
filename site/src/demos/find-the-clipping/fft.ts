/**
 * The spectrum of a selection: a radix-2 FFT and a Welch average of Hann-windowed segments,
 * scaled so a full-scale sine reads 0 dBFS. Silent bins read −140 dB rather than −Infinity.
 */

/** In-place FFT of (re, im); the length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n === 0 || (n & (n - 1)) !== 0) throw new Error(`fft: ${n} is not a power of two`);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const step = (-2 * Math.PI) / len;
    for (let k = 0; k < half; k++) {
      const wr = Math.cos(step * k);
      const wi = Math.sin(step * k);
      for (let i = k; i < n; i += len) {
        const j = i + half;
        const br = re[j] * wr - im[j] * wi;
        const bi = re[j] * wi + im[j] * wr;
        re[j] = re[i] - br;
        im[j] = im[i] - bi;
        re[i] += br;
        im[i] += bi;
      }
    }
  }
}

export interface Spectrum {
  /** Bin centre frequencies in Hz, from the first bin above DC to Nyquist. */
  freq: Float64Array;
  /** Mean power per bin in dBFS. */
  db: Float64Array;
  /** The window length and how many windows were averaged. */
  size: number;
  segments: number;
}

/** The spectrum of samples [from, to) of every channel: up to `maxSegments` windows of 4,096. */
export function spectrum(
  channels: readonly ArrayLike<number>[],
  sampleRate: number,
  from: number,
  to: number,
  maxSegments = 32,
): Spectrum {
  const length = Math.max(0, to - from);
  let size = 4096;
  while (size > 256 && size > length) size >>= 1;
  const hann = Float64Array.from(
    { length: size },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size),
  );
  const gain = hann.reduce((s, w) => s + w, 0) / 2;
  const count = Math.max(1, Math.min(maxSegments, Math.floor(length / size)));
  const stride = count > 1 ? (length - size) / (count - 1) : 0;
  const power = new Float64Array(size / 2);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let s = 0; s < count; s++) {
    const start = from + Math.round(s * stride);
    for (const ch of channels) {
      for (let i = 0; i < size; i++) {
        re[i] = start + i < to ? ch[start + i] * hann[i] : 0;
        im[i] = 0;
      }
      fft(re, im);
      for (let k = 1; k <= size / 2; k++) power[k - 1] += re[k] ** 2 + im[k] ** 2;
    }
  }
  const scale = count * channels.length * gain * gain;
  const freq = new Float64Array(size / 2);
  const db = new Float64Array(size / 2);
  for (let k = 0; k < size / 2; k++) {
    freq[k] = ((k + 1) * sampleRate) / size;
    db[k] = Math.max(-140, 10 * Math.log10(power[k] / scale));
  }
  return { freq, db, size, segments: count };
}
