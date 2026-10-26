// @vitest-environment jsdom
// The Solid components and primitives on the real core (plan §12 M8: they compile on
// setOptions; M13 finalises them with the conformance suite).
import { createSignal } from 'solid-js';
import { createComponent, render } from 'solid-js/web';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createChart } from '../../src/public/chart';
import type { ChartHandle } from '../../src/public/types';
import { Chart } from '../../src/solid/Chart';
import { LegendTable } from '../../src/solid/LegendTable';
import { createChartState, createCursor } from '../../src/solid/primitives';
import { debug, type Fakes, installFakes } from '../fakes';

type Row = { t: number; cpu: number };
const rows: Row[] = Array.from({ length: 20 }, (_, t) => ({ t, cpu: 40 + (t % 7) }));

let fakes: Fakes;
let dispose: (() => void) | undefined;
beforeEach(() => {
  fakes = installFakes();
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  fakes.uninstall();
});

function host(): HTMLElement {
  const element = document.createElement('div');
  fakes.layout.setSize(element, 400, 200);
  document.body.append(element);
  return element;
}

describe('Solid Chart', () => {
  it('mounts with its options, passes host attributes and reacts without re-ingesting', () => {
    let chart: ChartHandle<Row> | undefined;
    const [title, setTitle] = createSignal('Load');
    dispose = render(
      () =>
        createComponent(Chart<Row>, {
          ref: (value) => {
            chart = value;
          },
          id: 'cpu',
          data: rows,
          x: 't',
          series: [{ y: 'cpu' }],
          get axes() {
            return { y: { title: title() } };
          },
        }),
      host(),
    );
    expect(chart?.container.id).toBe('cpu');
    const before = debug(chart!).ingestCount;
    setTitle('Load (%)');
    expect(debug(chart!).ingestCount).toBe(before);
    dispose();
    dispose = undefined;
    expect(chart).toBeUndefined();
  });
});

describe('[frameworks-16][frameworks-20] the Solid host', () => {
  it('[frameworks-16] passes class, data-*, tabindex and DOM handlers through; is a named figure', () => {
    let clicks = 0;
    const element = host();
    dispose = render(
      () =>
        createComponent(Chart<Row>, {
          data: rows,
          x: 't',
          series: [{ y: 'cpu', label: 'CPU' }],
          class: 'chart',
          tabIndex: -1,
          onClick: () => clicks++,
          ...{ 'data-testid': 'cpu' },
        }),
      element,
    );
    const div = element.firstElementChild as HTMLElement;
    expect(div.className).toBe('chart');
    expect(div.dataset.testid).toBe('cpu');
    expect(div.getAttribute('tabindex')).toBe('-1');
    expect(div.getAttribute('role')).toBe('figure');
    div.click();
    expect(clicks).toBe(1);
  });

  it('[backlog-05] an explicit height sets the host height and follows a change', () => {
    const [height, setHeight] = createSignal<number | undefined>(280);
    const element = host();
    dispose = render(
      () =>
        createComponent(Chart<Row>, {
          data: rows,
          x: 't',
          series: [{ y: 'cpu' }],
          get height() {
            return height();
          },
          style: { 'max-width': '640px' },
        }),
      element,
    );
    const div = element.firstElementChild as HTMLElement;
    expect(div.style.height).toBe('280px');
    expect(div.style.maxWidth).toBe('640px');
    setHeight(400);
    expect(div.style.height).toBe('400px');
    setHeight(undefined);
    expect(div.style.height).toBe('100%');
  });

  it('[frameworks-09] a variable ref (compiled to a setter) gets the handle, then undefined', () => {
    let chart: ChartHandle<Row> | undefined;
    // What the Solid compiler makes of <Chart ref={chart} />.
    const props = {
      ref(value: ChartHandle<Row> | undefined) {
        chart = value;
      },
      data: rows,
      x: 't',
      series: [{ y: 'cpu' }],
    };
    dispose = render(() => createComponent(Chart<Row>, props as never), host());
    expect(chart?.getState().series).toHaveLength(1);
    dispose();
    dispose = undefined;
    expect(chart).toBeUndefined();
  });
});

describe('Solid primitives and LegendTable', () => {
  const mount = () =>
    createChart<Row>(host(), { data: rows, x: 't', series: [{ y: 'cpu', label: 'CPU' }] });

  it('[frameworks-09] createChartState, createCursor and LegendTable take a handle or an accessor', () => {
    const chart = mount();
    const element = host();
    let following: (() => boolean | undefined) | undefined;
    let cursor: (() => number | undefined) | undefined;
    dispose = render(() => {
      const state = createChartState(chart, (s) => s.following);
      const latest = createCursor(() => chart, { fallback: 'latest' });
      following = state;
      cursor = () => latest()?.points[0]?.y;
      return createComponent(LegendTable<Row>, { chart, columns: ['name', 'value'] });
    }, element);
    expect(following?.()).toBe(true);
    expect(cursor?.()).toBe(rows[19].cpu);
    chart.setCursor(4);
    expect(cursor?.()).toBe(rows[4].cpu);
    expect(element.querySelector('tbody tr')?.textContent).toBe(`CPU${rows[4].cpu}`);
    chart.destroy();
  });

  it('[frameworks-09] an accessor that has no chart yet renders nothing until it has one', () => {
    const [chart, setChart] = createSignal<ChartHandle<Row>>();
    const element = host();
    dispose = render(() => createComponent(LegendTable<Row>, { chart }), element);
    expect(element.querySelector('table')).toBeNull();
    const created = mount();
    setChart(() => created);
    expect(element.querySelector('table')).not.toBeNull();
    created.destroy();
  });
});
