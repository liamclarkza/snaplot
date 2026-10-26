/**
 * The editor's chart options: the overview strip, one lane per channel and the spectrum, as plain
 * option objects (the same ones `createChart` takes). Colours follow the waveform-editor
 * convention: a green waveform, amber clip marks, grey silences.
 */
import type { ChartGroup, ChartProps, ColumnData, ReferenceRegion } from 'snaplot/solid';
import { RULE, type Span, timecode } from './answer';

export const COLORS = {
  wave: '#5FD08A',
  rms: '#B9E8C9',
  clip: '#F5B041',
  silence: '#9AA0A6',
  threshold: '#C7CCD1',
  spectrum: '#7FD6F0',
} as const;

/** Dark roles on the editor's own surfaces: the track ground and the page. */
const theme = (surface: string) =>
  ({
    mode: 'dark',
    surface,
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    muted: '#8B9096',
    text: '#D5D8DB',
    accent: '#F2F3F4',
  }) as const;
const TRACK = '#16181A';
const PAGE = '#1B1D1F';

/** Seconds as a timecode: mm:ss on whole seconds, mm:ss.mmm otherwise. */
export const tc = (s: number) => timecode(s, Math.abs(s - Math.round(s)) > 1e-6);
const db = { maximumFractionDigits: 1, suffix: ' dB' };

export interface Track {
  wave: ColumnData;
  rms: ColumnData[];
  marks: { t: number; v: number }[][];
  silences: Span[];
  sampleRate: number;
  duration: number;
}

const silenceRegions = (track: Track): ReferenceRegion[] =>
  track.silences.map((s) => ({
    axis: 'x',
    from: s.start / track.sampleRate,
    to: (s.start + s.length) / track.sampleRate,
    color: COLORS.silence,
    opacity: 0.14,
  }));

const LANE = ['Left', 'Right'];

/** The whole file: both channels, every clip mark, and the stretch the lanes show. */
export function overview(track: Track, group: ChartGroup): ChartProps {
  return {
    data: track.wave,
    x: 't',
    series: [
      ...track.rms.map((_, c) => ({
        id: `ch${c}`,
        y: `ch${c}`,
        label: LANE[c],
        color: COLORS.wave,
        lineWidth: 1,
      })),
      {
        id: 'clips',
        type: 'scatter' as const,
        data: track.marks.flat(),
        x: 't',
        y: 'v',
        label: 'Clipped run',
        color: COLORS.clip,
        pointRadius: 3.5,
      },
    ],
    axes: {
      x: { format: tc, min: 0, max: track.duration },
      y: { min: -1, max: 1, ticks: [], grid: false },
    },
    referenceRegions: silenceRegions(track),
    interaction: { drag: 'select', zoom: 'none' },
    tooltip: false,
    legend: false,
    theme: theme(TRACK),
    group,
  };
}

/** One channel at sample detail, with its RMS loudness on the right-hand dB axis. */
export function lane(track: Track, c: number, group: ChartGroup): ChartProps {
  return {
    data: track.wave,
    x: 't',
    series: [
      { id: `ch${c}`, y: `ch${c}`, label: LANE[c] ?? 'Mono', color: COLORS.wave, lineWidth: 1 },
      {
        id: `rms${c}`,
        data: track.rms[c],
        x: 't',
        y: 'db',
        yAxis: 'y2',
        label: 'RMS',
        color: COLORS.rms,
        lineWidth: 1,
        opacity: 0.7,
        format: db,
      },
      {
        id: `clips${c}`,
        type: 'scatter' as const,
        data: track.marks[c],
        x: 't',
        y: 'v',
        label: 'Clipped',
        color: COLORS.clip,
        pointRadius: 4,
      },
    ],
    axes: {
      x: { format: tc, min: 0, max: track.duration },
      y: { min: -1, max: 1, format: { maximumFractionDigits: 3 } },
      y2: { min: -90, max: 0, position: 'right', grid: false, format: db },
    },
    // The silence rule reads RMS in dBFS, so its threshold sits on the dB axis.
    referenceLines: [
      {
        axis: 'y2',
        value: RULE.silenceDbfs,
        label: `silence below ${String(RULE.silenceDbfs).replace('-', '−')} dB`,
        color: COLORS.threshold,
      },
    ],
    referenceRegions: silenceRegions(track),
    legend: false,
    theme: theme(TRACK),
    group,
  };
}

/** The spectrum of the stretch the lanes show, 20 Hz to Nyquist. */
export function spectrumChart(sampleRate: number): ChartProps {
  return {
    x: 'f',
    series: [{ id: 'db', y: 'db', label: 'Level', color: COLORS.spectrum, lineWidth: 1.25 }],
    axes: {
      x: {
        type: 'log',
        min: 20,
        max: sampleRate / 2,
        format: (hz) =>
          hz >= 1000 ? `${Number((hz / 1000).toPrecision(3))} kHz` : `${Math.round(hz)} Hz`,
      },
      y: { format: db },
    },
    interaction: 'readonly',
    legend: false,
    theme: theme(PAGE),
  };
}
