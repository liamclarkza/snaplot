import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import recordingJson from '../../../public/data/find-the-clipping/recording.json?raw';
import { scan } from './answer';
import { clipMarks, runChannels, sniffSampleRate, waveformColumns } from './audio';

const recording = JSON.parse(recordingJson) as { file: string; sampleRate: number };

/** A minimal 16-bit PCM WAV header (with a LIST chunk before `fmt `) at `rate`. */
function wav(rate: number): Uint8Array {
  const bytes = new Uint8Array(64);
  const view = new DataView(bytes.buffer);
  const put = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i);
  };
  put(0, 'RIFF');
  put(8, 'WAVE');
  put(12, 'LIST');
  view.setUint32(16, 3, true); // an odd-sized chunk is padded to an even length
  put(24, 'fmt ');
  view.setUint32(28, 16, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 2, true);
  view.setUint32(36, rate, true);
  return bytes;
}

describe('[find-the-clipping] sample rate from the header', () => {
  it('reads the bundled MP3 at the rate its SOURCE.md records', () => {
    const file = fileURLToPath(
      new URL(`../../../public/data/find-the-clipping/${recording.file}`, import.meta.url),
    );
    expect(sniffSampleRate(new Uint8Array(readFileSync(file)))).toBe(recording.sampleRate);
  });

  it('reads WAV, FLAC and MPEG-2 headers, and gives up on anything else', () => {
    expect(sniffSampleRate(wav(96_000))).toBe(96_000);
    const flac = new Uint8Array(32);
    flac.set([0x66, 0x4c, 0x61, 0x43]);
    // STREAMINFO: 48,000 Hz is 0x0BB80 in the 20 bits from byte 18.
    flac.set([0x0b, 0xb8, 0x00], 18);
    expect(sniffSampleRate(flac)).toBe(48_000);
    // An ID3v2 tag of 4 bytes, then an MPEG-2 layer III frame at index 1 (24 kHz).
    const mp3 = new Uint8Array([
      0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0xff, 0xf3, 0x04, 0,
    ]);
    expect(sniffSampleRate(mp3)).toBe(24_000);
    expect(sniffSampleRate(new TextEncoder().encode('OggS and other things'))).toBeNull();
  });
});

describe('[find-the-clipping] chart columns and clip marks', () => {
  it('builds a time column in seconds and one column per channel', () => {
    const { columns } = waveformColumns({
      channels: [Float32Array.of(0, 0.5, -1), Float32Array.of(1, 0, 0)],
      sampleRate: 2,
    });
    expect(Object.keys(columns)).toEqual(['t', 'ch0', 'ch1']);
    expect([...columns.t]).toEqual([0, 0.5, 1]);
    expect([...columns.ch0]).toEqual([0, 0.5, -1]);
  });

  it('marks each clipped run in the channels that clipped, at their loudest sample', () => {
    const rate = 1000;
    const left = new Float32Array(2000);
    const right = new Float32Array(2000);
    left.set([0.99, -1, 0.995], 100); // a left-only run
    left.set([1, 1, 1], 900);
    right.set([0.2, -1.01, 0.999, 0.99], 899); // a run in both channels
    const r = scan([left, right], rate);
    expect(r.clippedRuns.map((s) => s.start)).toEqual([100, 900]);
    const marks = clipMarks([left, right], r.clippedRuns, rate);
    expect(marks[0]).toEqual([
      { t: 0.101, v: -1 },
      { t: 0.9, v: 1 },
    ]);
    expect(marks[1]).toHaveLength(1);
    expect(marks[1][0].t).toBeCloseTo(0.9, 9);
    expect(marks[1][0].v).toBeCloseTo(-1.01, 6);
    expect(r.clippedRuns.map((s) => runChannels(marks, s, rate))).toEqual(['L', 'L+R']);
    expect(runChannels([marks[0]], r.clippedRuns[0], rate)).toBe('mono');
  });
});
