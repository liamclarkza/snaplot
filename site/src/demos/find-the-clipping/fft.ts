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

/** A spectrogram as a heatmap grid: frames along X (seconds), bands up Y (Hz), dBFS per cell. */
export interface Spectrogram {
  x: { edges: Float64Array };
  y: { edges: Float64Array };
  /** Band `j` of frame `i` at `j × frames + i`. */
  values: Float64Array;
}

/**
 * The spectrogram of the whole recording: the channels mixed to mono, Hann windows of `size`
 * samples end to end, and each window's power pooled into `bands` log-spaced bands from `low` Hz
 * to Nyquist (a band narrower than a bin reads the bin under its centre). Scaled as `spectrum`
 * is, so a full-scale sine reads 0 dBFS; silent cells read −140 dB.
 */
export function spectrogram(
  channels: readonly ArrayLike<number>[],
  sampleRate: number,
  size = 1024,
  bands = 120,
  low = 60,
): Spectrogram {
  const n = channels[0]?.length ?? 0;
  const frames = Math.floor(n / size);
  const nyquist = sampleRate / 2;
  const edgesHz = Float64Array.from(
    { length: bands + 1 },
    (_, j) => low * (nyquist / low) ** (j / bands),
  );
  // The FFT bins each band averages: [first, last] by bin index (bin k is at k × rate / size).
  const binHz = sampleRate / size;
  const first = new Int32Array(bands);
  const last = new Int32Array(bands);
  for (let j = 0; j < bands; j++) {
    const a = Math.ceil(edgesHz[j] / binHz);
    const b = Math.min(size / 2, Math.floor(edgesHz[j + 1] / binHz));
    const centre = Math.min(size / 2, Math.round(Math.sqrt(edgesHz[j] * edgesHz[j + 1]) / binHz));
    first[j] = a <= b ? a : centre;
    last[j] = a <= b ? b : centre;
  }
  const hann = Float64Array.from(
    { length: size },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size),
  );
  const gain = hann.reduce((s, w) => s + w, 0) / 2;
  const scale = gain * gain * channels.length * channels.length;
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const values = new Float64Array(frames * bands);
  for (let f = 0; f < frames; f++) {
    const start = f * size;
    for (let i = 0; i < size; i++) {
      let mix = 0;
      for (const ch of channels) mix += ch[start + i];
      re[i] = mix * hann[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let j = 0; j < bands; j++) {
      let power = 0;
      for (let k = first[j]; k <= last[j]; k++) power += re[k] ** 2 + im[k] ** 2;
      power /= last[j] - first[j] + 1;
      values[j * frames + f] = Math.max(-140, 10 * Math.log10(power / scale));
    }
  }
  return {
    x: { edges: Float64Array.from({ length: frames + 1 }, (_, i) => (i * size) / sampleRate) },
    y: { edges: edgesHz },
    values,
  };
}
