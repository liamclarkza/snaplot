import { createChart, type Viewport } from 'snaplot';
import {
  type GlobalDay,
  summer2024,
} from '../data/global-temperature';

// Buttons that zoom to a month: update() always applies the viewport it is given.
const months: [string, Viewport][] = [
  ['Summer', {}],
  ['June', { x: [Date.UTC(2024, 5, 1), Date.UTC(2024, 5, 30)] }],
  ['July', { x: [Date.UTC(2024, 6, 1), Date.UTC(2024, 6, 31)] }],
  ['August', { x: [Date.UTC(2024, 7, 1), Date.UTC(2024, 7, 31)] }],
];

export default function monthZoom(el: HTMLElement) {
  const buttons = document.createElement('div');
  buttons.setAttribute('role', 'group');
  buttons.setAttribute('aria-label', 'Show');
  const plot = document.createElement('div');
  el.append(buttons, plot);

  const chart = createChart<GlobalDay>(plot, {
    data: summer2024,
    x: 'date',
    series: [
      { y: 'temp', label: '2024' },
      { y: 'normal', label: '1991–2020 mean' },
    ],
    axes: { y: { format: { suffix: ' °C' } } },
    timeZone: 'UTC',
    height: 230,
    ariaLabel:
      'Daily global mean temperature, summer 2024, against the 1991–2020 mean',
  });

  for (const [label, viewport] of months) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () =>
      chart.update({ viewport }),
    );
    buttons.append(button);
  }
  return chart;
}
