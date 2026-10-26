// @vitest-environment jsdom
// The interim legends (plan §12 M8, D6, D27): `legend: 'auto'` and createLegendTable, as thin
// views over the 0.12 legend DOM, styled by one stylesheet injected per document.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLegendTable } from '../../src/index';
import { type Fakes, installFakes } from '../fakes';
import { type FinalHandle, mount } from './contract';

let fakes: Fakes;
beforeEach(() => {
  fakes = installFakes();
});
afterEach(() => {
  fakes.uninstall();
  vi.restoreAllMocks();
  for (const style of document.head.querySelectorAll('style')) style.remove();
});

type Row = { t: number; cpu: number; mem: number };
const rows: Row[] = Array.from({ length: 30 }, (_, t) => ({ t, cpu: 40 + (t % 7), mem: 60 }));
const two = {
  data: rows,
  x: 't',
  series: [
    { y: 'cpu', label: 'CPU' },
    { y: 'mem', label: 'Memory' },
  ],
};

const buttons = (chart: FinalHandle<Row>) => [
  ...chart.container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'),
];
const names = (chart: FinalHandle<Row>) => buttons(chart).map((b) => b.textContent);
/** Two series with the legend asked for, whatever 'auto' decides. */
const shown = { ...two, legend: true };

function table(chart: FinalHandle<Row>, options: Record<string, unknown> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const handle = createLegendTable<Row>(host, { chart: chart as never, ...options });
  return { host, handle };
}

describe('the built-in legend (plan D6)', () => {
  it("[frameworks-11] 'auto' shows one button per series from two series, none for one", () => {
    expect(names(mount<Row>(fakes, two))).toEqual(['CPU', 'Memory']);
    // A container too short for a plot below the legend shows only the chart.
    expect(names(mount<Row>(fakes, two, { height: 120 }))).toEqual([]);
    expect(names(mount<Row>(fakes, shown, { height: 120 }))).toEqual(['CPU', 'Memory']);
    expect(names(mount<Row>(fakes, { ...two, series: [two.series[0]] }))).toEqual([]);
    expect(names(mount<Row>(fakes, { ...two, legend: false }))).toEqual([]);
    expect(names(mount<Row>(fakes, { ...two, series: [two.series[0]], legend: true }))).toEqual([
      'CPU',
    ]);
  });

  it('[frameworks-11] the legend sits above the plot, or below it with position: bottom', () => {
    const top = mount<Row>(fakes, shown);
    const plot = top.container.querySelector('[role="application"]')!;
    expect(top.container.firstElementChild?.querySelector('button')).not.toBeNull();
    expect(plot.previousElementSibling?.contains(buttons(top)[0])).toBe(true);
    const bottom = mount<Row>(fakes, { ...two, legend: { position: 'bottom' } });
    const root = bottom.container.querySelector('[role="application"]')!;
    expect(root.nextElementSibling?.contains(buttons(bottom)[0])).toBe(true);
  });

  it('[frameworks-11] a click toggles the series and reports hiddenSeries:change', () => {
    const chart = mount<Row>(fakes, shown);
    const seen = vi.fn();
    chart.on('hiddenSeries:change', seen);
    buttons(chart)[1].click();
    expect(seen.mock.calls).toEqual([[['mem']]]);
    expect(buttons(chart)[1].getAttribute('aria-pressed')).toBe('false');
    buttons(chart)[1].click();
    expect(seen.mock.calls.at(-1)).toEqual([[]]);
  });

  it('[frameworks-11] a hover highlights the series and reports highlight:change', () => {
    const chart = mount<Row>(fakes, shown);
    const seen = vi.fn();
    chart.on('highlight:change', seen);
    buttons(chart)[0].dispatchEvent(new MouseEvent('mouseenter'));
    buttons(chart)[0].dispatchEvent(new MouseEvent('mouseleave'));
    expect(seen.mock.calls).toEqual([['cpu'], [null]]);
  });

  it('[frameworks-11] the legend follows the options and leaves with the chart', () => {
    const chart = mount<Row>(fakes, shown);
    chart.update({ series: [{ y: 'cpu', label: 'Processor' }, two.series[1]] });
    expect(names(chart)).toEqual(['Processor', 'Memory']);
    chart.update({ legend: false });
    expect(names(chart)).toEqual([]);
    chart.update({ legend: true });
    expect(names(chart)).toEqual(['Processor', 'Memory']);
    const container = chart.container;
    chart.destroy();
    expect(container.querySelector('button')).toBeNull();
    expect(container.style.display).toBe('');
  });

  it('[frameworks-11] the legend styles are injected once per document', () => {
    mount<Row>(fakes, shown);
    mount<Row>(fakes, shown);
    table(mount<Row>(fakes, { ...two, legend: false }));
    const styles = [...document.querySelectorAll('style[data-snaplot-styles]')];
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toContain('.snaplot-legend-item');
  });
});

describe('[frameworks-11][frameworks-01] createLegendTable (plan D27)', () => {
  it('[frameworks-11] the default columns are swatch, name and value, keyed by series id', () => {
    const chart = mount<Row>(fakes, { ...two, legend: false });
    const { host } = table(chart);
    const headers = [...host.querySelectorAll('th')].map((th) => th.textContent);
    expect(headers).toEqual(['', 'Series', 'Value']);
    const rowsOf = () => [...host.querySelectorAll<HTMLTableRowElement>('tbody tr')];
    expect(rowsOf().map((row) => row.dataset.seriesId)).toEqual(['cpu', 'mem']);
    // The latest value without a cursor (fallback: 'latest').
    expect(rowsOf()[0].textContent).toContain('CPU');
    expect(rowsOf()[0].textContent).toContain(String(rows[29].cpu));
    const first = rowsOf()[0];
    chart.setCursor(3);
    expect(rowsOf()[0]).toBe(first);
    expect(first.textContent).toContain(String(rows[3].cpu));
  });

  it('[frameworks-11] custom columns are data only: a header and a function to a string', () => {
    const chart = mount<Row>(fakes, { ...two, legend: false });
    const { host, handle } = table(chart, {
      columns: [
        'name',
        {
          header: 'Twice',
          value: (point: { y: number } | undefined) => String((point?.y ?? 0) * 2),
          align: 'right',
        },
      ],
    });
    expect([...host.querySelectorAll('th')].map((th) => th.textContent)).toEqual([
      'Series',
      'Twice',
    ]);
    expect(host.querySelector('tbody tr')?.textContent).toBe(`CPU${rows[29].cpu * 2}`);
    handle.update({ columns: ['name'] });
    expect(host.querySelector('tbody tr')?.textContent).toBe('CPU');
    expect(() => handle.update({ columns: [{ header: 'x' }] as never })).toThrow(/columns\[0\]/);
  });

  it('[frameworks-01] values refresh after a data change that keeps the viewport', () => {
    const chart = mount<Row>(fakes, { ...two, legend: false });
    const { host } = table(chart, { columns: ['name', 'value'] });
    chart.update({
      data: rows.map((row, i) => (i === rows.length - 1 ? { ...row, cpu: 44 } : row)),
    });
    fakes.frames.flush();
    expect(host.textContent).toContain('44');
  });

  it("[frameworks-11] fallback: 'hide' hides the table until the cursor is over the chart", () => {
    const chart = mount<Row>(fakes, { ...two, legend: false });
    const { host, handle } = table(chart, { fallback: 'hide' });
    const root = host.firstElementChild as HTMLElement;
    expect(root.hidden).toBe(true);
    chart.setCursor(4);
    expect(root.hidden).toBe(false);
    handle.destroy();
    expect(host.childElementCount).toBe(0);
  });

  it('[frameworks-11] hovering a row highlights its series', () => {
    const chart = mount<Row>(fakes, { ...two, legend: false });
    const { host } = table(chart);
    const seen = vi.fn();
    chart.on('highlight:change', seen);
    host.querySelector('tbody tr')?.dispatchEvent(new MouseEvent('mouseenter'));
    expect(seen).toHaveBeenCalledWith('cpu');
  });

  it('[frameworks-11] a chart that is not a live createChart() handle throws', () => {
    const chart = mount<Row>(fakes, two);
    chart.destroy();
    expect(() => table(chart)).toThrow(/^snaplot: chart must be/);
  });
});
