/**
 * Loading audio for the editor: the file's own sample rate (so decoding does not resample the
 * samples the clip rule reads), the decode itself, the chart columns, and one clip mark per
 * clipped run and channel. Everything stays in the browser; nothing is uploaded.
 */
import { RULE, type Span } from './answer';

/** At most this many samples per channel (about three minutes at 44.1 kHz) fit in memory. */
export const MAX_SAMPLES = 8_000_000;

/** Sample rates of MPEG-1 layer III; MPEG-2 halves them and MPEG-2.5 quarters them. */
const MPEG1_RATES = [44_100, 48_000, 32_000];

/**
 * The sample rate a file declares in its header: WAV (`fmt ` chunk), FLAC (STREAMINFO) or MP3
 * (the first frame after any ID3v2 tag). `null` for anything else.
 */
export function sniffSampleRate(bytes: Uint8Array): number | null {
  const text = (at: number, n: number) => String.fromCharCode(...bytes.subarray(at, at + n));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (text(0, 4) === 'RIFF' && text(8, 4) === 'WAVE') {
    for (
      let p = 12;
      p + 8 <= bytes.length;
      p += 8 + view.getUint32(p + 4, true) + (view.getUint32(p + 4, true) & 1)
    ) {
      if (text(p, 4) === 'fmt ' && p + 16 <= bytes.length) return view.getUint32(p + 12, true);
    }
    return null;
  }
  if (text(0, 4) === 'fLaC' && bytes.length >= 21) {
    return (bytes[18] << 12) | (bytes[19] << 4) | (bytes[20] >> 4);
  }
  let p = 0;
  if (text(0, 3) === 'ID3' && bytes.length >= 10) {
    p = 10 + ((bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]);
  }
  for (; p + 4 <= bytes.length; p++) {
    if (bytes[p] !== 0xff || (bytes[p + 1] & 0xe0) !== 0xe0) continue;
    const version = (bytes[p + 1] >> 3) & 3; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
    const layer = (bytes[p + 1] >> 1) & 3; // 1 = layer III
    const index = (bytes[p + 2] >> 2) & 3;
    if (version === 1 || layer !== 1 || index === 3) continue;
    return MPEG1_RATES[index] / (version === 3 ? 1 : version === 2 ? 2 : 4);
  }
  return null;
}

export interface Audio {
  name: string;
  /** `true` when the header named no sample rate and the decode resampled to 48 kHz. */
  resampled: boolean;
  buffer: AudioBuffer;
  sampleRate: number;
  /** One Float32Array per channel, as the decoder returned them. */
  channels: Float32Array[];
}

/** Decode a file at its own sample rate. Throws a readable error for long or unknown files. */
export async function decode(bytes: ArrayBuffer, name: string): Promise<Audio> {
  const declared = sniffSampleRate(new Uint8Array(bytes));
  const sampleRate = declared ?? 48_000;
  const context = new OfflineAudioContext(1, 1, sampleRate);
  let buffer: AudioBuffer;
  try {
    buffer = await context.decodeAudioData(bytes);
  } catch {
    throw new Error(`${name} is not an audio file this browser can decode.`);
  }
  if (buffer.length > MAX_SAMPLES) {
    const minutes = (MAX_SAMPLES / sampleRate / 60).toFixed(1);
    throw new Error(`${name} is longer than ${minutes} minutes; open a shorter file.`);
  }
  const channels = Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, i) =>
    buffer.getChannelData(i),
  );
  return { name, resampled: declared === null, buffer, sampleRate, channels };
}

/** The chart columns: time in seconds and one Float64Array per channel (`ch0`, `ch1`). */
export function waveformColumns(audio: Pick<Audio, 'channels' | 'sampleRate'>): {
  columns: Record<string, Float64Array>;
} {
  const n = audio.channels[0]?.length ?? 0;
  const t = new Float64Array(n);
  for (let i = 0; i < n; i++) t[i] = i / audio.sampleRate;
  const columns: Record<string, Float64Array> = { t };
  audio.channels.forEach((ch, c) => {
    columns[`ch${c}`] = Float64Array.from(ch);
  });
  return { columns };
}

/**
 * One mark per clipped run in each channel that reached the clip level during the run: at the
 * run's loudest sample of that channel, with its signed value.
 */
export function clipMarks(
  channels: readonly ArrayLike<number>[],
  runs: readonly Span[],
  sampleRate: number,
): { t: number; v: number }[][] {
  const limit = 10 ** (RULE.clipDbfs / 20);
  return channels.map((ch) => {
    const marks: { t: number; v: number }[] = [];
    for (const run of runs) {
      let at = -1;
      for (let i = run.start; i < run.start + run.length; i++) {
        if (Math.abs(ch[i]) >= limit && (at < 0 || Math.abs(ch[i]) > Math.abs(ch[at]))) at = i;
      }
      if (at >= 0) marks.push({ t: at / sampleRate, v: ch[at] });
    }
    return marks;
  });
}

/** Which channels a run clipped in: "L", "R", "L+R", or "mono". */
export function runChannels(marks: { t: number }[][], run: Span, sampleRate: number): string {
  if (marks.length === 1) return 'mono';
  const from = run.start / sampleRate;
  const to = (run.start + run.length) / sampleRate;
  const hit = marks.map((m) => m.some((p) => p.t >= from && p.t < to));
  return hit[0] && hit[1] ? 'L+R' : hit[0] ? 'L' : 'R';
}
