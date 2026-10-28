import { type ChartOptions, histogram } from 'snaplot';
import { years } from '../data/global-temperature';

// Two periods binned alike: the same edges, every 0.1 °C from −0.9 to +0.8, for both.
const edges = Array.from(
  { length: 18 },
  (_, i) => Math.round((i - 9) * 10) / 100,
);
const anomalies = (keep: (year: number) => boolean) =>
  years.filter((y) => keep(y.year)).map((y) => y.anomaly);

export default {
  series: [
    {
      type: 'histogram',
      id: 'earlier',
      label: '1940–1979',
      data: histogram(
        anomalies((year) => year < 1980),
        { thresholds: edges },
      ),
    },
    {
      type: 'histogram',
      id: 'later',
      label: '1990 on',
      data: histogram(
        anomalies((year) => year >= 1990),
        { thresholds: edges },
      ),
    },
  ],
  axes: {
    x: { title: 'Against 1991–2020 (°C)' },
    y: { title: 'Years' },
  },
  ariaLabel:
    'Histograms of yearly global mean temperature against 1991–2020, for 1940 to 1979 and from 1990',
} satisfies ChartOptions;
