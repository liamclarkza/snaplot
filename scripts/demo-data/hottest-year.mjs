// `hottest-year`: the daily global mean surface air temperature from ERA5, via the Copernicus
// Climate Change Service's Climate Pulse series.
//
//   npm run demo-data -- hottest-year [--offline]
//
// Reads Climate Pulse's daily CSV (1940 onward: date, 2 m temperature, the 1991–2020 daily
// climatology, the anomaly and the FINAL/PRELIMINARY status) and writes:
// - site/public/data/hottest-year/daily.json: every day as °C to 3 decimals from 1940-01-01, the
//   366-day 1991–2020 climatology, and the first preliminary date;
// - oracle.json: the C3S-published figures the page's answer must match;
// - the docs slice site/src/examples/data/global-temperature.ts: June–August 2024 against the
//   1991–2020 mean and range of each date, 2024's daily anomalies and the annual anomalies.

import { join } from 'node:path';
import {
  DATA,
  SLICES,
  biomeFormat,
  log,
  openCache,
  parseArgs,
  rel,
  renderSourceMd,
  retrievalDate,
  round,
  sizeOf,
  writeOut,
} from './lib.mjs';

export const SLUG = 'hottest-year';
const URL_DAILY =
  'https://sites.ecmwf.int/data/climatepulse/data/series/era5_daily_series_2t_global.csv';
const START = '1940-01-01';
const NORMAL_YEARS = [1991, 2020];
/**
 * Published by C3S in its Global Climate Highlights 2024: 2024 averaged 15.10 °C, 0.72 °C above
 * 1991–2020, the warmest year in the record; 22 July 2024 was the warmest day, 17.16 °C.
 */
const PUBLISHED = {
  report: 'https://climate.copernicus.eu/global-climate-highlights-2024',
  year2024: { mean: 15.1, anomaly: 0.72 },
  warmestDay: { date: '2024-07-22', temp: 17.16 },
};

/** Day of the year as `MM-DD`. */
const monthDay = (date) => date.slice(5);

function readDaily(text) {
  const days = [];
  for (const line of text.split('\n')) {
    if (!/^\d{4}-\d{2}-\d{2},/.test(line)) continue;
    const [date, temp, clim, anomaly, status] = line.trim().split(',');
    days.push({
      date,
      temp: Number(temp),
      clim: Number(clim),
      anomaly: Number(anomaly),
      status,
    });
  }
  if (days[0]?.date !== START) throw new Error(`the series starts ${days[0]?.date}, not ${START}`);
  for (let i = 1; i < days.length; i++) {
    const step = Date.parse(days[i].date) - Date.parse(days[i - 1].date);
    if (step !== 86_400_000) throw new Error(`a gap after ${days[i - 1].date}`);
    if (!Number.isFinite(days[i].temp)) throw new Error(`no value on ${days[i].date}`);
  }
  return days;
}

async function main() {
  const { offline } = parseArgs();
  const cache = openCache(SLUG, { offline });
  log(`${SLUG}${offline ? ' (offline)' : ''}`);
  const text = (await cache.get('era5_daily_series_2t_global.csv', URL_DAILY)).toString('utf8');
  cache.save();
  const days = readDaily(text);

  // The 1991–2020 climatology of each calendar day, as the file gives it, and the range of
  // that date's 30 values (29 February: the years that have one).
  const climatology = new Map();
  const range = new Map();
  for (const d of days) {
    const year = Number(d.date.slice(0, 4));
    climatology.set(monthDay(d.date), d.clim);
    if (year < NORMAL_YEARS[0] || year > NORMAL_YEARS[1]) continue;
    const r = range.get(monthDay(d.date)) ?? { low: Infinity, high: -Infinity };
    r.low = Math.min(r.low, d.temp);
    r.high = Math.max(r.high, d.temp);
    range.set(monthDay(d.date), r);
  }
  const calendar = [...climatology.keys()].sort();
  if (calendar.length !== 366) throw new Error(`${calendar.length} calendar days`);

  const firstPreliminary = days.find((d) => d.status !== 'FINAL')?.date ?? null;
  const outDir = join(DATA, SLUG);
  const dailyPath = writeOut(
    join(outDir, 'daily.json'),
    `${JSON.stringify({
      variable: '2 m air temperature, daily global mean (°C)',
      start: START,
      normalYears: NORMAL_YEARS,
      firstPreliminary,
      temps: days.map((d) => round(d.temp, 3)),
      climatology: calendar.map((md) => round(climatology.get(md), 3)),
    })}\n`,
  );
  const oraclePath = writeOut(join(outDir, 'oracle.json'), `${JSON.stringify(PUBLISHED)}\n`);

  // Docs slice: June–August 2024 against each date's 1991–2020 mean and range, 2024's daily
  // anomalies and every complete year's mean anomaly.
  const summer = days
    .filter((d) => d.date >= '2024-06-01' && d.date <= '2024-08-31')
    .map((d) => ({
      date: d.date,
      temp: round(d.temp, 2),
      normal: round(d.clim, 2),
      low: round(range.get(monthDay(d.date)).low, 2),
      high: round(range.get(monthDay(d.date)).high, 2),
    }));
  const byYear = new Map();
  for (const d of days) {
    const year = Number(d.date.slice(0, 4));
    const y = byYear.get(year) ?? { sum: 0, n: 0 };
    y.sum += d.anomaly;
    y.n++;
    byYear.set(year, y);
  }
  // Complete years: the current one is still running.
  const lastYear = Number(days.at(-1).date.slice(0, 4));
  const years = [...byYear]
    .filter(([year, y]) => y.n >= 365 && year < lastYear)
    .map(([year, y]) => ({ year, anomaly: round(y.sum / y.n, 3) }));
  const anomalies2024 = days
    .filter((d) => d.date.startsWith('2024-'))
    .map((d) => round(d.anomaly, 2));
  const retrieved = retrievalDate(cache.files);
  const slicePath = join(SLICES, 'global-temperature.ts');
  writeOut(
    slicePath,
    [
      '// Generated by `npm run demo-data -- hottest-year`; do not edit.',
      '// Source: Copernicus Climate Change Service (C3S) / ECMWF, ERA5 daily global mean 2 m air',
      `// temperature via Climate Pulse (CC BY 4.0); retrieved ${retrieved}. Full series and SOURCE.md:`,
      `// site/public/data/${SLUG}/.`,
      '',
      '/** One day of summer 2024: the global mean, in °C, against the same date in 1991–2020. */',
      'export interface GlobalDay {',
      '  /** ISO date, `YYYY-MM-DD`. */',
      '  date: string;',
      '  /** The day’s global mean 2 m air temperature. */',
      '  temp: number;',
      '  /** The 1991–2020 mean for this date. */',
      '  normal: number;',
      '  /** The coolest and warmest this date was in 1991–2020. */',
      '  low: number;',
      '  high: number;',
      '}',
      '',
      `export const summer2024: GlobalDay[] = ${JSON.stringify(summer)};`,
      '',
      '/** Each day of 2024 against its 1991–2020 mean, °C. */',
      `export const anomalies2024: number[] = ${JSON.stringify(anomalies2024)};`,
      '',
      '/** One complete year: its mean daily anomaly against 1991–2020, °C. */',
      'export interface YearAnomaly {',
      '  year: number;',
      '  anomaly: number;',
      '}',
      '',
      `export const years: YearAnomaly[] = ${JSON.stringify(years)};`,
      '',
    ].join('\n'),
  );
  biomeFormat([dailyPath, oraclePath, slicePath]);

  const raw = Object.entries(cache.files).map(([name, f]) => ({ name, ...f }));
  const md = renderSourceMd({
    title: 'Hottest year: data source',
    slug: SLUG,
    summary:
      'The daily global mean near-surface (2 m) air temperature from the ERA5 reanalysis, 1940 to the latest day, as the Copernicus Climate Change Service publishes it on Climate Pulse.',
    urls: [
      `Daily series: ${URL_DAILY}`,
      'Climate Pulse: https://pulse.climate.copernicus.eu/',
      'ERA5 (single levels) in the Climate Data Store: https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels',
      `Oracle, C3S Global Climate Highlights 2024: ${PUBLISHED.report}`,
    ],
    licence: 'CC BY 4.0',
    licenceEvidence: [
      'The Climate Data Store catalogue lists ERA5 under CC-BY-4.0 (https://spdx.org/licenses/CC-BY-4.0).',
      'Attribution as C3S asks: "Generated using Copernicus Climate Change Service information"; the page and this file name C3S / ECMWF, ERA5 and Climate Pulse.',
    ],
    attribution: 'Copernicus Climate Change Service / ECMWF, ERA5 via Climate Pulse',
    retrieved,
    regenerate: [
      `npm run demo-data -- ${SLUG}            # download into scripts/demo-data/.cache/${SLUG}/`,
      `npm run demo-data -- ${SLUG} --offline  # rebuild from that cache`,
    ],
    rows: [
      `Raw: ${days.length.toLocaleString('en-GB')} days, ${START} to ${days.at(-1).date}; from ${firstPreliminary} the values are preliminary.`,
      `\`daily.json\`: the same ${days.length.toLocaleString('en-GB')} daily means and the 366-day 1991–2020 climatology.`,
      `Docs slice \`global-temperature.ts\`: ${summer.length} days of summer 2024, 366 daily anomalies of 2024 and ${years.length} annual anomalies.`,
    ],
    files: sizeOf([dailyPath, oraclePath]),
    raw,
    processing: [
      'Rows are the file’s data lines; the comment header is skipped. The dates must run day by day from 1940-01-01 with a value on every day.',
      'Temperatures and the climatology are kept to 3 decimals (the file gives 3).',
      'The page derives each year’s mean, each date’s record and the 1991–2020 range from these values; anomalies are the day’s value less the climatology of its date.',
    ],
    oracle: [
      `C3S Global Climate Highlights 2024: 2024 averaged ${PUBLISHED.year2024.mean.toFixed(2)} °C, ${PUBLISHED.year2024.anomaly} °C above 1991–2020; the warmest day on record was ${PUBLISHED.warmestDay.date} at ${PUBLISHED.warmestDay.temp} °C. \`answer.test.ts\` and the page's spec recompute both from \`daily.json\`.`,
    ],
    reference:
      'Climate Pulse and Ed Hawkins’ warming stripes: a stripe per year from blue to red, and every year’s daily temperature drawn as one line, the recent years on top.',
  });
  writeOut(join(outDir, 'SOURCE.md'), md);
  log(`  wrote ${rel(outDir)}/ and ${rel(slicePath)}`);
}

await main();
