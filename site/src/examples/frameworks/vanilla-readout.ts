import { type CursorSnapshot, createChart } from 'snaplot';
import { type SummerDay, summer2025 } from '../data/central-park';

// The daily high against its 1991–2020 normal range, with a line of text that follows the cursor.
export default function highsReadout(el: HTMLElement) {
  const plot = document.createElement('div');
  const readout = document.createElement('p');
  el.append(plot, readout);

  const chart = createChart<SummerDay>(plot, {
    data: summer2025,
    x: 'date',
    series: [
      {
        type: 'band',
        y: 'high',
        lower: 'normalLow',
        upper: 'normalHigh',
        label: 'High',
      },
    ],
    axes: { y: { format: { suffix: ' °F' } } },
    height: 220,
    ariaLabel:
      'Daily high in Central Park, summer 2025, against the normal range',
  });

  const show = (cursor: CursorSnapshot<SummerDay>) => {
    const row = cursor.points[0]?.row;
    readout.textContent = row
      ? `${cursor.formattedX}: ${row.high} °F, normal ${row.normalLow}–${row.normalHigh} °F`
      : 'Point at a day to read it.';
  };
  show(chart.getCursor());
  chart.on('cursor:change', show);
  return chart;
}
