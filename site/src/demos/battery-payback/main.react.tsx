/**
 * "Would a 5 kWh battery have paid for itself in this house?" (plan §10.2, R2): the interactive
 * part of the article. The page around it (the headline, the household's year, the model) is
 * static HTML computed at build time from the same data and answer.ts.
 *
 * What it shows of snaplot/react: the battery-size slider recomputes the simulation and every
 * derived series with useMemo, and the charts keep their zoom while the data changes; currency
 * formats; bands; grouped bars on a category axis; and the automatic legend.
 */
import { StrictMode, useEffect, useMemo, useState } from 'react';
import type { ChartHandle } from 'snaplot/react';
import {
  battery,
  cumulativeCost,
  type Hour,
  headline,
  monthly,
  parseHourly,
  simulate,
} from './answer';
import { paybackSentences, seasonSentence } from './facts';
import { CostChart, MonthlyCharts, TypicalDay } from './figures.react';

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');
const SIZES = { min: 1, max: 15, step: 0.5, initial: 5 };

export default function BatteryPayback() {
  return (
    <StrictMode>
      <Loader />
    </StrictMode>
  );
}

function Loader() {
  const [data, setData] = useState<{ hours: Hour[]; year: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const get = (file: string) =>
      fetch(`${BASE}data/battery-payback/${file}`).then((r) => {
        if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
        return r.text();
      });
    Promise.all([get('hourly.csv'), get('meta.json')]).then(
      ([csv, meta]) =>
        live &&
        setData({ hours: parseHourly(csv), year: (JSON.parse(meta) as { year: number }).year }),
      (reason: unknown) => live && setError(String(reason)),
    );
    return () => {
      live = false;
    };
  }, []);
  if (error) return <p role="alert">The meter readings did not load ({error}). Reload to retry.</p>;
  if (!data) return <p className="r2-loading">Loading a year of hourly meter readings…</p>;
  return <Explorer hours={data.hours} year={data.year} />;
}

function Explorer({ hours, year }: { hours: Hour[]; year: number }) {
  const [size, setSize] = useState(SIZES.initial);
  // Everything that depends on the battery is derived here, once per size.
  const sim = useMemo(() => simulate(hours, battery(size)), [hours, size]);
  const months = useMemo(() => monthly(hours, sim), [hours, sim]);
  const cost = useMemo(() => cumulativeCost(hours, sim), [hours, sim]);
  const [charts, setCharts] = useState<Record<string, ChartHandle | null>>({});
  const coarse = useCoarsePointer();
  const label = `${Number(size.toFixed(1))} kWh`;

  // The handles go on `window.charts`, so the console can try the API on this page; the
  // data-demo-ready flag tells screenshot tools that every chart has painted.
  const ready = ['day', 'bought', 'sold', 'cost'].every((key) => charts[key]);
  useEffect(() => {
    if (!ready) return;
    (window as unknown as { charts: typeof charts }).charts = charts;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        document.documentElement.dataset.demoReady = '';
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, charts]);
  const register = useMemo(() => {
    const make = (key: string) => (chart: ChartHandle | null) =>
      setCharts((current) => (current[key] === chart ? current : { ...current, [key]: chart }));
    return { day: make('day'), bought: make('bought'), sold: make('sold'), cost: make('cost') };
  }, []);

  return (
    <>
      <TypicalDay hours={hours} year={year} chartRef={register.day} />
      <p>
        A battery would store part of that midday surplus and spend it in the evening and at night.
        How much it saves depends on its size: try other sizes with the slider, and the charts and
        sums below follow. How the battery is modelled is at the end of the page.
      </p>
      <div className="r2-control">
        <label htmlFor="r2-size">Battery size</label>
        <input
          id="r2-size"
          type="range"
          min={SIZES.min}
          max={SIZES.max}
          step={SIZES.step}
          value={size}
          aria-valuetext={label}
          onChange={(event) => setSize(Number(event.currentTarget.value))}
        />
        <output htmlFor="r2-size" className="num">
          {label}
        </output>
        <p className="r2-live" aria-live="polite">
          {headline(sim, year)}
        </p>
      </div>
      <MonthlyCharts
        months={months}
        size={label}
        boughtRef={register.bought}
        soldRef={register.sold}
      />
      <p>{seasonSentence(months, size)}</p>
      <CostChart cost={cost} size={label} year={year} coarse={coarse} chartRef={register.cost} />
      <div className="r2-payback">
        {paybackSentences(sim).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </>
  );
}

/** Whether the main pointer is a finger, so the help names the gestures the reader has. */
function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => matchMedia('(pointer: coarse)').matches);
  useEffect(() => {
    const query = matchMedia('(pointer: coarse)');
    const update = () => setCoarse(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return coarse;
}
