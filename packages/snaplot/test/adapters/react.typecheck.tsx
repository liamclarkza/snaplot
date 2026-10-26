/** @jsxImportSource react */
// Type tests of the React components through JSX (plan §12 M13): the generic row type flows
// through <Chart> (a forwardRef component on React 18), so a misspelled option or field is still
// rejected; refs, host attributes and the hooks take what an application passes them.
// Type-checked by `npm run typecheck` (tsconfig.test.json); never run.
import { useRef } from 'react';
import type { ChartHandle } from 'snaplot';
import { Chart, LegendTable, useChartState, useCursor } from '../../src/react';

type Row = { t: number; cpu: number };
declare const rows: Row[];

export function Valid() {
  const chart = useRef<ChartHandle<Row>>(null);
  return (
    <>
      <Chart
        ref={chart}
        data={rows}
        x="t"
        series={[{ y: 'cpu', label: 'CPU' }]}
        height={280}
        onPointClick={(point) => point.row?.cpu}
        id="cpu"
        className="chart"
        style={{ maxWidth: 640 }}
        data-testid="cpu"
        aria-describedby="cpu-note"
      />
      <Chart data={rows} x={(row) => row.t} series={[{ y: (row) => row.cpu }]} />
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
      {/* @ts-expect-error a row accessor reads the row type */}
      <Chart data={rows} x="t" series={[{ y: (row) => row.memory }]} />
    </>
  );
}

export function Hooks() {
  const chart = useRef<ChartHandle<Row>>(null);
  const handle = null as ChartHandle<Row> | null;
  const following: boolean | undefined = useChartState(handle, (state) => state.following);
  const cursor = useCursor(handle, { fallback: 'latest' });
  const value: number | undefined = cursor?.points[0]?.row?.cpu;
  // @ts-expect-error until M13's hooks take a ref object (frameworks-14)
  const fromRef: boolean | undefined = useChartState(chart, (state) => state.following);
  return (
    <>
      <LegendTable chart={handle} columns={['swatch', 'name', 'value']} />
      {/* @ts-expect-error until M13's LegendTable takes a ref object (frameworks-14) */}
      <LegendTable chart={chart} />
      <output>{`${following} ${value} ${fromRef}`}</output>
    </>
  );
}
