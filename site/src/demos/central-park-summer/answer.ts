/**
 * "Was summer 2025 unusually hot in Central Park?" — the computed answer (plan §10.2, V2).
 *
 * Pure functions of `site/public/data/central-park-summer/summer.json`:
 * - "above the normal range" is a 2025 high above that day's 1991–2020 90th percentile;
 * - the mean anomaly is the mean of (2025 high − that day's 1991–2020 median) over June–August;
 * - a record is a 2025 high at or above the 1869–2024 record for the day (a tie counts, and is
 *   reported as one), or a 2025 low at or below the record low.
 */

export interface ClimateDay {
  /** Calendar day, `MM-DD` (366 entries, 02-29 included). */
  day: string;
  /** °F, 1869–2024. */
  recordHigh: number;
  recordHighYear: number;
  recordLow: number;
  recordLowYear: number;
  /** 1991–2020 TMAX percentiles over a centred 15-day window, °F. */
  normalP10: number;
  normalMedian: number;
  normalP90: number;
  /** 1991–2020 mean TMAX of this exact day, °F. */
  meanHigh: number;
  normalCount: number;
}

export interface ObservedDay {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  /** Daily maximum and minimum, whole °F. */
  high: number;
  low: number;
}

export interface SummerData {
  station: string;
  name: string;
  units: '°F';
  recordYears: [number, number];
  normalYears: [number, number];
  normalWindowDays: number;
  climatology: ClimateDay[];
  summer2025: ObservedDay[];
}

export function parseSummer(json: string): SummerData {
  const data = JSON.parse(json) as SummerData;
  if (data.climatology?.length !== 366 || !Array.isArray(data.summer2025)) {
    throw new Error('unexpected summer.json shape');
  }
  return data;
}

/** One chart row per summer day: the observation joined to its climatology. */
export interface SummerRow extends ObservedDay {
  normalLow: number;
  normalMedian: number;
  normalHigh: number;
  recordHigh: number;
  recordHighYear: number;
  recordLow: number;
  recordLowYear: number;
  /** 'high' or 'low' when the day set (or tied) a record. */
  record: 'high' | 'low' | null;
  tie: boolean;
}

export function rows(data: SummerData): SummerRow[] {
  const byDay = new Map(data.climatology.map((c) => [c.day, c]));
  return data.summer2025.map((d) => {
    const c = byDay.get(d.date.slice(5));
    if (!c) throw new Error(`no climatology for ${d.date}`);
    const high = d.high >= c.recordHigh;
    const low = d.low <= c.recordLow;
    return {
      ...d,
      normalLow: c.normalP10,
      normalMedian: c.normalMedian,
      normalHigh: c.normalP90,
      recordHigh: c.recordHigh,
      recordHighYear: c.recordHighYear,
      recordLow: c.recordLow,
      recordLowYear: c.recordLowYear,
      record: high ? 'high' : low ? 'low' : null,
      tie: high ? d.high === c.recordHigh : low ? d.low === c.recordLow : false,
    };
  });
}

export interface SummerAnswer {
  days: number;
  /** Days whose high was above the normal range (the 90th percentile). */
  aboveNormal: number;
  aboveNormalDates: string[];
  /** Days whose high was below the normal range (the 10th percentile). */
  belowNormal: number;
  /** Mean of (high − 1991–2020 median), °F. */
  meanAnomaly: number;
  recordHighs: SummerRow[];
  recordLows: SummerRow[];
}

export function summarize(data: SummerData): SummerAnswer {
  const all = rows(data);
  const above = all.filter((r) => r.high > r.normalHigh);
  const anomaly = all.reduce((s, r) => s + (r.high - r.normalMedian), 0) / all.length;
  return {
    days: all.length,
    aboveNormal: above.length,
    aboveNormalDates: above.map((r) => r.date),
    belowNormal: all.filter((r) => r.high < r.normalLow).length,
    meanAnomaly: anomaly,
    recordHighs: all.filter((r) => r.record === 'high'),
    recordLows: all.filter((r) => r.record === 'low'),
  };
}

/** "N days between June and August 2025 had highs above the normal range; the mean …" */
export function headline(a: SummerAnswer): string {
  const days = `${a.aboveNormal} ${a.aboveNormal === 1 ? 'day' : 'days'}`;
  const verb = a.aboveNormal === 1 ? 'had a high' : 'had highs';
  const x = Math.abs(a.meanAnomaly).toFixed(1);
  const mean =
    x === '0.0'
      ? 'the mean high equalled the 1991–2020 median'
      : `the mean high was ${x} °F ${a.meanAnomaly > 0 ? 'above' : 'below'} the 1991–2020 median`;
  return `${days} between June and August 2025 ${verb} above the normal range; ${mean}.`;
}

const dateFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'long',
  day: 'numeric',
});

/** "Record highs: June 24 (99 °F, old record 96 °F in 1888); tied June 23 (96 °F)." or "". */
export function recordsLine(a: SummerAnswer): string {
  const fmt = (r: SummerRow, kind: 'high' | 'low') => {
    const when = dateFmt.format(Date.parse(`${r.date}T00:00:00Z`));
    const v = kind === 'high' ? r.high : r.low;
    const old = kind === 'high' ? r.recordHigh : r.recordLow;
    const year = kind === 'high' ? r.recordHighYear : r.recordLowYear;
    return r.tie
      ? `${when} tied (${v} °F, ${year})`
      : `${when} (${v} °F; old record ${old} °F in ${year})`;
  };
  const parts: string[] = [];
  if (a.recordHighs.length) {
    parts.push(`Record highs: ${a.recordHighs.map((r) => fmt(r, 'high')).join('; ')}.`);
  }
  if (a.recordLows.length) {
    parts.push(`Record lows: ${a.recordLows.map((r) => fmt(r, 'low')).join('; ')}.`);
  }
  return parts.join(' ');
}
