/**
 * Theme and surface fixtures (owned by M11 from W5). Each renders under emulated OS light and
 * dark (plan P10, §11.3 G10): defaults on white, cream and dark cards
 * (`evidence/play/visuals-surface.html`), the default palettes as swatches, a transparent
 * background (render-04) and a dark surface set through CSS variables (render-15).
 */
import type { ChartOptions } from '../../../src/index';
import { range } from './data';
import type { Fixture } from './types';

const CARD_W = 400;
const CARD_H = 200;

/** The surface audit's three-series line (60 rows, numeric X). */
function surfaceLine(): ChartOptions<any> {
  return {
    data: range(60, (t) => ({
      t,
      a: 40 + 10 * Math.sin(t / 7),
      b: 30 + 8 * Math.cos(t / 9),
      c: 20 + t / 3,
    })),
    x: 't',
    series: [
      { y: 'a', label: 'Alpha' },
      { y: 'b', label: 'Beta' },
      { y: 'c', label: 'Gamma' },
    ],
  };
}

/** Today's `--chart-*` names and the §5.3 names, so the fixture survives the M11 rename. */
const DARK_VARS = {
  '--chart-bg': '#14161f',
  '--chart-surface': '#14161f',
  '--chart-text': '#e2e2e5',
  '--chart-axis-label': '#8a8e9c',
  '--chart-muted': '#8a8e9c',
  '--chart-grid': '#2a2d3a',
  '--chart-axis': '#2a2d3a',
  '--chart-border': '#2a2d3a',
};

export const fixtures: Fixture[] = [
  {
    id: 'theme/card-white',
    title: 'Defaults on a white card (#ffffff)',
    width: CARD_W,
    height: CARD_H,
    schemes: true,
    card: { background: '#ffffff', color: '#111111' },
    options: surfaceLine,
  },
  {
    id: 'theme/card-cream',
    title: 'Defaults on a cream card (#fffaf0)',
    width: CARD_W,
    height: CARD_H,
    schemes: true,
    card: { background: '#fffaf0', color: '#111111' },
    options: surfaceLine,
  },
  {
    id: 'theme/card-dark',
    title: 'Defaults on a dark card (#14161f): the OS scheme decides today (visuals-03)',
    width: CARD_W,
    height: CARD_H,
    schemes: true,
    card: { background: '#14161f', color: '#eeeeee' },
    options: surfaceLine,
  },
  {
    id: 'theme/swatches',
    title: '#/visual theme-swatches: the default categorical palette, 8 bar series',
    width: CARD_W,
    height: CARD_H,
    schemes: true,
    card: { background: '#ffffff', color: '#111111' },
    options: () => ({
      data: range(3, (i) => {
        const row: Record<string, number> = { slot: i };
        for (let s = 0; s < 8; s++) row[`s${s}`] = 30 + ((s * 7 + i * 5) % 11) * 6;
        return row;
      }),
      x: 'slot',
      series: range(8, (s) => ({ y: `s${s}`, type: 'bar' as const, label: `Series ${s + 1}` })),
    }),
  },
  {
    id: 'theme/transparent-background',
    title: "theme.backgroundColor 'transparent' on a light-blue card (render-04)",
    width: CARD_W,
    height: CARD_H,
    schemes: true,
    card: { background: '#e8f0ff', color: '#111111' },
    options: () => ({ ...surfaceLine(), theme: { backgroundColor: 'transparent' } }),
  },
  {
    id: 'theme/dark-css-vars',
    title: 'A dark surface through --chart-* CSS variables (render-15: light palette kept)',
    width: CARD_W,
    height: CARD_H,
    schemes: true,
    card: { background: '#14161f', color: '#eeeeee', vars: DARK_VARS },
    options: surfaceLine,
  },
];
