/**
 * "Where does this recording clip?" — the computed answer (plan §10.2, S1).
 *
 * Pure functions of decoded PCM (one Float32Array per channel, as `AudioBuffer.getChannelData`
 * returns). The rule, also in SOURCE.md:
 * - a clipped run is ≥ 3 consecutive sample frames at or above −0.1 dBFS (|x| ≥ 0.98855) in any
 *   channel; decoded MP3 samples may exceed 1;
 * - a silence is a span of consecutive 50 ms windows whose RMS (loudest channel) is below
 *   −50 dBFS, lasting more than 2 s.
 * Decode at the file's own sample rate (recording.json `sampleRate`) so no resampling changes the
 * samples.
 */

export interface Rule {
  clipDbfs: number;
  minClipSamples: number;
  silenceDbfs: number;
  silenceWindowMs: number;
  minSilenceMs: number;
}

export const RULE: Rule = {
  clipDbfs: -0.1,
  minClipSamples: 3,
  silenceDbfs: -50,
  silenceWindowMs: 50,
  minSilenceMs: 2000,
};

/** A span of sample frames. */
export interface Span {
  start: number;
  length: number;
}

export interface ClipReport {
  sampleRate: number;
  channels: number;
  samples: number;
  clippedRuns: Span[];
  longest: Span | null;
  silences: Span[];
  /** Largest |x| in any channel. */
  peak: number;
}

type Channels = readonly ArrayLike<number>[];

/** One pass over the samples: clipped runs, silences and the peak. */
export function scan(channels: Channels, sampleRate: number, rule: Rule = RULE): ClipReport {
  const n = channels.length > 0 ? channels[0].length : 0;
  const clip = 10 ** (rule.clipDbfs / 20);
  const clippedRuns: Span[] = [];
  let start = -1;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    let a = 0;
    for (const ch of channels) {
      const v = Math.abs(ch[i]);
      if (v > a) a = v;
    }
    if (a > peak) peak = a;
    if (a >= clip) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      if (i - start >= rule.minClipSamples) clippedRuns.push({ start, length: i - start });
      start = -1;
    }
  }
  if (start >= 0 && n - start >= rule.minClipSamples) {
    clippedRuns.push({ start, length: n - start });
  }
  let longest: Span | null = null;
  for (const r of clippedRuns) if (longest === null || r.length > longest.length) longest = r;

  const win = Math.round((sampleRate * rule.silenceWindowMs) / 1000);
  const quiet = 10 ** (rule.silenceDbfs / 20);
  const minLength = (rule.minSilenceMs * sampleRate) / 1000;
  const silences: Span[] = [];
  let s0 = -1;
  for (let from = 0; from < n; from += win) {
    const to = Math.min(n, from + win);
    if (windowRms(channels, from, to) < quiet) {
      if (s0 < 0) s0 = from;
    } else if (s0 >= 0) {
      if (from - s0 > minLength) silences.push({ start: s0, length: from - s0 });
      s0 = -1;
    }
  }
  if (s0 >= 0 && n - s0 > minLength) silences.push({ start: s0, length: n - s0 });

  return {
    sampleRate,
    channels: channels.length,
    samples: n,
    clippedRuns,
    longest,
    silences,
    peak,
  };
}

/** RMS of the loudest channel over [from, to). */
function windowRms(channels: Channels, from: number, to: number): number {
  let loud = 0;
  for (const ch of channels) {
    let sum = 0;
    for (let i = from; i < to; i++) sum += ch[i] * ch[i];
    const rms = Math.sqrt(sum / (to - from));
    if (rms > loud) loud = rms;
  }
  return loud;
}

/**
 * RMS loudness in dBFS per window (loudest channel), for the `y2` line. `time` is the window
 * centre in seconds; silent windows read −120 dB rather than −Infinity.
 */
export function rmsDb(
  channels: Channels,
  sampleRate: number,
  windowMs = RULE.silenceWindowMs,
): { time: Float64Array; db: Float64Array } {
  const n = channels.length > 0 ? channels[0].length : 0;
  const win = Math.max(1, Math.round((sampleRate * windowMs) / 1000));
  const count = Math.ceil(n / win);
  const time = new Float64Array(count);
  const db = new Float64Array(count);
  for (let w = 0; w < count; w++) {
    const from = w * win;
    const to = Math.min(n, from + win);
    time[w] = (from + to) / 2 / sampleRate;
    db[w] = Math.max(-120, 20 * Math.log10(windowRms(channels, from, to)));
  }
  return { time, db };
}

/** `mm:ss`, or `mm:ss.mmm` with `precise`. */
export function timecode(seconds: number, precise = false): string {
  const total = Math.max(0, seconds);
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  const whole = Math.floor(s);
  const base = `${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}`;
  return precise ? `${base}.${String(Math.floor((s - whole) * 1000)).padStart(3, '0')}` : base;
}

/** Milliseconds with two significant digits below 10 ms ("0.091 ms"), whole above. */
export function formatMs(ms: number): string {
  return `${ms < 10 ? Number(ms.toPrecision(2)) : Math.round(ms)} ms`;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The clip-list panel's sentence. */
export function headline(r: ClipReport): string {
  const runs =
    r.clippedRuns.length === 0
      ? 'No clipped runs (samples at or above −0.1 dBFS)'
      : `${count(r.clippedRuns.length, 'clipped run', 'clipped runs')} (samples at or above −0.1 dBFS)`;
  const longest = r.longest
    ? `; the longest is ${formatMs((r.longest.length * 1000) / r.sampleRate)} (${count(r.longest.length, 'sample', 'samples')}) at ${timecode(r.longest.start / r.sampleRate)}`
    : '';
  const quiet =
    r.silences.length === 0
      ? 'no silences longer than 2 s'
      : `${count(r.silences.length, 'silence', 'silences')} longer than 2 s`;
  return `${runs}${longest}; ${quiet}.`;
}
