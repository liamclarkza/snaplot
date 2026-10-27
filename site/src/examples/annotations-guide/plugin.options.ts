import type { ChartOptions, ChartPlugin } from 'snaplot';
import { type SummerDay, summer2025 } from '../data/central-park';

// A plugin draws on the canvas with the chart's own scales: here, a tick from each day's low to
// its high, under the lines.
const dayRange: ChartPlugin<SummerDay> = {
  id: 'day-range',
  drawBelow(context, chart) {
    const x = chart.scale('x');
    const y = chart.scale('y');
    if (!x || !y) return;
    context.strokeStyle = 'rgba(0, 114, 178, 0.35)';
    context.lineWidth = 3;
    context.beginPath();
    for (const day of summer2025) {
      const px = x.toPixel(day.date);
      context.moveTo(px, y.toPixel(day.low));
      context.lineTo(px, y.toPixel(day.high));
    }
    context.stroke();
  },
};

export default {
  data: summer2025,
  x: 'date',
  series: [{ y: 'high', label: 'High' }],
  axes: { y: { min: 40, max: 100, format: { suffix: ' °F' } } },
  plugins: [dayRange],
  ariaLabel:
    'Daily high in Central Park in summer 2025, with each day drawn from its low to its high',
} satisfies ChartOptions<SummerDay>;
