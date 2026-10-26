// Type tests of the Solid components through JSX (plan §7.3, §12 M13): the generic row type
// flows through <Chart>, so a misspelled option or field is rejected; a function ref and a
// variable ref both type-check (frameworks-09); the primitives and <LegendTable> take a handle,
// an accessor or nothing yet. Type-checked by `npm run typecheck` (tsconfig.test.json); never run.
import { createSignal } from 'solid-js';
import type { ChartHandle } from 'snaplot';
import { Chart, createChartState, createCursor, LegendTable } from '../../src/solid';

type Row = { t: number; cpu: number };
declare const rows: Row[];

export function Valid() {
  const [chart, setChart] = createSignal<ChartHandle<Row>>();
  const following = createChartState(chart, (state) => state.following);
  const cursor = createCursor(chart, { fallback: 'latest' });
  return (
    <>
      <Chart
        ref={setChart}
        data={rows}
        x="t"
        series={[{ y: 'cpu', label: 'CPU' }]}
        height={280}
        id="cpu"
        class="chart"
        style={{ 'max-width': '640px' }}
        data-testid="cpu"
      />
      <LegendTable chart={chart} columns={['name', 'value']} />
      <LegendTable chart={chart()} />
      <output>{`${following()} ${cursor()?.points[0]?.row?.cpu}`}</output>
    </>
  );
}

export function VariableRef() {
  let chart!: ChartHandle<Row>;
  return (
    <>
      {/* @ts-expect-error until M13 types ref as Solid's Ref<ChartHandle> (frameworks-09) */}
      <Chart ref={chart} data={rows} x="t" series={[{ y: 'cpu' }]} />
    </>
  );
}

export function Rejected() {
  return (
    <>
      {/* @ts-expect-error a misspelled option is rejected through JSX */}
      <Chart data={rows} x="t" seris={[{ y: 'cpu' }]} />
      {/* @ts-expect-error a field the row does not have is rejected */}
      <Chart data={rows} x="time" series={[{ y: 'cpu' }]} />
      {/* @ts-expect-error a misspelled series field is rejected */}
      <Chart data={rows} x="t" series={[{ y: 'cpu', lable: 'CPU' }]} />
    </>
  );
}
