/**
 * The hottest-year page's numbers, from the ERA5 daily global means in daily.json: each year's
 * mean and anomaly, the record for each calendar date and who holds it, and the headline. Pure
 * functions, so `answer.test.ts` can check them against an independent recount.
 */

export interface DailyFile {
  start: string;
  normalYears: [number, number];
  /** The first day whose value is still preliminary, or null. */
  firstPreliminary: string | null;
  /** Daily global mean 2 m temperature, °C, one per day from `start`. */
  temps: number[];
  /** The 1991–2020 mean of each calendar day, 01-01 to 12-31 with 02-29. */
  climatology: number[];
}

export interface Day {
  /** ISO date. */
  date: string;
  temp: number;
  anomaly: number;
}

export interface Year {
  year: number;
  /** Mean of the year's days, °C. */
  mean: number;
  /** Mean of the year's daily anomalies against 1991–2020, °C. */
  anomaly: number;
  days: number;
  /** Fewer than 365 days: the year is still running. */
  partial: boolean;
}

export interface Summary {
  years: Year[];
  /** Complete years, warmest first. */
  ranked: Year[];
  warmest: Year;
  warmestDay: Day;
  /** How many calendar dates each year holds the record for. */
  recordsHeld: Map<number, number>;
  /** The year still running, if any. */
  current: Year | undefined;
  last: Day;
}

const DAY = 86_400_000;

/** Index of a date in the 366-day calendar (01-01 is 0, 02-29 is 59). */
export function calendarIndex(date: string): number {
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return Math.round((Date.UTC(2024, month - 1, day) - Date.UTC(2024, 0, 1)) / DAY);
}

export function parseDaily(text: string): DailyFile {
  const file = JSON.parse(text) as DailyFile;
  if (!Array.isArray(file.temps) || file.climatology?.length !== 366) {
    throw new Error('hottest-year: daily.json is not the expected shape');
  }
  return file;
}

export function days(file: DailyFile): Day[] {
  const start = Date.parse(`${file.start}T00:00:00Z`);
  return file.temps.map((temp, i) => {
    const date = new Date(start + i * DAY).toISOString().slice(0, 10);
    return { date, temp, anomaly: temp - file.climatology[calendarIndex(date)] };
  });
}

export function summarize(all: readonly Day[]): Summary {
  const byYear = new Map<number, { sum: number; anomaly: number; n: number }>();
  const record = new Map<number, Day>();
  let warmestDay = all[0];
  for (const d of all) {
    const year = Number(d.date.slice(0, 4));
    const y = byYear.get(year) ?? { sum: 0, anomaly: 0, n: 0 };
    y.sum += d.temp;
    y.anomaly += d.anomaly;
    y.n++;
    byYear.set(year, y);
    const slot = calendarIndex(d.date);
    const best = record.get(slot);
    if (!best || d.temp > best.temp) record.set(slot, d);
    if (d.temp > warmestDay.temp) warmestDay = d;
  }
  const years: Year[] = [...byYear].map(([year, y]) => ({
    year,
    mean: y.sum / y.n,
    anomaly: y.anomaly / y.n,
    days: y.n,
    partial: y.n < 365,
  }));
  const ranked = years.filter((y) => !y.partial).sort((a, b) => b.mean - a.mean);
  const recordsHeld = new Map<number, number>();
  for (const d of record.values()) {
    const year = Number(d.date.slice(0, 4));
    recordsHeld.set(year, (recordsHeld.get(year) ?? 0) + 1);
  }
  return {
    years,
    ranked,
    warmest: ranked[0],
    warmestDay,
    recordsHeld,
    current: years.find((y) => y.partial),
    last: all[all.length - 1],
  };
}

const two = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = new Intl.NumberFormat('en-GB', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});
export const longDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

export const formats = { two, signed };

/** The answer to "Was 2024 the hottest year on record?". */
export function headline(s: Summary): string {
  const w = s.warmest;
  const verdict = w.year === 2024 ? 'Yes.' : `No: ${w.year} was.`;
  return (
    `${verdict} ${w.year} averaged ${two.format(w.mean)} °C, ${two.format(w.anomaly)} °C above ` +
    `the 1991–2020 average, the warmest of the ${s.ranked.length} complete years since 1940.`
  );
}

/** The line under it: the warmest day and the year still running. */
export function detail(s: Summary): string {
  const day = `The warmest day on record was ${longDate(s.warmestDay.date)}, at ${two.format(
    s.warmestDay.temp,
  )} °C.`;
  if (!s.current) return day;
  const warmer = s.ranked.filter((y) => y.anomaly > s.current!.anomaly).map((y) => y.year);
  const so = `${s.current.year} so far is ${signed.format(s.current.anomaly)} °C`;
  if (warmer.length === 0) return `${day} ${so}, warmer than any complete year.`;
  if (warmer.length <= 2) {
    return `${day} ${so}, warmer than every complete year but ${warmer.join(' and ')}.`;
  }
  return `${day} ${so}, below ${warmer.length} complete years.`;
}
