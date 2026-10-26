/**
 * The sentences around the charts, computed from the same hours and simulation as the answer
 * (answer.ts): the household's year, what the battery changes by season, and the payback
 * arithmetic. Pure functions, so the page and its tests share them.
 */
import type { Hour, MonthRow, Simulation } from './answer';

export interface YearFacts {
  pvKWh: number;
  importKWh: number;
  exportKWh: number;
  /** Electricity the household used: import + PV − export. */
  useKWh: number;
  /** The share of the import bought in hours when the panels produced nothing. */
  importInDarkShare: number;
  /** The share of the PV output the household used as it was generated. */
  pvUsedShare: number;
}

export function yearFacts(hours: readonly Hour[]): YearFacts {
  let pv = 0;
  let imp = 0;
  let exp = 0;
  let dark = 0;
  for (const h of hours) {
    if (h.pv === null || h.import === null || h.export === null) continue;
    pv += h.pv;
    imp += h.import;
    exp += h.export;
    if (h.pv === 0) dark += h.import;
  }
  return {
    pvKWh: pv,
    importKWh: imp,
    exportKWh: exp,
    useKWh: imp + pv - exp,
    importInDarkShare: imp > 0 ? dark / imp : 0,
    pvUsedShare: pv > 0 ? (pv - exp) / pv : 0,
  };
}

export const kwh = (value: number): string => `${Math.round(value).toLocaleString('en')} kWh`;
export const share = (fraction: number): string => `${Math.round(fraction * 100)}%`;
export const euro = (value: number, cents = false): string =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(value);

/** April to September, the months with a surplus to store, against October to March. */
const SUMMER = new Set(['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']);

/** How much less the house would have bought, summer against winter. */
export function seasonSentence(months: readonly MonthRow[], capacityKWh: number): string {
  const sum = (summer: boolean, key: 'import' | 'importWith') =>
    months.filter((m) => SUMMER.has(m.month) === summer).reduce((s, m) => s + m[key], 0);
  const part = (summer: boolean) => {
    const before = sum(summer, 'import');
    const after = sum(summer, 'importWith');
    const cut = before > 0 ? (before - after) / before : 0;
    return `from ${kwh(before)} to ${kwh(after)} (${cut > 0 ? '−' : ''}${share(cut)})`;
  };
  const size = `a ${Number(capacityKWh.toFixed(1))} kWh battery`;
  return `Between April and September, ${size} would have cut what the house bought ${part(true)}; between October and March, ${part(false)}.`;
}

/** "€3,500 ÷ €284.36 a year = 12.3 years", with where the €284.36 comes from. */
export function paybackSentences(sim: Simulation): string[] {
  const { importEurPerKWh: buy, feedInEurPerKWh: sell } = sim.tariff;
  const avoided = sim.dischargedKWh * buy;
  const forgone = sim.chargedKWh * sell;
  const flows = `The battery would have stored ${kwh(sim.chargedKWh)} of surplus, giving up ${euro(forgone, true)} of feed-in payments, and delivered ${kwh(sim.dischargedKWh)} to the house, saving ${euro(avoided, true)} of purchases: ${euro(sim.savingsEur, true)} in the year.`;
  if (!(sim.savingsEur > 0.005)) return [flows, 'At no saving, it never pays for itself.'];
  return [
    flows,
    `Payback: ${euro(sim.installedEur)} ÷ ${euro(sim.savingsEur, true)} a year = ${sim.paybackYears.toFixed(1)} years.`,
  ];
}
