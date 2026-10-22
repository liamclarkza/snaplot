// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChartOptions } from 'snaplot';
import type { Row } from '../types';
import { buildCharts, scenarios } from '../scenarios';
import type { ChartSpec } from '../types';
import { SnaplotAdapter } from './SnaplotAdapter';

type CapturedProps = ChartOptions<Row> & { hiddenSeries: string[] };
const { calls } = vi.hoisted(() => ({ calls: [] as CapturedProps[] }));
vi.mock('snaplot/react', () => ({ Chart: (props: CapturedProps) => { calls.push(props); return null; } }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  calls.length = 0;
  document.body.replaceChildren();
});

async function renderAdapter(spec: ChartSpec, theme: 'dark' | 'light' = 'dark', hidden: string[] = []): Promise<CapturedProps> {
  if (!root) {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () => {
    root!.render(<SnaplotAdapter spec={spec} theme={theme} hidden={hidden} />);
  });
  const props = calls.at(-1);
  if (!props) throw new Error('SnaplotAdapter did not render Chart');
  return props;
}

describe('SnaplotAdapter public API contract', () => {
  it('passes application rows and named series for every comparison scenario', async () => {
    for (const scenario of scenarios) for (const spec of buildCharts(scenario.id, 36, 0)) {
      const props = await renderAdapter(spec);
      expect(props.ariaLabel).toBe(spec.title);
      expect(props.data).toBe(spec.rows);
      expect(props.x).toBe('x');
      expect(props.series).toHaveLength(spec.series.length);
      spec.series.forEach((series, index) => { expect(props.series[index]).toMatchObject({
        id: series.id, y: series.id, label: series.label, type: series.kind,
        yAxis: series.axis === 'right' ? 'y2' : 'y', stroke: series.color,
        fill: series.kind === 'area' ? `${series.color}28` : series.color,
        lineWidth: 2, pointRadius: 3,
      }); });
      expect(props.referenceLines?.length).toBe(spec.reference ? 1 : 0);
    }
  });

  it('retains declared series for gaps and empty-to-loaded transitions', async () => {
    for (const scenario of scenarios) {
      const ready = buildCharts(scenario.id, 36, 0, 'ready')[0];
      for (const state of ['gaps', 'empty'] as const) {
        const spec = buildCharts(scenario.id, 36, 0, state)[0];
        const props = await renderAdapter(spec);
        expect(props.data).toBe(spec.rows);
        expect(props.series.map(series => series.id)).toEqual(ready.series.map(series => series.id));
      }
    }
  });

  it('uses controlled IDs for visibility and forwards data snapshots without lifecycle glue', async () => {
    const initial = buildCharts('transport', 24, 0)[0];
    const replay = { ...initial, rows: initial.rows.map(row => ({ ...row, arrivals: (row.arrivals ?? 0) + 1 })) };
    const first = await renderAdapter(initial, 'dark');
    const replayed = await renderAdapter(replay, 'dark');
    expect(replayed.data).toBe(replay.rows);
    expect(replayed.series).toEqual(first.series);
    const light = await renderAdapter(replay, 'light');
    expect(light.theme).not.toEqual(replayed.theme);
    const hidden = await renderAdapter(replay, 'light', ['arrivals']);
    expect(hidden.hiddenSeries).toEqual(['arrivals']);
    expect(hidden.series).toEqual(light.series);
  });
});
