// V1 `ridgecrest-aftershocks`: the 2019 Ridgecrest sequence from USGS ComCat (plan §10.2).
//
//   npm run demo-data -- ridgecrest-aftershocks [--offline]
//
// 1. Asks `/fdsnws/event/1/count` for the plan's box and three months, and halves time windows
//    until each holds fewer than 20,000 events (the FDSN per-query limit).
// 2. Downloads each window as CSV, de-duplicates by event id (window bounds are inclusive) and
//    keeps `time, lat, lon, depth, mag, id` plus a computed `depthBand`.
// 3. Records the oracle: USGS's own M≥2.5 count for three UTC days, from `/count`.
// Outputs: site/public/data/ridgecrest-aftershocks/{events.csv, oracle.json, SOURCE.md} and the
// docs slice site/src/examples/data/aftershocks.ts.

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

export const SLUG = 'ridgecrest-aftershocks';
const FDSN = 'https://earthquake.usgs.gov/fdsnws/event/1';
const START = '2019-07-01T00:00:00';
const END = '2019-09-30T00:00:00';
const BOX = 'minlatitude=35.3&maxlatitude=36.2&minlongitude=-118.1&maxlongitude=-117.2';
const LIMIT = 20_000;
/**
 * UTC days whose M≥2.5 count USGS reports independently (the oracle, plan §10.2): the peak day
 * (the M7.1), the first day below 10% of the peak, and a late, quiet day.
 */
export const ORACLE_DAYS = ['2019-07-06', '2019-07-08', '2019-08-22'];

const query = (kind, start, end, extra = '') =>
  `${FDSN}/${kind}?${kind === 'query' ? 'format=csv&orderby=time-asc&' : ''}starttime=${start}&endtime=${end}&${BOX}${extra}`;

const iso = (ms) => new Date(ms).toISOString().slice(0, 19);

/** '0–5 km' (depth ≤ 5, including the few negative depths above sea level), '5–10 km', '>10 km'. */
export function depthBand(depth) {
  if (depth <= 5) return '0–5 km';
  if (depth <= 10) return '5–10 km';
  return '>10 km';
}

async function count(cache, name, url) {
  const text = (await cache.get(name, url)).toString('utf8').trim();
  const n = Number(text);
  if (!Number.isInteger(n)) throw new Error(`unexpected count response for ${url}: ${text}`);
  return n;
}

/**
 * Halve [start, end) until every window's count is under the limit. Returns the windows and the
 * first count, which is the whole query: the catalogue size on the retrieval date.
 */
async function planWindows(cache) {
  if (cache.offline) {
    // Re-read every count the online run made, in its order, so the raw list is identical.
    const counts = [];
    for (const name of cache.extra.visited) counts.push(await count(cache, name, ''));
    return { windows: cache.extra.windows, total: counts[0] };
  }
  const windows = [];
  const visited = [];
  const visit = async (startMs, endMs) => {
    const name = `count-${iso(startMs)}-${iso(endMs)}.txt`.replaceAll(':', '');
    visited.push(name);
    const n = await count(cache, name, query('count', iso(startMs), iso(endMs)));
    if (n < LIMIT) {
      windows.push({ start: iso(startMs), end: iso(endMs), count: n });
      return n;
    }
    const mid = startMs + Math.floor((endMs - startMs) / 2 / 1000) * 1000;
    await visit(startMs, mid);
    await visit(mid, endMs);
    return n;
  };
  const total = await visit(Date.parse(`${START}Z`), Date.parse(`${END}Z`));
  cache.extra.windows = windows;
  cache.extra.visited = visited;
  return { windows, total };
}

async function main() {
  const { offline } = parseArgs();
  const cache = openCache(SLUG, { offline });
  log(`${SLUG}${offline ? ' (offline)' : ''}`);

  const { windows, total } = await planWindows(cache);

  const byId = new Map();
  const typeCounts = {};
  let noMag = 0;
  for (const w of windows) {
    const name = `events-${w.start}-${w.end}.csv`.replaceAll(':', '');
    const text = (await cache.get(name, query('query', w.start, w.end))).toString('utf8');
    const { header, rows } = parseCsv(text);
    const col = (k) => header.indexOf(k);
    const [iTime, iLat, iLon, iDepth, iMag, iId, iType] = [
      'time',
      'latitude',
      'longitude',
      'depth',
      'mag',
      'id',
      'type',
    ].map(col);
    if ([iTime, iLat, iLon, iDepth, iMag, iId, iType].some((i) => i < 0)) {
      throw new Error(`unexpected ComCat CSV header in ${name}: ${header.join(',')}`);
    }
    if (rows.length !== w.count) {
      log(`  note: ${name} has ${rows.length} rows, /count said ${w.count}`);
    }
    for (const r of rows) {
      if (byId.has(r[iId])) continue;
      const mag = r[iMag] === '' ? Number.NaN : Number(r[iMag]);
      if (Number.isNaN(mag)) {
        noMag++;
        continue;
      }
      typeCounts[r[iType]] = (typeCounts[r[iType]] ?? 0) + 1;
      byId.set(r[iId], {
        time: Date.parse(r[iTime]),
        lat: Number(r[iLat]),
        lon: Number(r[iLon]),
        depth: Number(r[iDepth]),
        mag,
        id: r[iId],
      });
    }
  }
  const events = [...byId.values()].sort((a, b) => a.time - b.time || (a.id < b.id ? -1 : 1));

  // Oracle: USGS's own daily M≥2.5 counts for three UTC days.
  const oracle = [];
  for (const day of ORACLE_DAYS) {
    const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const url = query('count', `${day}T00:00:00`, `${next}T00:00:00`, '&minmagnitude=2.5');
    oracle.push({
      day,
      minMagnitude: 2.5,
      count: await count(cache, `oracle-${day}.txt`, url),
      url,
    });
  }
  cache.save();

  // events.csv: one row per event, time in epoch milliseconds (UTC).
  const outDir = join(DATA, SLUG);
  const lines = [csvLine(['time', 'lat', 'lon', 'depth', 'mag', 'id', 'depthBand'])];
  for (const e of events) {
    lines.push(
      csvLine([
        e.time,
        round(e.lat, 4),
        round(e.lon, 4),
        round(e.depth, 2),
        round(e.mag, 2),
        e.id,
        depthBand(e.depth),
      ]),
    );
  }
  const eventsPath = writeOut(join(outDir, 'events.csv'), `${lines.join('\n')}\n`);
  const oraclePath = writeOut(
    join(outDir, 'oracle.json'),
    `${JSON.stringify({ source: 'USGS /fdsnws/event/1/count', days: oracle }, null, 2)}\n`,
  );

  // Docs slice: daily counts for the whole window and every M≥4.5 event (plan §8.3, ≤ 20 KB).
  const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
  const days = new Map();
  for (let t = Date.parse(`${START}Z`); t < Date.parse(`${END}Z`); t += 86_400_000) {
    days.set(dayKey(t), { all: 0, m25: 0 });
  }
  for (const e of events) {
    const d = days.get(dayKey(e.time));
    if (!d) continue;
    d.all++;
    if (e.mag >= 2.5) d.m25++;
  }
  const big = events.filter((e) => e.mag >= 4.5);
  const slicePath = join(SLICES, 'aftershocks.ts');
  writeOut(
    slicePath,
    [
      '// Generated by `npm run demo-data -- ridgecrest-aftershocks`; do not edit.',
      '// Source: U.S. Geological Survey, ANSS ComCat (U.S. public domain), FDSN event service,',
      `// box 35.3–36.2° N, 118.1–117.2° W, ${START.slice(0, 10)} to ${END.slice(0, 10)} UTC,`,
      `// retrieved ${retrievalDate(cache.files)}. Full extract and SOURCE.md: site/public/data/${SLUG}/.`,
      '',
      '/** Events per UTC day: every magnitude, and M≥2.5 only. */',
      'export interface DailyCount {',
      '  /** UTC day, `YYYY-MM-DD`. */',
      '  day: string;',
      '  events: number;',
      '  m25: number;',
      '}',
      '',
      '/** One earthquake of magnitude 4.5 or more. */',
      'export interface Quake {',
      '  /** Origin time, epoch milliseconds (UTC). */',
      '  time: number;',
      '  mag: number;',
      '  /** Kilometres below sea level. */',
      '  depth: number;',
      "  depthBand: '0–5 km' | '5–10 km' | '>10 km';",
      '  /** ComCat event id; the event page is https://earthquake.usgs.gov/earthquakes/eventpage/<id>. */',
      '  id: string;',
      '}',
      '',
      `export const dailyCounts: DailyCount[] = ${JSON.stringify(
        [...days].map(([day, d]) => ({ day, events: d.all, m25: d.m25 })),
      )};`,
      '',
      `export const largeQuakes: Quake[] = ${JSON.stringify(
        big.map((e) => ({
          time: e.time,
          mag: round(e.mag, 2),
          depth: round(e.depth, 2),
          depthBand: depthBand(e.depth),
          id: e.id,
        })),
      )};`,
      '',
    ].join('\n'),
  );
  biomeFormat([oraclePath, slicePath]);

  const m25 = events.filter((e) => e.mag >= 2.5).length;
  const raw = Object.entries(cache.files).map(([name, f]) => ({ name, ...f }));
  const files = sizeOf([eventsPath, oraclePath]);
  const md = renderSourceMd({
    title: 'Ridgecrest aftershocks: data source',
    slug: SLUG,
    summary:
      'Every catalogued event of the 2019 Ridgecrest, California sequence in a fixed box, July to September 2019.',
    urls: [
      `Events (FDSN event service, CSV): ${query('query', START, END)}`,
      `Count check: ${query('count', START, END)}`,
      'Service documentation: https://earthquake.usgs.gov/fdsnws/event/1/',
    ],
    licence: 'U.S. public domain',
    licenceEvidence: [
      'USGS: "USGS-authored or produced data and information are considered to be in the U.S. public domain" (https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits).',
      'ComCat is the ANSS Comprehensive Earthquake Catalog operated by the USGS; the requested catalogue fields are USGS products.',
    ],
    attribution: 'U.S. Geological Survey, ANSS ComCat',
    retrieved: retrievalDate(cache.files),
    regenerate: [
      `npm run demo-data -- ${SLUG}            # download into scripts/demo-data/.cache/${SLUG}/`,
      `npm run demo-data -- ${SLUG} --offline  # rebuild from that cache`,
    ],
    rows: [
      `/count for the whole query on the retrieval date: ${total} events.`,
      `\`events.csv\`: ${events.length} events (${m25} of magnitude 2.5 or more); ${noMag} ${noMag === 1 ? 'event' : 'events'} without a magnitude dropped.`,
      `Event types: ${Object.entries(typeCounts)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ')}.`,
      `Query windows (each under ${LIMIT} events): ${windows.map((w) => `${w.start}–${w.end} (${w.count})`).join('; ')}.`,
    ],
    files,
    raw,
    processing: [
      '`time` is the origin time in epoch milliseconds (UTC); `lat`/`lon` in degrees (4 decimals); `depth` in km below sea level (2 decimals; negative is above sea level); `mag` as catalogued (mixed magnitude types, 2 decimals); `id` is the ComCat event id.',
      '`depthBand`: `0–5 km` for depth ≤ 5 (negative depths included), `5–10 km` for 5 < depth ≤ 10, `>10 km` above 10.',
      'FDSN window bounds are inclusive, so events are de-duplicated by `id`; rows are sorted by time, then id.',
      'All event types are kept (as in the `/count` oracle, which has no type filter).',
    ],
    oracle: [
      ...oracle.map(
        (o) =>
          `USGS \`/count\` with \`minmagnitude=2.5\` for UTC day ${o.day}: **${o.count}** (${o.url}).`,
      ),
      '`answer.test.ts` recounts those days from `events.csv` without importing `answer.ts` and requires equality; the values are also in `oracle.json`.',
    ],
    reference:
      'USGS event pages and helicorder plots: white `#FFFFFF`, black ink, thin grey rules; depth bands `#de4968` (0–5 km), `#8c2981` (5–10 km), `#3b0f70` (>10 km); the system UI stack with tabular figures; a full-width daily-count strip like a helicorder trace on top, then the scatter and the decay plot side by side at 1280 px.',
  });
  writeOut(join(outDir, 'SOURCE.md'), md);
  log(`  wrote ${rel(eventsPath)} (${events.length} events), ${rel(slicePath)}`);
}

await main();
