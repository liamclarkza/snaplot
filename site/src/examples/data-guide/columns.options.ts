import type { ChartOptions } from 'snaplot';
import { clipExcerpt } from '../data/waveform';

// Typed columns: one Float64Array per field, already sorted by x. The chart reads them in place.
const { sampleRate, start, samples } = clipExcerpt;
const ms = new Float64Array(samples.length);
for (let i = 0; i < ms.length; i++)
  ms[i] = ((start + i) / sampleRate) * 1000;

export default {
  data: { columns: { ms, amplitude: Float64Array.from(samples) } },
  x: 'ms',
  series: [{ y: 'amplitude', label: 'Amplitude' }],
  axes: {
    x: {
      title: 'Time into the recording (ms)',
      format: { maximumFractionDigits: 0 },
    },
    y: { min: -1, max: 1 },
  },
  ariaLabel: 'Audio waveform, 1,024 samples around a clipped run',
} satisfies ChartOptions;
