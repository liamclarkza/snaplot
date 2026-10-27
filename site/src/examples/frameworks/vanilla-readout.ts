import { type CursorSnapshot, createChart } from 'snaplot';
import {
  type GlobalDay,
  summer2024,
} from '../data/global-temperature';

// 2024 against each date's 1991–2020 range, with a line of text that follows the cursor.
export default function summerReadout(el: HTMLElement) {
  const plot = document.createElement('div');
  const readout = document.createElement('p');
  el.append(plot, readout);

  const chart = createChart<GlobalDay>(plot, {
    data: summer2024,
    x: 'date',
    series: [
      {
        type: 'band',
        y: 'temp',
        lower: 'low',
        upper: 'high',
        label: '2024',
      },
    ],
    axes: { y: { format: { suffix: ' °C' } } },
    height: 220,
    ariaLabel:
      'Daily global mean temperature in summer 2024 against its 1991–2020 range',
  });

  const show = (cursor: CursorSnapshot<GlobalDay>) => {
    const row = cursor.points[0]?.row;
    readout.textContent = row
      ? `${cursor.formattedX}: ${row.temp} °C, 1991–2020 ${row.low}–${row.high} °C`
      : 'Point at a day to read it.';
  };
  show(chart.getCursor());
  chart.on('cursor:change', show);
  return chart;
}
