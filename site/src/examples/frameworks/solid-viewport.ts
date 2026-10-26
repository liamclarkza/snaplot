import { createChart, type Viewport } from 'snaplot';
import { type SummerDay, summer2025 } from '../data/central-park';

// Buttons that zoom to a month: update() always applies the viewport it is given.
const months: [string, Viewport][] = [
  ['Summer', {}],
  ['June', { x: [Date.UTC(2025, 5, 1), Date.UTC(2025, 5, 30)] }],
  ['July', { x: [Date.UTC(2025, 6, 1), Date.UTC(2025, 6, 31)] }],
  ['August', { x: [Date.UTC(2025, 7, 1), Date.UTC(2025, 7, 31)] }],
];

export default function monthZoom(el: HTMLElement) {
  const buttons = document.createElement('div');
  buttons.setAttribute('role', 'group');
  buttons.setAttribute('aria-label', 'Show');
  const plot = document.createElement('div');
  el.append(buttons, plot);

  const chart = createChart<SummerDay>(plot, {
    data: summer2025,
    x: 'date',
    series: [
      { y: 'high', label: 'High' },
      { y: 'low', label: 'Low' },
    ],
    axes: { y: { format: { suffix: ' °F' } } },
    timeZone: 'UTC',
    height: 230,
    ariaLabel: 'Daily high and low in Central Park, summer 2025',
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
