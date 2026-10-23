/**
 * "Would a 5 kWh battery have paid for itself in this house?" — the computed answer (plan §10.2,
 * R2).
 *
 * Pure functions of `site/public/data/battery-payback/hourly.csv` (kWh per hour of one real
 * household-year). The battery model, stated on the page and in SOURCE.md:
 * - usable capacity `capacityKWh`, starting empty;
 * - charged only from PV surplus (the hour's export) and discharged only into the hour's import,
 *   each at most `powerKW` per hour (half the capacity by default: 2.5 kW for 5 kWh);
 * - 90% round trip, taken when charging (1 kWh of surplus stores 0.9 kWh);
 * - each hour discharges first, then charges; hours without readings are skipped.
 * Savings = avoided import × import price − forgone export × feed-in price; payback = installed
 * cost / yearly savings (no degradation or discounting).
 */

export interface Hour {
  /** Start of the hour, ISO 8601 UTC. */
  utc: string;
  /** Start of the hour in Europe/Berlin, `YYYY-MM-DDTHH:MM:SS+HHMM` (OPSD's cet_cest_timestamp). */
  local: string;
  /** kWh in the hour; null where the meter has no reading. */
  pv: number | null;
  import: number | null;
  export: number | null;
  /** OPSD interpolated a reading of this hour. */
  interpolated: boolean;
}

export interface Battery {
  capacityKWh: number;
  powerKW: number;
  roundTrip: number;
}

export interface Tariff {
  importEurPerKWh: number;
  feedInEurPerKWh: number;
  installedEurPerKWh: number;
}

export const TARIFF: Tariff = {
  importEurPerKWh: 0.3,
  feedInEurPerKWh: 0.08,
  installedEurPerKWh: 700,
};

/** The page's battery for a slider value: power is half the capacity per hour. */
export const battery = (capacityKWh: number): Battery => ({
  capacityKWh,
  powerKW: capacityKWh / 2,
  roundTrip: 0.9,
});

export function parseHourly(csv: string): Hour[] {
  const lines = csv.trim().split('\n');
  if (lines[0] !== 'utc,local,pv,import,export,interpolated') {
    throw new Error(`unexpected hourly.csv header: ${lines[0]}`);
  }
  const num = (s: string) => (s === '' ? null : Number(s));
  return lines.slice(1).map((line) => {
    const f = line.split(',');
    return {
      utc: f[0],
      local: f[1],
      pv: num(f[2]),
      import: num(f[3]),
      export: num(f[4]),
      interpolated: f[5] === '1',
    };
  });
}

export interface Simulation {
  battery: Battery;
  tariff: Tariff;
  /** Per hour, with the battery (NaN where the hour has no readings). */
  importWith: Float64Array;
  exportWith: Float64Array;
  /** State of charge at the end of each hour, kWh. */
  soc: Float64Array;
  importKWh: number;
  exportKWh: number;
  importWithKWh: number;
  exportWithKWh: number;
  dischargedKWh: number;
  chargedKWh: number;
  savingsEur: number;
  installedEur: number;
  /** Infinity when the battery saves nothing. */
  paybackYears: number;
}

export function simulate(hours: readonly Hour[], b = battery(5), tariff = TARIFF): Simulation {
  const n = hours.length;
  const importWith = new Float64Array(n);
  const exportWith = new Float64Array(n);
  const socs = new Float64Array(n);
  let soc = 0;
  let imp = 0;
  let exp = 0;
  let discharged = 0;
  let charged = 0;
  for (let i = 0; i < n; i++) {
    const h = hours[i];
    if (h.import === null || h.export === null) {
      importWith[i] = Number.NaN;
      exportWith[i] = Number.NaN;
      socs[i] = soc;
      continue;
    }
    const out = Math.min(h.import, b.powerKW, soc);
    soc -= out;
    const room = b.roundTrip > 0 ? (b.capacityKWh - soc) / b.roundTrip : 0;
    const inn = Math.min(h.export, b.powerKW, room);
    soc += inn * b.roundTrip;
    discharged += out;
    charged += inn;
    imp += h.import;
    exp += h.export;
    importWith[i] = h.import - out;
    exportWith[i] = h.export - inn;
    socs[i] = soc;
  }
  const savingsEur = discharged * tariff.importEurPerKWh - charged * tariff.feedInEurPerKWh;
  const installedEur = b.capacityKWh * tariff.installedEurPerKWh;
  return {
    battery: b,
    tariff,
    importWith,
    exportWith,
    soc: socs,
    importKWh: imp,
    exportKWh: exp,
    importWithKWh: imp - discharged,
    exportWithKWh: exp - charged,
    dischargedKWh: discharged,
    chargedKWh: charged,
    savingsEur,
    installedEur,
    paybackYears: savingsEur > 0 ? installedEur / savingsEur : Number.POSITIVE_INFINITY,
  };
}

export const MONTHS = [
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
] as const;

export interface MonthRow {
  month: (typeof MONTHS)[number];
  /** kWh without and with the battery. */
  import: number;
  export: number;
  importWith: number;
  exportWith: number;
}

/** Grid import and export per local calendar month, without and with the battery. */
export function monthly(hours: readonly Hour[], sim: Simulation): MonthRow[] {
  const rows: MonthRow[] = MONTHS.map((month) => ({
    month,
    import: 0,
    export: 0,
    importWith: 0,
    exportWith: 0,
  }));
  hours.forEach((h, i) => {
    if (h.import === null || h.export === null) return;
    const r = rows[Number(h.local.slice(5, 7)) - 1];
    r.import += h.import;
    r.export += h.export;
    r.importWith += sim.importWith[i];
    r.exportWith += sim.exportWith[i];
  });
  return rows;
}

export interface CostRow {
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string;
  /** Cumulative net electricity cost since January 1 (import cost − feed-in revenue), €. */
  without: number;
  with: number;
}

/** Cumulative net cost per local day; the gap between the lines is the running saving. */
export function cumulativeCost(hours: readonly Hour[], sim: Simulation): CostRow[] {
  const { importEurPerKWh: p, feedInEurPerKWh: q } = sim.tariff;
  const out: CostRow[] = [];
  let without = 0;
  let withB = 0;
  hours.forEach((h, i) => {
    if (h.import !== null && h.export !== null) {
      without += h.import * p - h.export * q;
      withB += sim.importWith[i] * p - sim.exportWith[i] * q;
    }
    const date = h.local.slice(0, 10);
    const last = out[out.length - 1];
    if (last?.date === date) {
      last.without = without;
      last.with = withB;
    } else out.push({ date, without, with: withB });
  });
  return out;
}

export interface HourBand {
  /** Local hour of day, 0–23. */
  hour: number;
  p10: number;
  median: number;
  p90: number;
}

const percentile = (sorted: readonly number[], p: number) => {
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
};

/**
 * A typical day: the 10th, 50th and 90th percentiles across the year of one quantity per local
 * hour. `load` is the household's use, import + PV − export.
 */
export function typicalDay(
  hours: readonly Hour[],
  field: 'load' | 'pv' | 'import' | 'export',
): HourBand[] {
  const byHour: number[][] = Array.from({ length: 24 }, () => []);
  for (const h of hours) {
    if (h.import === null || h.export === null || h.pv === null) continue;
    const v = field === 'load' ? h.import + h.pv - h.export : h[field];
    if (v === null) continue;
    byHour[Number(h.local.slice(11, 13))].push(v);
  }
  return byHour.map((values, hour) => {
    const s = values.sort((a, b) => a - b);
    return { hour, p10: percentile(s, 0.1), median: percentile(s, 0.5), p90: percentile(s, 0.9) };
  });
}

const eur = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

/** "A 5 kWh battery would have saved €284 in 2017; at €3,500 installed it pays back in 12.3 years." */
export function headline(sim: Simulation, year: number): string {
  const size = `A ${Number(sim.battery.capacityKWh.toFixed(1))} kWh battery`;
  if (!(sim.savingsEur > 0.005)) {
    return `${size} would have saved nothing in ${year}, so it would never pay for itself.`;
  }
  const years = sim.paybackYears;
  return `${size} would have saved ${eur.format(sim.savingsEur)} in ${year}; at ${eur.format(sim.installedEur)} installed it pays back in ${years.toFixed(1)} years.`;
}
