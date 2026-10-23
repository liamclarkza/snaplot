// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  column,
  createLegendPlugin,
  createLegendTablePlugin,
  metricColumn,
  nameColumn,
  swatchColumn,
  valueColumn,
} from './legend';
import type { ChartHandle, ChartPoint, CursorSnapshot, LegendItem } from './types';

function chartFixture() {
  const container = document.createElement('div');
  container.style.display = 'grid';
  const canvas = document.createElement('div');
  canvas.style.flex = '0';
  container.append(canvas);
  const listeners = new Set<() => void>();
  const themeListeners = new Set<() => void>();
  let items: LegendItem[] = ['cpu', 'memory'].map((id) => ({
    id,
    label: id,
    type: 'line',
    color: 'red',
    fill: null,
    visible: true,
    lineDash: [],
    opacity: 1,
  }));
  let snapshot: CursorSnapshot = {
    x: 10,
    formattedX: '10 s',
    source: 'cursor',
    activeSeriesId: null,
    points: items.map((item) => ({
      seriesId: item.id,
      label: item.label,
      x: 10,
      y: 12,
      rowIndex: 0,
      formattedX: '10 s',
      formattedY: '12%',
      color: item.color,
    })),
  };
  let highlighted: string | null = null;
  const publish = () => {
    for (const listener of listeners) listener();
  };
  const chart = {
    container,
    getOptions: () => ({
      series: items.map((item) => ({ id: item.id, y: item.id, label: item.label })),
    }),
    getLegendItems: () => items,
    getCursorSnapshot: () => snapshot,
    getState: () => ({ highlightedSeries: highlighted }),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    on: (_event: string, listener: () => void) => {
      themeListeners.add(listener);
      return () => themeListeners.delete(listener);
    },
    setSeriesVisible: vi.fn((id: string, visible: boolean) => {
      items = items.map((item) => (item.id === id ? { ...item, visible } : item));
      publish();
    }),
    setHighlight: vi.fn((id: string | null) => {
      highlighted = id;
      publish();
    }),
  } as unknown as ChartHandle<any>;
  return {
    chart,
    canvas,
    container,
    listeners,
    themeListeners,
    publish,
    setItems: (next: LegendItem[]) => {
      items = next;
      publish();
    },
    setSnapshot: (next: CursorSnapshot) => {
      snapshot = next;
      publish();
    },
    snapshot: () => snapshot,
    items: () => items,
  };
}

describe('public JavaScript legend companions', () => {
  it('keeps ID-keyed buttons through updates and reordering, with accessible visibility toggles', () => {
    const fixture = chartFixture();
    const plugin = createLegendPlugin<any>();
    plugin.install!(fixture.chart);
    const cpu = fixture.container.querySelector<HTMLButtonElement>('[data-series-id="cpu"]')!;
    fixture.setItems(fixture.items().slice().reverse());
    expect(fixture.container.querySelector('[data-series-id="cpu"]')).toBe(cpu);
    expect(
      fixture.container.querySelector('.snaplot-legend-item')?.getAttribute('data-series-id'),
    ).toBe('memory');
    cpu.click();
    expect(fixture.chart.setSeriesVisible).toHaveBeenCalledWith('cpu', false);
    expect(cpu.getAttribute('aria-pressed')).toBe('false');
    expect(cpu.getAttribute('aria-label')).toBe('Toggle cpu on');
    plugin.destroy!(fixture.chart);
    expect(fixture.listeners.size).toBe(0);
    expect(fixture.themeListeners.size).toBe(0);
    expect(fixture.container.style.display).toBe('grid');
    expect(fixture.canvas.style.flex).toBe('0 1 0%');
  });

  it('allows one plugin instance across multiple charts and restores layout after the last companion', () => {
    const a = chartFixture();
    const b = chartFixture();
    const plugin = createLegendPlugin<any>();
    const table = createLegendTablePlugin<any>();
    plugin.install!(a.chart);
    plugin.install!(b.chart);
    table.install!(a.chart);
    plugin.destroy!(a.chart);
    expect(a.container.style.display).toBe('flex');
    expect(b.container.querySelectorAll('button')).toHaveLength(2);
    table.destroy!(a.chart);
    plugin.destroy!(b.chart);
    expect(a.container.style.display).toBe('grid');
    expect(b.listeners.size).toBe(0);
  });

  it('mounts into an external host without altering chart layout', () => {
    const fixture = chartFixture();
    const host = document.createElement('aside');
    const plugin = createLegendPlugin<any>({ container: host });
    plugin.install!(fixture.chart);
    expect(host.querySelectorAll('button')).toHaveLength(2);
    expect(fixture.container.style.display).toBe('grid');
    plugin.destroy!(fixture.chart);
    expect(host.childNodes).toHaveLength(0);
  });

  it('updates table values in place and uses stable IDs for row hover and keyboard toggles', () => {
    const fixture = chartFixture();
    const plugin = createLegendTablePlugin<any>({ toggleVisibilityOnClick: true });
    plugin.install!(fixture.chart);
    const row = fixture.container.querySelector<HTMLTableRowElement>('[data-series-id="cpu"]')!;
    const value = row.querySelector('.snaplot-legend-cell--value span');
    fixture.setSnapshot({
      ...fixture.snapshot(),
      points: fixture.snapshot().points.map((point) => ({ ...point, y: 13, formattedY: '13%' })),
    });
    expect(row.querySelector('.snaplot-legend-cell--value span')).toBe(value);
    expect(value?.textContent).toBe('13%');
    fixture.setItems(fixture.items().slice().reverse());
    expect(fixture.container.querySelector('[data-series-id="cpu"]')).toBe(row);
    row.dispatchEvent(new Event('mouseenter'));
    expect(fixture.chart.setHighlight).toHaveBeenLastCalledWith('cpu');
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(fixture.chart.setSeriesVisible).toHaveBeenLastCalledWith('cpu', false);
    plugin.destroy!(fixture.chart);
    expect(fixture.listeners.size).toBe(0);
  });

  it('renders names for empty snapshots, blanks series-only values and safely inserts strings', () => {
    const fixture = chartFixture();
    fixture.setSnapshot({ ...fixture.snapshot(), source: 'none', x: null, points: [] });
    const plugin = createLegendTablePlugin<any>({
      columns: [
        nameColumn(),
        valueColumn(),
        column({ key: 'custom', header: 'Custom', cell: () => '<img src=x onerror=alert(1)>' }),
      ],
    });
    plugin.install!(fixture.chart);
    expect(fixture.container.querySelector('.snaplot-legend-cell--name')?.textContent).toBe('cpu');
    expect(fixture.container.querySelector('.snaplot-legend-cell--value')?.textContent).toBe('');
    expect(fixture.container.querySelector('.snaplot-legend-cell--custom')?.textContent).toBe(
      '<img src=x onerror=alert(1)>',
    );
    expect(fixture.container.querySelector('img')).toBeNull();
    plugin.destroy!(fixture.chart);
  });

  it('hides the table for hide fallback and removes stale series rows', () => {
    const fixture = chartFixture();
    const plugin = createLegendTablePlugin<any>({ fallback: 'hide' });
    plugin.install!(fixture.chart);
    fixture.setItems(fixture.items().slice(0, 1));
    expect(fixture.container.querySelectorAll('tbody tr')).toHaveLength(1);
    fixture.setSnapshot({ ...fixture.snapshot(), source: 'none', points: [], x: null });
    expect(
      fixture.container.querySelector<HTMLElement>('.snaplot-legend-table-root')?.style.display,
    ).toBe('none');
    plugin.destroy!(fixture.chart);
  });

  it('provides typed text-safe column factories and formats public point values', () => {
    const point: ChartPoint = {
      seriesId: 'cpu',
      label: 'CPU',
      x: 1,
      y: 2,
      rowIndex: 0,
      formattedX: '1',
      formattedY: '2%',
      color: 'red',
    };
    const series = { y: 'cpu' };
    expect((valueColumn().cell(point, series) as Node).textContent).toBe('2%');
    expect(valueColumn().cell({ ...point, y: Number.NaN }, series)).toBe('—');
    expect((metricColumn(() => '<b>metric</b>').cell(point, series) as Node).textContent).toBe(
      '<b>metric</b>',
    );
    expect((swatchColumn().cell(point, series) as HTMLElement).style.background).toBe('red');
    expect(() => createLegendTablePlugin({ columns: [valueColumn(), valueColumn()] })).toThrow(
      /unique/,
    );
  });
});
