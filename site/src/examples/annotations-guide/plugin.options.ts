import type { ChartOptions, ChartPlugin } from 'snaplot';
import {
  type GlobalDay,
  summer2024,
} from '../data/global-temperature';

// A plugin draws on the canvas with the chart's own scales: here, a tick for each date's range in
// 1991–2020, from its coolest to its warmest, under the line of 2024.
const dayRange: ChartPlugin<GlobalDay> = {
  id: 'day-range',
  drawBelow(context, chart) {
    const x = chart.scale('x');
    const y = chart.scale('y');
    if (!x || !y) return;
    context.strokeStyle = 'rgba(0, 114, 178, 0.35)';
    context.lineWidth = 3;
    context.beginPath();
    for (const day of summer2024) {
      const px = x.toPixel(day.date);
      context.moveTo(px, y.toPixel(day.low));
      context.lineTo(px, y.toPixel(day.high));
    }
    context.stroke();
  },
};

export default {
  data: summer2024,
  x: 'date',
  series: [{ y: 'temp', label: '2024' }],
  axes: { y: { min: 15, max: 17.5, format: { suffix: ' °C' } } },
  plugins: [dayRange],
  ariaLabel:
    'Daily global mean temperature in summer 2024, above a tick for each date’s 1991–2020 range',
} satisfies ChartOptions<GlobalDay>;
