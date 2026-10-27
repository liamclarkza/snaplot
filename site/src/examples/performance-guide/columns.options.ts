import type { ChartOptions } from 'snaplot';
import { clipExcerpt } from '../data/waveform';

// Typed columns are used in place: no copy, no per-row objects. 1,024 samples of a recording, at
// 44,100 per second, around its longest clipped run.
const time = Float64Array.from(
  clipExcerpt.samples,
  (_, i) => ((clipExcerpt.start + i) / clipExcerpt.sampleRate) * 1000,
);

export default {
  data: {
    columns: {
      time,
      amplitude: Float64Array.from(clipExcerpt.samples),
    },
  },
  x: 'time',
  series: [{ y: 'amplitude', label: 'Amplitude' }],
  axes: {
    x: { title: 'Milliseconds into the recording', nice: false },
    y: { min: -1, max: 1 },
  },
  referenceLines: [
    { axis: 'y', value: 1, label: 'Full scale' },
    { axis: 'y', value: -1 },
  ],
  ariaLabel:
    'Audio amplitude of 1,024 samples around the longest clipped run of a recording',
} satisfies ChartOptions;
