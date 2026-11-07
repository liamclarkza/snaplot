import type { ChartOptions } from 'snaplot';
import { juneWeek } from '../data/household';

/** One day of rooftop solar: kWh in each of its 24 local hours. */
interface Day {
  day: string;
  pv: number[];
}

// A week of rooftop solar in Konstanz, one column of 24 local hours per day: each row's values
// fill the cells up the plot. juneWeek starts at local midnight (22:00 UTC).
const days: Day[] = Array.from(
  { length: juneWeek.length / 24 },
  (_, d) => ({
    day: juneWeek[d * 24 + 2].time.slice(0, 10),
    pv: juneWeek.slice(d * 24, d * 24 + 24).map((hour) => hour.pv),
  }),
);

export default {
  data: days,
  x: 'day',
  series: [
    {
      type: 'heatmap',
      id: 'pv',
      label: 'Solar',
      values: 'pv',
      bins: { start: 0, step: 1, count: 24 },
      format: { maximumFractionDigits: 2, suffix: ' kWh' },
      colorScale: { title: 'kWh in the hour' },
    },
  ],
  axes: {
    x: { format: { weekday: 'short', day: 'numeric' } },
    y: {
      title: 'Hour',
      ticks: [0, 6, 12, 18],
      format: (h) => `${h}:00`,
    },
  },
  timeZone: 'UTC',
  ariaLabel:
    'Solar generation per hour of each day, 12 to 18 June 2017, one household in Konstanz',
} satisfies ChartOptions<Day>;
