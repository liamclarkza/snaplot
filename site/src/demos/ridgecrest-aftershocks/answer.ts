/**
 * "How fast did the Ridgecrest aftershocks die down?" — the computed answer (plan §10.2, V1).
 *
 * Everything here is a pure function of the events in `site/public/data/ridgecrest-aftershocks/
 * events.csv`, so the page, the brush readout and `answer.test.ts` share one definition:
 *
 * - counts use magnitude ≥ 2.5 (the usual completeness level for this sequence) per UTC day;
 * - the peak is the day with the most such events (the earliest on a tie);
 * - "fell below 10% of its peak" is the first day after the peak with fewer than a tenth of the
 *   peak count;
 * - "half came in the first X days" is the time from the window's first M ≥ 2.5 event until the
 *   event that brings the running count to half the window's total.
 */

export type DepthBand = '0–5 km' | '5–10 km' | '>10 km';
export const DEPTH_BANDS: readonly DepthBand[] = ['0–5 km', '5–10 km', '>10 km'];

export interface Quake {
  /** Origin time, epoch milliseconds (UTC). */
  time: number;
  lat: number;
  lon: number;
  /** Kilometres below sea level (negative is above). */
  depth: number;
  mag: number;
  /** ComCat event id. */
  id: string;
  depthBand: DepthBand;
}

export const DAY = 86_400_000;
export const MIN_MAG = 2.5;
/** The query window of the extract: 2019-07-01 to 2019-09-30 (exclusive), UTC. */
export const START = Date.UTC(2019, 6, 1);
export const END = Date.UTC(2019, 8, 30);
/** Origin times from the catalogue (USGS event pages ci38443183 and ci38457511). */
export const M64 = { id: 'ci38443183', time: Date.UTC(2019, 6, 4, 17, 33, 49), mag: 6.4 };
export const M71 = { id: 'ci38457511', time: Date.UTC(2019, 6, 6, 3, 19, 53, 40), mag: 7.1 };

/** The event page that `onPointClick` opens. */
export const eventPage = (id: string): string =>
  `https://earthquake.usgs.gov/earthquakes/eventpage/${encodeURIComponent(id)}`;

/** Parse `events.csv` (`time,lat,lon,depth,mag,id,depthBand`). */
export function parseEvents(csv: string): Quake[] {
  const lines = csv.split('\n');
  if (lines[0] !== 'time,lat,lon,depth,mag,id,depthBand') {
    throw new Error(`unexpected events.csv header: ${lines[0]}`);
  }
  const out: Quake[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === '') continue;
    const f = line.split(',');
    out.push({
      time: Number(f[0]),
      lat: Number(f[1]),
      lon: Number(f[2]),
      depth: Number(f[3]),
      mag: Number(f[4]),
      id: f[5],
      depthBand: f[6] as DepthBand,
    });
  }
  return out;
}

/** Start of the UTC day that contains `t`. */
export const utcDay = (t: number): number => Math.floor(t / DAY) * DAY;

export interface DayCount {
  /** Start of the UTC day, epoch milliseconds. */
  day: number;
  count: number;
}

/**
 * M ≥ `minMag` events per UTC day for every day that intersects [from, to). Days at the edges of a
 * window count only the events inside it. `events` must be sorted by time.
 */
export function dailyCounts(
  events: readonly Quake[],
  from = START,
  to = END,
  minMag = MIN_MAG,
): DayCount[] {
  const days: DayCount[] = [];
  if (!(to > from)) return days;
  for (let d = utcDay(from); d < to; d += DAY) days.push({ day: d, count: 0 });
  for (const e of events) {
    if (e.time < from || e.time >= to || !(e.mag >= minMag)) continue;
    days[(utcDay(e.time) - days[0].day) / DAY].count++;
  }
  return days;
}

export interface Decay {
  from: number;
  to: number;
  /** M ≥ 2.5 events in the window. */
  total: number;
  /** The busiest UTC day, or null for an empty window. */
  peak: DayCount | null;
  /** The first day after the peak with fewer than 10% of the peak's count, or null. */
  below: DayCount | null;
  /** Whole days from the peak day to `below`. */
  daysAfterPeak: number | null;
  /** Whether the peak day is the day of the M7.1 (so the page can say "after the M7.1"). */
  peakIsMainshock: boolean;
  /** Origin time of the window's first M ≥ 2.5 event. */
  firstTime: number | null;
  /** Origin time of the event that brings the running count to half of `total`. */
  halfTime: number | null;
  /** Days from `firstTime` to `halfTime`. */
  halfDays: number | null;
}

/** The two decay numbers for the window [from, to) (the whole extract by default). */
export function decay(events: readonly Quake[], from = START, to = END): Decay {
  const days = dailyCounts(events, from, to);
  let peak: DayCount | null = null;
  for (const d of days) if (d.count > 0 && (peak === null || d.count > peak.count)) peak = d;
  let below: DayCount | null = null;
  if (peak) {
    for (const d of days) {
      if (d.day > peak.day && d.count < peak.count / 10) {
        below = d;
        break;
      }
    }
  }
  const times: number[] = [];
  for (const e of events) if (e.time >= from && e.time < to && e.mag >= MIN_MAG) times.push(e.time);
  times.sort((a, b) => a - b);
  const total = times.length;
  const firstTime = total > 0 ? times[0] : null;
  const halfTime = total > 0 ? times[Math.ceil(total / 2) - 1] : null;
  return {
    from,
    to,
    total,
    peak,
    below,
    daysAfterPeak: peak && below ? Math.round((below.day - peak.day) / DAY) : null,
    peakIsMainshock: peak !== null && peak.day === utcDay(M71.time),
    firstTime,
    halfTime,
    halfDays: firstTime !== null && halfTime !== null ? (halfTime - firstTime) / DAY : null,
  };
}

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
});
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "1.9 days" with one decimal; hours below a day, minutes below an hour. */
export function formatDays(days: number): string {
  if (days >= 1) return `${days.toFixed(1)} days`;
  const hours = days * 24;
  if (hours >= 1) return plural(Math.round(hours), 'hour');
  const minutes = Math.round(hours * 60);
  return minutes >= 1 ? plural(minutes, 'minute') : 'less than a minute';
}

/**
 * The page's sentence. For the whole extract it reads like the plan's answer; for a brushed
 * window it names the window's own peak.
 */
export function headline(d: Decay): string {
  if (!d.peak || d.halfDays === null) return 'No M≥2.5 earthquakes in this window.';
  const after = d.peakIsMainshock ? 'the M7.1' : `its peak on ${dateFmt.format(d.peak.day)}`;
  const first =
    d.below && d.daysAfterPeak !== null
      ? `Daily M≥2.5 count fell below 10% of its peak (${d.peak.count}) on ${dateFmt.format(d.below.day)}, ${plural(d.daysAfterPeak, 'day')} after ${after}`
      : `Daily M≥2.5 count never fell below 10% of its peak (${d.peak.count}) in this window`;
  const whole = d.from === START && d.to === END;
  const half = whole
    ? `half of the 3-month total came in the first ${formatDays(d.halfDays)}`
    : `half of the window's ${plural(d.total, 'event')} came in its first ${formatDays(d.halfDays)}`;
  return `${first}; ${half}.`;
}

export interface DecayPoint {
  /** Days since the M7.1, at the middle of each one-day bin. */
  daysSince: number;
  /** M ≥ 2.5 events in that day. */
  rate: number;
}

/**
 * The seismologist's decay plot: M ≥ 2.5 events per day in one-day bins after the M7.1, for a
 * log–log chart (empty bins are left out, since log axes cannot show 0).
 */
export function decaySeries(events: readonly Quake[]): DecayPoint[] {
  const bins = new Array<number>(Math.ceil((END - M71.time) / DAY)).fill(0);
  for (const e of events) {
    if (e.time < M71.time || e.time >= END || e.mag < MIN_MAG) continue;
    bins[Math.floor((e.time - M71.time) / DAY)]++;
  }
  const out: DecayPoint[] = [];
  bins.forEach((rate, i) => {
    if (rate > 0) out.push({ daysSince: i + 0.5, rate });
  });
  return out;
}
