// V2 `central-park-summer`: NOAA NCEI GHCN-Daily for Central Park, New York (plan §10.2).
//
//   npm run demo-data -- central-park-summer [--offline]
//
// Precomputes, per calendar day (366 slots, 02-29 included):
// - the record high (max TMAX) and record low (min TMIN) of 1869–2024 with the year set;
// - the 1991–2020 TMAX 10th, 50th and 90th percentiles over a centred 15-day window;
// - the 1991–2020 mean TMAX of that exact day (for the monthly-normals oracle);
// and the 2025 June–August daily highs and lows. GHCN-Daily stores tenths of °C; U.S. stations
// observe whole °F, which the conversion recovers exactly, so observations are whole °F and the
// derived percentiles and means carry decimals.
// Outputs: site/public/data/central-park-summer/{summer.json, oracle.json, SOURCE.md} and the
// docs slice site/src/examples/data/central-park.ts.

import { join } from 'node:path';
import {
  DATA,
  SLICES,
  biomeFormat,
  log,
  openCache,
  parseArgs,
  parseCsv,
  rel,
  renderSourceMd,
  retrievalDate,
  round,
  sizeOf,
  writeOut,
} from './lib.mjs';

export const SLUG = 'central-park-summer';
const STATION = 'USW00094728';
const DAILY_URL = `https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/access/${STATION}.csv`;
const NORMALS_URL = `https://www.ncei.noaa.gov/data/normals-monthly/1991-2020/access/${STATION}.csv`;
const RECORD_YEARS = [1869, 2024];
const NORMAL_YEARS = [1991, 2020];
const WINDOW = 7; // ± days around each calendar day for the normal band
const SUMMER = ['2025-06-01', '2025-08-31'];
/** Calendar days whose record high the oracle re-derives from the raw file by a separate scan. */
const SPOT_DAYS = ['06-01', '06-24', '07-04', '07-22', '08-15'];

/**
 * tenths of °C → whole °F. A whole-°F observation stored as tenths of °C is off by at most
 * 0.09 °F, so rounding recovers the observed value exactly.
 */
export const toF = (tenthsC) => round(((tenthsC / 10) * 9) / 5 + 32, 0);

/** The 366 calendar-day keys `MM-DD` of a leap year, in order. */
export const DAY_KEYS = Array.from({ length: 366 }, (_, i) =>
  new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(5, 10),
);

/** Linear-interpolation percentile of a sorted array (R-7, the spreadsheet PERCENTILE.INC). */
export function percentile(sorted, p) {
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

/** Daily TMAX/TMIN in tenths of °C from the station CSV, skipping values with a quality flag. */
export function readDaily(text) {
  const { header, rows } = parseCsv(text);
  const col = (k) => header.indexOf(k);
  const iDate = col('DATE');
  const iMax = col('TMAX');
  const iMaxA = col('TMAX_ATTRIBUTES');
  const iMin = col('TMIN');
  const iMinA = col('TMIN_ATTRIBUTES');
  let flagged = 0;
  const value = (r, i, ia) => {
    const s = r[i]?.trim();
    if (!s) return null;
    if ((r[ia] ?? '').split(',')[1]) {
      flagged++;
      return null;
    }
    return Number(s);
  };
  const days = [];
  for (const r of rows) {
    const tmax = value(r, iMax, iMaxA);
    const tmin = value(r, iMin, iMinA);
    if (tmax === null && tmin === null) continue;
    days.push({ date: r[iDate], tmax, tmin });
  }
  return { days, flagged };
}

export function buildClimatology(days) {
  const slot = new Map(DAY_KEYS.map((k, i) => [k, i]));
  const rec = DAY_KEYS.map(() => ({ hi: -Infinity, hiYear: 0, lo: Infinity, loYear: 0 }));
  const normals = DAY_KEYS.map(() => []);
  const exact = DAY_KEYS.map(() => []);
  for (const d of days) {
    const year = Number(d.date.slice(0, 4));
    const i = slot.get(d.date.slice(5));
    if (year >= RECORD_YEARS[0] && year <= RECORD_YEARS[1]) {
      const r = rec[i];
      // Ties keep the most recent year, as NWS climate reports do.
      if (d.tmax !== null && d.tmax >= r.hi) [r.hi, r.hiYear] = [d.tmax, year];
      if (d.tmin !== null && d.tmin <= r.lo) [r.lo, r.loYear] = [d.tmin, year];
    }
    if (year >= NORMAL_YEARS[0] && year <= NORMAL_YEARS[1] && d.tmax !== null) {
      exact[i].push(d.tmax);
      for (let k = -WINDOW; k <= WINDOW; k++) normals[(i + k + 366) % 366].push(d.tmax);
    }
  }
  return DAY_KEYS.map((day, i) => {
    const band = normals[i].map(toF).sort((a, b) => a - b);
    const mean = exact[i].reduce((s, v) => s + toF(v), 0) / exact[i].length;
    return {
      day,
      recordHigh: toF(rec[i].hi),
      recordHighYear: rec[i].hiYear,
      recordLow: toF(rec[i].lo),
      recordLowYear: rec[i].loYear,
      normalP10: round(percentile(band, 0.1), 1),
      normalMedian: round(percentile(band, 0.5), 1),
      normalP90: round(percentile(band, 0.9), 1),
      meanHigh: round(mean, 2),
      normalCount: band.length,
    };
  });
}

/** A separate scan for the oracle: the largest raw TMAX string for `MM-DD` in the record years. */
function spotCheck(text, mmdd) {
  let best = -Infinity;
  let year = 0;
  for (const line of text.split('\n')) {
    const m = /^"USW00094728","(\d{4})-(\d\d-\d\d)"/.exec(line);
    if (!m || m[2] !== mmdd) continue;
    const y = Number(m[1]);
    if (y < RECORD_YEARS[0] || y > RECORD_YEARS[1]) continue;
    const fields = line.match(/("[^"]*"|[^,]*)(,|$)/g).map((f) => f.replace(/,$/, ''));
    const tmax = fields[12]?.replaceAll('"', '').trim();
    const qflag = fields[13]?.replaceAll('"', '').split(',')[1];
    if (!tmax || qflag) continue;
    if (Number(tmax) >= best) [best, year] = [Number(tmax), y];
  }
  return { day: mmdd, rawTenthsC: best, recordHigh: toF(best), year };
}

async function main() {
  const { offline } = parseArgs();
  const cache = openCache(SLUG, { offline });
  log(`${SLUG}${offline ? ' (offline)' : ''}`);
  const dailyText = (await cache.get(`${STATION}.csv`, DAILY_URL)).toString('utf8');
  const normalsText = (await cache.get(`normals-monthly-${STATION}.csv`, NORMALS_URL)).toString(
    'utf8',
  );
  cache.save();

  const { header } = parseCsv(dailyText.slice(0, dailyText.indexOf('\n')));
  if (header[12] !== 'TMAX' || header[13] !== 'TMAX_ATTRIBUTES') {
    throw new Error(`unexpected GHCN-Daily header: ${header.slice(0, 16).join(',')}`);
  }
  const { days, flagged } = readDaily(dailyText);
  const climatology = buildClimatology(days);
  const summer = days
    .filter((d) => d.date >= SUMMER[0] && d.date <= SUMMER[1])
    .map((d) => ({ date: d.date, high: toF(d.tmax), low: toF(d.tmin) }));
  if (summer.length !== 92 || summer.some((d) => Number.isNaN(d.high) || Number.isNaN(d.low))) {
    throw new Error(`2025 June–August is incomplete: ${summer.length} days`);
  }

  // Oracle: NCEI's own 1991–2020 monthly normals, and five record highs from a separate scan.
  const normals = parseCsv(normalsText);
  const nCol = (k) => normals.header.indexOf(k);
  const monthly = normals.rows
    .filter((r) => ['06', '07', '08'].includes(r[nCol('month')]))
    .map((r) => ({
      month: r[nCol('month')],
      tmaxNormal: Number(r[nCol('MLY-TMAX-NORMAL')]),
      years: Number(r[nCol('years_MLY-TMAX-NORMAL')]),
    }));
  const spots = SPOT_DAYS.map((d) => spotCheck(dailyText, d));

  const outDir = join(DATA, SLUG);
  const summerPath = writeOut(
    join(outDir, 'summer.json'),
    `${JSON.stringify({
      station: STATION,
      name: 'NY City Central Park, NY US',
      units: '°F',
      recordYears: RECORD_YEARS,
      normalYears: NORMAL_YEARS,
      normalWindowDays: 2 * WINDOW + 1,
      climatology,
      summer2025: summer,
    })}\n`,
  );
  const oraclePath = writeOut(
    join(outDir, 'oracle.json'),
    `${JSON.stringify({ monthlyNormals: { url: NORMALS_URL, months: monthly }, recordHighs: spots })}\n`,
  );

  // Docs slice: the 92 days of summer 2025 with their normal band (plan §8.3, ≤ 20 KB).
  const byDay = new Map(climatology.map((c) => [c.day, c]));
  const slicePath = join(SLICES, 'central-park.ts');
  writeOut(
    slicePath,
    [
      '// Generated by `npm run demo-data -- central-park-summer`; do not edit.',
      '// Source: NOAA NCEI GHCN-Daily, station USW00094728 (NY City Central Park), doi:10.7289/V5D21VHZ,',
      `// a U.S. Government work; retrieved ${retrievalDate(cache.files)}. Full extract and SOURCE.md:`,
      `// site/public/data/${SLUG}/.`,
      '',
      '/** One day of summer 2025 in Central Park, in °F, with its 1991–2020 normal range. */',
      'export interface SummerDay {',
      '  /** ISO date, `YYYY-MM-DD`. */',
      '  date: string;',
      '  high: number;',
      '  low: number;',
      '  /** 10th percentile of 1991–2020 daily highs (±7 days). */',
      '  normalLow: number;',
      '  /** 90th percentile of 1991–2020 daily highs (±7 days). */',
      '  normalHigh: number;',
      '}',
      '',
      `export const summer2025: SummerDay[] = ${JSON.stringify(
        summer.map((d) => {
          const c = byDay.get(d.date.slice(5));
          return {
            date: d.date,
            high: d.high,
            low: d.low,
            normalLow: c.normalP10,
            normalHigh: c.normalP90,
          };
        }),
      )};`,
      '',
    ].join('\n'),
  );
  biomeFormat([summerPath, oraclePath, slicePath]);

  const years = new Set(days.map((d) => d.date.slice(0, 4)));
  const raw = Object.entries(cache.files).map(([name, f]) => ({ name, ...f }));
  const md = renderSourceMd({
    title: 'Central Park summer 2025: data source',
    slug: SLUG,
    summary:
      'Daily maximum and minimum temperature at NY City Central Park (GHCN-Daily USW00094728), reduced to a per-day climatology and the 2025 June–August observations.',
    urls: [
      `Daily observations: ${DAILY_URL}`,
      `Oracle, 1991–2020 monthly normals: ${NORMALS_URL}`,
      'Product page: https://www.ncei.noaa.gov/products/land-based-station/global-historical-climatology-network-daily',
      'Format: https://www.ncei.noaa.gov/pub/data/ghcn/daily/readme.txt',
    ],
    licence: 'U.S. Government work (public domain)',
    licenceEvidence: [
      'NOAA NCEI data are produced by a U.S. federal agency and are not subject to copyright in the United States (17 U.S.C. §105); the GHCN-Daily product page lists no use restrictions.',
      'WMO Resolution 40 restrictions apply only to some non-U.S. stations; USW00094728 is a U.S. NWS station.',
      'Cite as Menne et al. (2012), Global Historical Climatology Network - Daily (GHCN-Daily), Version 3, NOAA NCEI, doi:10.7289/V5D21VHZ.',
    ],
    attribution: 'NOAA NCEI GHCN-Daily, doi:10.7289/V5D21VHZ',
    retrieved: retrievalDate(cache.files),
    regenerate: [
      `npm run demo-data -- ${SLUG}            # download into scripts/demo-data/.cache/${SLUG}/`,
      `npm run demo-data -- ${SLUG} --offline  # rebuild from that cache`,
    ],
    rows: [
      `Raw: ${days.length} days with TMAX or TMIN, ${[...years].sort()[0]}–${[...years].sort().at(-1)}; ${flagged} values with a GHCN quality flag skipped.`,
      `\`summer.json\`: ${climatology.length} calendar days of climatology and ${summer.length} days of 2025 (June 1 to August 31).`,
    ],
    files: sizeOf([summerPath, oraclePath]),
    raw,
    processing: [
      'GHCN-Daily TMAX/TMIN are tenths of °C; converted with °F = °C × 9/5 + 32 and rounded to whole °F, which recovers the whole-°F U.S. observation exactly (the tenths-of-°C storage is off by at most 0.09 °F). Values with a non-blank quality flag (QFLAG) are skipped.',
      `Records: the highest TMAX and lowest TMIN for each calendar day over ${RECORD_YEARS.join('–')} (2025 excluded, so 2025 can set records); ties keep the most recent year.`,
      `Normal band: the 10th, 50th and 90th percentiles (linear interpolation, R-7) of ${NORMAL_YEARS.join('–')} daily TMAX within ±${WINDOW} calendar days of the day (a ${2 * WINDOW + 1}-day window, about 450 values; 02-29 is its own slot).`,
      `\`meanHigh\`: the plain ${NORMAL_YEARS.join('–')} mean TMAX of that exact calendar day, kept for the monthly-normals oracle.`,
      '`summer2025`: the observed daily high and low of every day from 2025-06-01 to 2025-08-31.',
    ],
    oracle: [
      ...monthly.map(
        (m) =>
          `NCEI 1991–2020 \`MLY-TMAX-NORMAL\` for month ${m.month}: **${m.tmaxNormal} °F** (${m.years} years). The mean of that month's \`meanHigh\` values must be within ±1 °F.`,
      ),
      ...spots.map(
        (s) =>
          `Record high for ${s.day} from a separate scan of the raw file: **${s.recordHigh} °F** (${s.rawTenthsC} tenths °C, ${s.year}).`,
      ),
      '`answer.test.ts` checks both against `summer.json` without importing `answer.ts` (values also in `oracle.json`); with the raw cache present it also recomputes the whole climatology and requires equality.',
    ],
    reference:
      "Tufte's reproduction of the 1980 *New York Times* weather chart (The Visual Display of Quantitative Information): newsprint cream `#FBF8F1`, greys plus one red `#C0392B` and one blue `#2E6DB4`, Libre Caslon Text for text and Libre Franklin for chart labels, one long chart with a one-line reading key.",
  });
  writeOut(join(outDir, 'SOURCE.md'), md);
  log(`  wrote ${rel(summerPath)}, ${rel(slicePath)}`);
}

await main();
