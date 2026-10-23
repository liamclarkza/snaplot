// R2 `battery-payback`: a year of real household meter data from Open Power System Data
// (plan §10.2).
//
//   npm run demo-data -- battery-payback [--offline]
//
// The OPSD `*_pv`, `*_grid_import` and `*_grid_export` columns are cumulative kWh meter readings
// at the start of each hour. The generator:
// 1. verifies that they are cumulative (never decreasing) for the chosen year;
// 2. picks the first residential household with all three columns that has a calendar year
//    (local time, Europe/Berlin) with at least 98% measured hours, taking its latest such year.
//    An hour is measured when both of its readings are present, the deltas are not negative and
//    OPSD did not interpolate either reading;
// 3. differences consecutive readings into hourly kWh, keeping OPSD's interpolated hours
//    (flagged) so that the yearly sums equal the last minus the first reading, which it asserts;
// 4. computes the battery answer with its own implementation of the documented model, which
//    `answer.test.ts` reconciles with `answer.ts` to the cent.
// Outputs: site/public/data/battery-payback/{hourly.csv, meta.json, SOURCE.md} and the docs
// slice site/src/examples/data/household.ts.

import { join } from 'node:path';
import {
  DATA,
  SLICES,
  biomeFormat,
  csvLine,
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

export const SLUG = 'battery-payback';
const URL_60 =
  'https://data.open-power-system-data.org/household_data/2020-04-15/household_data_60min_singleindex.csv';
const PACKAGE = 'https://data.open-power-system-data.org/household_data/2020-04-15/';
const COVERAGE = 0.98;
/** The battery and tariff the page states (plan §10.2). */
export const MODEL = {
  capacityKWh: 5,
  powerKW: 2.5,
  roundTrip: 0.9,
  importEurPerKWh: 0.3,
  feedInEurPerKWh: 0.08,
  installedEurPerKWh: 700,
};
const ATTRIBUTION =
  'Open Power System Data. 2020. Data Package Household Data. Version 2020-04-15. https://data.open-power-system-data.org/household_data/2020-04-15/. (Primary data from various sources, for a complete list see URL).';

const KINDS = ['pv', 'grid_import', 'grid_export'];
const milli = (v) => Math.round(v * 1000); // readings have 3 decimals: compare in Wh, exactly

/** Hourly periods of one household-year: deltas in Wh, null where a reading is missing. */
function periods(rows, cols, iLocal, iInterp, year) {
  const out = [];
  for (let i = 0; i + 1 < rows.length; i++) {
    const a = rows[i];
    if (a[iLocal].slice(0, 4) !== year) continue;
    const b = rows[i + 1];
    const interp = new Set(
      [a[iInterp], b[iInterp]].flatMap((s) => (s ? s.split('|').map((x) => x.trim()) : [])),
    );
    const deltas = cols.map((c) =>
      a[c] === '' || b[c] === '' ? null : milli(Number(b[c])) - milli(Number(a[c])),
    );
    out.push({
      utc: a[0],
      local: a[iLocal],
      deltas,
      gap: deltas.some((d) => d === null || d < 0),
      interpolated: cols.names.some((n) => interp.has(n)),
      first: cols.map((c) => a[c]),
      last: cols.map((c) => b[c]),
    });
  }
  return out;
}

/** The battery model, implemented here independently of answer.ts (see SOURCE.md). */
export function batteryTotals(hours, model = MODEL) {
  let soc = 0;
  let discharged = 0;
  let charged = 0;
  const eta = model.roundTrip;
  for (const h of hours) {
    if (h.import === null) continue;
    // Discharge first (energy stored in earlier hours), then charge from this hour's export.
    const out = Math.min(h.import, model.powerKW, soc);
    soc -= out;
    discharged += out;
    const inn = Math.min(h.export, model.powerKW, (model.capacityKWh - soc) / eta);
    soc += inn * eta;
    charged += inn;
  }
  const savings = discharged * model.importEurPerKWh - charged * model.feedInEurPerKWh;
  const cost = model.capacityKWh * model.installedEurPerKWh;
  return { discharged, charged, savings, cost, paybackYears: cost / savings };
}

async function main() {
  const { offline } = parseArgs();
  const cache = openCache(SLUG, { offline });
  log(`${SLUG}${offline ? ' (offline)' : ''}`);
  let buf;
  try {
    buf = await cache.get('household_data_60min_singleindex.csv', URL_60);
  } catch (error) {
    if (error.name !== 'DownloadFailed') throw error;
    console.error(
      `NOTE: ${error.message}.\nThe plan §10.2 fallback for R2 is a different demo ("When is Britain's electricity cleanest this week?" on https://api.carbonintensity.org.uk, CC BY 4.0), which needs its own answer.ts. It is not built by this generator; record the outage in the handoff and rerun later.`,
    );
    process.exit(2);
  }
  cache.save();

  const { header, rows } = parseCsv(buf.toString('utf8'));
  const iLocal = header.indexOf('cet_cest_timestamp');
  const iInterp = header.indexOf('interpolated');
  if (header[0] !== 'utc_timestamp' || iLocal < 0 || iInterp < 0) {
    throw new Error(`unexpected OPSD header: ${header.slice(0, 3).join(',')}`);
  }

  // Households with all three columns, in column order.
  const households = [
    ...new Set(
      header.map((h) => /^(DE_KN_residential\d+)_/.exec(h)?.[1]).filter((h) => h !== undefined),
    ),
  ].filter((h) => KINDS.every((k) => header.includes(`${h}_${k}`)));
  const years = [...new Set(rows.map((r) => r[iLocal].slice(0, 4)))].sort();
  const considered = [];
  let chosen;
  for (const hh of households) {
    const names = KINDS.map((k) => `${hh}_${k}`);
    const cols = names.map((n) => header.indexOf(n));
    cols.names = names;
    const qualifying = [];
    for (const year of years) {
      const ps = periods(rows, cols, iLocal, iInterp, year);
      const hoursInYear = (Date.UTC(Number(year) + 1, 0, 1) - Date.UTC(Number(year), 0, 1)) / 3.6e6;
      if (ps.length !== hoursInYear) continue; // a partial year in the file
      const measured = ps.filter((p) => !p.gap && !p.interpolated).length;
      considered.push({ household: hh, year, measured, hours: ps.length });
      if (measured / ps.length >= COVERAGE) qualifying.push({ year, ps, measured });
    }
    if (qualifying.length > 0) {
      chosen = { household: hh, names, ...qualifying.at(-1) };
      break;
    }
  }
  if (!chosen) throw new Error('no household-year meets the coverage rule');
  const { household, names, year, ps, measured } = chosen;
  // Cumulative meters never run backwards: count the hours where one would (they become gaps).
  const decreasing = ps.filter((p) => p.deltas.some((d) => d !== null && d < 0)).length;

  // Cumulative check: the deltas of each column sum to its last minus its first reading.
  const firstReading = ps[0].first;
  const lastReading = ps.at(-1).last;
  for (let k = 0; k < KINDS.length; k++) {
    const sum = ps.reduce((s, p) => s + (p.deltas[k] ?? 0), 0);
    const span = milli(Number(lastReading[k])) - milli(Number(firstReading[k]));
    const gaps = ps.filter((p) => p.deltas[k] === null || p.deltas[k] < 0).length;
    if (gaps === 0 && sum !== span) {
      throw new Error(`${names[k]}: deltas sum to ${sum} Wh, readings span ${span} Wh`);
    }
  }

  const hours = ps.map((p) => {
    const [pv, imp, exp] = p.gap ? [null, null, null] : p.deltas.map((d) => d / 1000);
    return {
      utc: p.utc,
      local: p.local,
      pv,
      import: imp,
      export: exp,
      interpolated: p.interpolated,
    };
  });
  const totals = batteryTotals(hours);
  const sum = (k) =>
    round(
      hours.reduce((s, h) => s + (h[k] ?? 0), 0),
      3,
    );

  const outDir = join(DATA, SLUG);
  const lines = [csvLine(['utc', 'local', 'pv', 'import', 'export', 'interpolated'])];
  for (const h of hours) {
    lines.push(csvLine([h.utc, h.local, h.pv, h.import, h.export, h.interpolated ? 1 : 0]));
  }
  const hourlyPath = writeOut(join(outDir, 'hourly.csv'), `${lines.join('\n')}\n`);
  const meta = {
    household,
    columns: names,
    year: Number(year),
    timeZone: 'Europe/Berlin',
    hours: hours.length,
    measuredHours: measured,
    interpolatedHours: hours.filter((h) => h.interpolated).length,
    gapHours: hours.filter((h) => h.import === null).length,
    meter: Object.fromEntries(
      KINDS.map((k, i) => [k, { first: Number(firstReading[i]), last: Number(lastReading[i]) }]),
    ),
    totals: { pv: sum('pv'), import: sum('import'), export: sum('export') },
    model: MODEL,
    answer: {
      dischargedKWh: round(totals.discharged, 6),
      chargedKWh: round(totals.charged, 6),
      savingsEur: round(totals.savings, 2),
      installedEur: totals.cost,
      paybackYears: round(totals.paybackYears, 2),
    },
  };
  const metaPath = writeOut(join(outDir, 'meta.json'), `${JSON.stringify(meta)}\n`);

  // Docs slice: monthly totals and one June week of hours (plan §8.3, ≤ 20 KB).
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const monthly = months.map((month, i) => {
    const mm = String(i + 1).padStart(2, '0');
    const inMonth = hours.filter((h) => h.local.slice(5, 7) === mm && h.import !== null);
    const s = (k) =>
      round(
        inMonth.reduce((t, h) => t + h[k], 0),
        1,
      );
    return { month, pv: s('pv'), import: s('import'), export: s('export') };
  });
  const week = hours
    .filter((h) => h.local >= `${year}-06-12` && h.local < `${year}-06-19`)
    .map((h) => ({ time: h.utc, pv: h.pv, import: h.import, export: h.export }));
  const slicePath = join(SLICES, 'household.ts');
  writeOut(
    slicePath,
    [
      '// Generated by `npm run demo-data -- battery-payback`; do not edit.',
      `// Source: Open Power System Data, Household Data 2020-04-15 (CC BY 4.0), household ${household}`,
      `// in Konstanz, Germany, ${year}; retrieved ${retrievalDate(cache.files)}. Full extract and`,
      '// SOURCE.md: site/public/data/battery-payback/.',
      '',
      '/** kWh per calendar month (Europe/Berlin). */',
      'export interface MonthTotal {',
      "  month: 'Jan' | 'Feb' | 'Mar' | 'Apr' | 'May' | 'Jun' | 'Jul' | 'Aug' | 'Sep' | 'Oct' | 'Nov' | 'Dec';",
      '  pv: number;',
      '  import: number;',
      '  export: number;',
      '}',
      '',
      '/** kWh in the hour starting at `time`. */',
      'export interface HourReading {',
      '  /** Start of the hour, ISO 8601 UTC. */',
      '  time: string;',
      '  pv: number;',
      '  import: number;',
      '  export: number;',
      '}',
      '',
      `export const monthlyEnergy: MonthTotal[] = ${JSON.stringify(monthly)};`,
      '',
      `/** ${year}-06-12 to ${year}-06-18, local days. */`,
      `export const juneWeek: HourReading[] = ${JSON.stringify(week)};`,
      '',
    ].join('\n'),
  );
  biomeFormat([metaPath, slicePath]);

  const raw = Object.entries(cache.files).map(([name, f]) => ({ name, ...f }));
  const md = renderSourceMd({
    title: 'Battery payback: data source',
    slug: SLUG,
    summary: `One calendar year (${year}, Europe/Berlin) of hourly PV generation, grid import and grid export of one household in Konstanz, Germany.`,
    urls: [`Data (60-minute, single index): ${URL_60}`, `Package page: ${PACKAGE}`],
    licence: 'CC BY 4.0',
    licenceEvidence: [
      `The package README (${PACKAGE}README.md) states "Data license: Creative Commons Attribution-International", and its datapackage.json lists the licence id \`CC-BY-4.0\` (https://creativecommons.org/licenses/by/4.0/).`,
      'The attribution below is copied verbatim from the README\'s "License and attribution" section (line breaks joined).',
    ],
    attribution: ATTRIBUTION,
    retrieved: retrievalDate(cache.files),
    regenerate: [
      `npm run demo-data -- ${SLUG}            # download into scripts/demo-data/.cache/${SLUG}/`,
      `npm run demo-data -- ${SLUG} --offline  # rebuild from that cache`,
    ],
    rows: [
      `Raw: ${rows.length} hourly rows, ${rows[0][0]} to ${rows.at(-1)[0]}.`,
      `Households with PV, grid import and grid export: ${households.join(', ')}. Whole years considered (measured / hours): ${considered.map((c) => `${c.household} ${c.year} ${c.measured}/${c.hours}`).join('; ')}.`,
      `Chosen: ${household}, ${year}: ${hours.length} hours, ${measured} measured (${round((100 * measured) / hours.length, 2)}%), ${meta.interpolatedHours} interpolated by OPSD (kept, flagged), ${meta.gapHours} gaps; ${decreasing} hours where a meter reading decreased (the columns are cumulative).`,
      `\`hourly.csv\`: ${hours.length} rows. Year totals: PV ${meta.totals.pv} kWh, import ${meta.totals.import} kWh, export ${meta.totals.export} kWh.`,
    ],
    files: sizeOf([hourlyPath, metaPath]),
    raw,
    processing: [
      'OPSD timestamps mark the start of each hour; a cumulative reading belongs to that instant, so the energy of the hour starting at T is reading(T + 1 h) − reading(T), in kWh with 3 decimals (computed in whole Wh, exactly).',
      "Coverage rule: an hour is measured when both readings of all three columns are present, no delta is negative and OPSD's `interpolated` marker names none of the three columns at either reading. A household-year qualifies with ≥ 98% measured hours; the first qualifying household (in column order) is used, with its latest qualifying year.",
      'OPSD interpolated hours are kept (they come from linear interpolation of the cumulative meter, so energy is preserved) and flagged `interpolated = 1`; hours without readings would be empty (there are none in the chosen year).',
      `\`local\` is OPSD's \`cet_cest_timestamp\` verbatim; months and hours of day come from it. \`utc\` is \`utc_timestamp\`.`,
      `Battery model (also on the page): ${MODEL.capacityKWh} kWh usable, ${MODEL.roundTrip * 100}% round trip (the loss is taken when charging: 1 kWh of surplus stores ${MODEL.roundTrip} kWh), ${MODEL.powerKW} kW charge and discharge limit, charged only from PV surplus (the hour's export) and discharged only into the hour's import. Each hour discharges first, then charges; the battery starts empty on January 1. The page's size slider keeps the power at half the capacity per hour.`,
      `Tariff assumptions (shown on the page): import €${MODEL.importEurPerKWh.toFixed(2)}/kWh, feed-in €${MODEL.feedInEurPerKWh.toFixed(2)}/kWh, installed €${MODEL.installedEurPerKWh}/kWh. Savings = import avoided × import price − export forgone × feed-in price; payback = installed cost / yearly savings (no degradation or discounting).`,
    ],
    oracle: [
      ...KINDS.map(
        (k, i) =>
          `\`${names[i]}\` meter: ${firstReading[i]} kWh at ${ps[0].local}, ${lastReading[i]} kWh one year later; difference ${round(Number(lastReading[i]) - Number(firstReading[i]), 3)} kWh = the sum of the hourly \`${k === 'grid_import' ? 'import' : k === 'grid_export' ? 'export' : 'pv'}\` column.`,
      ),
      `Generator's own battery total for ${MODEL.capacityKWh} kWh: **€${meta.answer.savingsEur}** saved in ${year} (${round(totals.discharged, 1)} kWh discharged, ${round(totals.charged, 1)} kWh charged); €${totals.cost} installed pays back in **${meta.answer.paybackYears} years**.`,
      '`answer.test.ts` sums the hourly import column without importing `answer.ts` and requires the meter difference exactly; it checks `answer.ts` against a hand-computed 3-day profile and against the generator total above to the cent.',
    ],
    reference:
      'An Our World in Data / Carbon Brief explainer: a white 640 px article column, a Source Serif 4 headline that states the answer, charts interleaved with short prose.',
  });
  writeOut(join(outDir, 'SOURCE.md'), md);
  log(`  wrote ${rel(hourlyPath)} (${household} ${year}), ${rel(slicePath)}`);
}

await main();
