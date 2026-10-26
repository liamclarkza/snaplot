/**
 * The article's three figures, each a titled chart with its source line in the explainer style:
 * a typical day (bands), the grid month by month (two bar charts sharing one scale), and the
 * year's running cost (lines, zoomable, in euros).
 */
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Chart, type ChartHandle, createChartGroup, type Viewport } from 'snaplot/react';
import { type CostRow, type Hour, type MonthRow, typicalDay } from './answer';

/** Solar in amber, the household in indigo; grey without a battery, teal with one. */
const COLORS = { pv: '#B45309', use: '#3B4A8C', without: '#767B83', with: '#0E6E73' };
const SOURCE = 'Source: Open Power System Data, Household Data 2020-04-15 (DE_KN_residential4).';

type Ref = (chart: ChartHandle | null) => void;

function Figure(props: { title: string; note: string; source: string; children: ReactNode }) {
  return (
    <figure className="r2-figure">
      <figcaption>
        <h3>{props.title}</h3>
        <p className="r2-note">{props.note}</p>
      </figcaption>
      {props.children}
      <p className="r2-source">{props.source}</p>
    </figure>
  );
}

export function TypicalDay(props: { hours: readonly Hour[]; year: number; chartRef: Ref }) {
  const rows = useMemo(() => {
    const pv = typicalDay(props.hours, 'pv');
    return typicalDay(props.hours, 'load').map((use, h) => ({
      hour: use.hour,
      use: use.median,
      useLow: use.p10,
      useHigh: use.p90,
      pv: pv[h]?.median ?? 0,
      pvLow: pv[h]?.p10 ?? 0,
      pvHigh: pv[h]?.p90 ?? 0,
    }));
  }, [props.hours]);
  return (
    <Figure
      title="Solar output and household use, by hour of the day"
      note={`The median day of ${props.year}; each band spans the 10th to 90th percentile of the year's days. kWh in each hour, local time.`}
      source={SOURCE}
    >
      <div className="r2-chart r2-chart--day">
        <Chart
          ref={props.chartRef}
          data={rows}
          x="hour"
          series={[
            {
              type: 'band',
              id: 'pv',
              label: 'Solar output',
              y: 'pv',
              lower: 'pvLow',
              upper: 'pvHigh',
              color: COLORS.pv,
            },
            {
              type: 'band',
              id: 'use',
              label: 'Household use',
              y: 'use',
              lower: 'useLow',
              upper: 'useHigh',
              color: COLORS.use,
            },
          ]}
          axes={{
            x: { min: 0, max: 23, ticks: [0, 6, 12, 18], format: hourOfDay },
            // Energy is never negative; the axis starts at zero.
            y: { min: 0, title: 'kWh', format: { maximumFractionDigits: 2 } },
          }}
          interaction="readonly"
          ariaLabel="Median hourly solar output and household use, with 10th to 90th percentile bands"
        />
      </div>
    </Figure>
  );
}

const hourOfDay = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

export function MonthlyCharts(props: {
  months: readonly MonthRow[];
  size: string;
  boughtRef: Ref;
  soldRef: Ref;
}) {
  // One group: both charts share a cursor and one Y range, so bought and sold compare by eye.
  const [group] = useState(() => createChartGroup({ yRange: true, viewport: false }));
  const bought = useMemo(
    () => props.months.map((m) => ({ month: m.month, without: m.import, with: m.importWith })),
    [props.months],
  );
  const sold = useMemo(
    () => props.months.map((m) => ({ month: m.month, without: m.export, with: m.exportWith })),
    [props.months],
  );
  const series = [
    { type: 'bar', y: 'without', label: 'Without a battery', color: COLORS.without },
    { type: 'bar', y: 'with', label: `With a ${props.size} battery`, color: COLORS.with },
  ] as const;
  const shared = {
    x: 'month',
    series,
    group,
    axes: { x: { type: 'category' }, y: { format: { maximumFractionDigits: 0, suffix: ' kWh' } } },
    interaction: 'readonly',
  } as const;
  return (
    <Figure
      title="Electricity bought from and sold to the grid, month by month"
      note="kWh per month, without a battery and with the size chosen above."
      source={`${SOURCE} Battery modelled.`}
    >
      <h4>Bought</h4>
      <div className="r2-chart r2-chart--bought">
        <Chart
          {...shared}
          ref={props.boughtRef}
          data={bought}
          ariaLabel="Electricity bought each month, without and with the battery"
        />
      </div>
      <h4>Sold</h4>
      <div className="r2-chart r2-chart--sold">
        {/* The same two series as above, so the legend above serves both. */}
        <Chart
          {...shared}
          ref={props.soldRef}
          data={sold}
          legend={false}
          ariaLabel="Electricity sold each month, without and with the battery"
        />
      </div>
    </Figure>
  );
}

const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function CostChart(props: {
  cost: readonly CostRow[];
  size: string;
  year: number;
  coarse: boolean;
  chartRef: Ref;
}) {
  const [chart, setChart] = useState<ChartHandle | null>(null);
  const [zoom, setZoom] = useState<Viewport['x']>();
  const { chartRef } = props;
  useEffect(() => chartRef(chart), [chartRef, chart]);
  return (
    <Figure
      title="What the house paid for electricity over the year"
      note={`Running total of purchases minus feed-in payments, ${props.year}, in euros. The gap between the lines is what the battery has saved so far.`}
      source={`${SOURCE} Battery and prices modelled.`}
    >
      {zoom && (
        <p className="r2-zoom">
          Showing {day.format(Number(zoom[0]))} to {day.format(Number(zoom[1]))} {props.year}.{' '}
          <button type="button" onClick={() => chart?.resetViewport()}>
            Show the whole year
          </button>
        </p>
      )}
      <div className="r2-chart r2-chart--cost">
        <Chart
          ref={setChart}
          data={props.cost}
          x="date"
          series={[
            { y: 'without', label: 'Without a battery', color: COLORS.without },
            { y: 'with', label: `With a ${props.size} battery`, color: COLORS.with },
          ]}
          axes={{ y: { format: { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 } } }}
          timeZone="UTC"
          onViewportChange={(viewport) => setZoom(viewport.x)}
          ariaLabel="Cumulative electricity cost through the year, without and with the battery"
        />
      </div>
      <p className="r2-help">
        {props.coarse
          ? 'Pinch the chart to zoom into a period; double-tap to see the whole year.'
          : 'Drag across the chart to zoom into a period; double-click to see the whole year.'}
      </p>
    </Figure>
  );
}
