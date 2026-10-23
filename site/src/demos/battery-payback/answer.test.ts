import { describe, expect, it } from 'vitest';
import hourlyCsv from '../../../public/data/battery-payback/hourly.csv?raw';
import metaJson from '../../../public/data/battery-payback/meta.json?raw';
import {
  type Hour,
  TARIFF,
  battery,
  cumulativeCost,
  headline,
  monthly,
  parseHourly,
  simulate,
  typicalDay,
} from './answer';

const hours = parseHourly(hourlyCsv);
const meta = JSON.parse(metaJson) as {
  year: number;
  hours: number;
  meter: Record<'pv' | 'grid_import' | 'grid_export', { first: number; last: number }>;
  answer: { dischargedKWh: number; chargedKWh: number; savingsEur: number; paybackYears: number };
};

/** Hours from [import, export] pairs (pv is irrelevant to the battery). */
const profile = (pairs: [number, number][]): Hour[] =>
  pairs.map(([imp, exp], i) => ({
    utc: `2017-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
    local: `2017-01-${String(1 + Math.floor(i / 24)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00+0100`,
    pv: exp,
    import: imp,
    export: exp,
    interpolated: false,
  }));

describe('[battery-payback] answer', () => {
  it('oracle: the yearly sums equal the last minus the first meter reading (no answer.ts)', () => {
    const lines = hourlyCsv.trim().split('\n');
    const header = lines[0].split(',');
    for (const [column, key] of [
      ['pv', 'pv'],
      ['import', 'grid_import'],
      ['export', 'grid_export'],
    ] as const) {
      const i = header.indexOf(column);
      let wh = 0;
      for (const line of lines.slice(1)) wh += Math.round(Number(line.split(',')[i]) * 1000);
      const { first, last } = meta.meter[key];
      expect(wh, column).toBe(Math.round(last * 1000) - Math.round(first * 1000));
    }
    expect(lines.length - 1).toBe(meta.hours);
  });

  it('oracle: a hand-computed 3-day profile', () => {
    // Each day: 8 night hours importing 0.5 kWh, 8 sunny hours exporting 1 kWh, 8 evening hours
    // importing 0.4 kWh. 5 kWh battery, 2.5 kW, 90% round trip taken on charge.
    // Day 1: charges 1 kWh/h until full: 5 × 1 + 0.5/0.9 = 5.5556 kWh in, 5 kWh stored; the
    //        evening takes 8 × 0.4 = 3.2 kWh, leaving 1.8 kWh.
    // Days 2 and 3: the night takes the remaining 1.8 kWh, the day refills 5/0.9 kWh, the
    //        evening takes 3.2 kWh again.
    // Discharged 3.2 + 5 + 5 = 13.2 kWh; charged 3 × 50/9 = 16.6667 kWh.
    // Savings 13.2 × 0.30 − 16.6667 × 0.08 = 3.96 − 1.3333 = €2.6267.
    const day: [number, number][] = [
      ...Array.from({ length: 8 }, (): [number, number] => [0.5, 0]),
      ...Array.from({ length: 8 }, (): [number, number] => [0, 1]),
      ...Array.from({ length: 8 }, (): [number, number] => [0.4, 0]),
    ];
    const sim = simulate(profile([...day, ...day, ...day]));
    expect(sim.dischargedKWh).toBeCloseTo(13.2, 9);
    expect(sim.chargedKWh).toBeCloseTo(50 / 3, 9);
    expect(sim.savingsEur).toBeCloseTo(3.96 - 4 / 3, 9);
    expect(sim.importKWh).toBeCloseTo(21.6, 9);
    expect(sim.importWithKWh).toBeCloseTo(8.4, 9);
    expect(sim.exportWithKWh).toBeCloseTo(24 - 50 / 3, 9);
    expect(sim.soc[23]).toBeCloseTo(1.8, 9);
    expect(sim.soc[31]).toBeCloseTo(0, 9);
    expect(Math.max(...sim.soc)).toBeCloseTo(5, 9);
  });

  it('oracle: the power limit, the hour order and gaps', () => {
    // 4 kWh surplus is capped at 2.5 kWh in (2.25 stored); the next hour takes all 2.25.
    // Savings 2.25 × 0.30 − 2.5 × 0.08 = 0.675 − 0.2 = €0.475.
    const capped = simulate(
      profile([
        [0, 4],
        [3, 0],
        [3, 0],
      ]),
    );
    expect(capped.chargedKWh).toBeCloseTo(2.5, 12);
    expect(capped.dischargedKWh).toBeCloseTo(2.25, 12);
    expect(capped.savingsEur).toBeCloseTo(0.475, 12);
    // Discharge comes before charge, so an hour's own surplus cannot cover its own import.
    const same = simulate(profile([[1, 1]]));
    expect(same.dischargedKWh).toBe(0);
    expect(same.soc[0]).toBeCloseTo(0.9, 12);
    // A gap hour keeps the charge.
    const gap = profile([
      [0, 1],
      [0, 0],
      [1, 0],
    ]);
    gap[1] = { ...gap[1], import: null, export: null, pv: null };
    const g = simulate(gap);
    expect(g.soc[1]).toBeCloseTo(0.9, 12);
    expect(g.dischargedKWh).toBeCloseTo(0.9, 12);
    expect(Number.isNaN(g.importWith[1])).toBe(true);
  });

  it('reconciles with the generator to the cent', () => {
    const sim = simulate(hours);
    expect(Math.round(sim.savingsEur * 100) / 100).toBe(meta.answer.savingsEur);
    expect(Math.round(sim.paybackYears * 100) / 100).toBe(meta.answer.paybackYears);
    expect(sim.dischargedKWh).toBeCloseTo(meta.answer.dischargedKWh, 5);
    expect(sim.chargedKWh).toBeCloseTo(meta.answer.chargedKWh, 5);
  });

  it('states the answer', () => {
    expect(headline(simulate(hours), meta.year)).toBe(
      'A 5 kWh battery would have saved €284 in 2017; at €3,500 installed it pays back in 12.3 years.',
    );
    expect(headline(simulate(hours, battery(0)), meta.year)).toBe(
      'A 0 kWh battery would have saved nothing in 2017, so it would never pay for itself.',
    );
    expect(headline(simulate(hours, battery(2.5)), meta.year)).toMatch(
      /^A 2\.5 kWh battery would have saved €\d+ in 2017; at €1,750 installed it pays back in \d+\.\d years\.$/,
    );
  });

  it('a bigger battery saves more but never more per kWh', () => {
    const sizes = [2.5, 5, 7.5, 10, 15].map((c) => simulate(hours, battery(c)));
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i].savingsEur).toBeGreaterThan(sizes[i - 1].savingsEur);
      expect(sizes[i].savingsEur / sizes[i].battery.capacityKWh).toBeLessThanOrEqual(
        sizes[i - 1].savingsEur / sizes[i - 1].battery.capacityKWh,
      );
    }
  });

  it('monthly bars and cumulative cost add up to the year', () => {
    const sim = simulate(hours);
    const months = monthly(hours, sim);
    expect(months).toHaveLength(12);
    const sum = (k: 'import' | 'export' | 'importWith' | 'exportWith') =>
      months.reduce((s, m) => s + m[k], 0);
    expect(sum('import')).toBeCloseTo(sim.importKWh, 6);
    expect(sum('exportWith')).toBeCloseTo(sim.exportWithKWh, 6);
    expect(sum('importWith')).toBeCloseTo(sim.importWithKWh, 6);
    const cost = cumulativeCost(hours, sim);
    expect(cost).toHaveLength(365);
    expect(cost[0].date).toBe('2017-01-01');
    const last = cost[cost.length - 1];
    expect(last.without - last.with).toBeCloseTo(sim.savingsEur, 6);
    expect(last.without).toBeCloseTo(
      sim.importKWh * TARIFF.importEurPerKWh - sim.exportKWh * TARIFF.feedInEurPerKWh,
      6,
    );
  });

  it('a typical day: 24 local hours, ordered bands, PV only in daylight', () => {
    const load = typicalDay(hours, 'load');
    expect(load).toHaveLength(24);
    for (const b of load) {
      expect(b.p10).toBeLessThanOrEqual(b.median);
      expect(b.median).toBeLessThanOrEqual(b.p90);
      expect(b.p10).toBeGreaterThanOrEqual(0);
    }
    const pv = typicalDay(hours, 'pv');
    expect(pv[2].p90).toBe(0);
    expect(pv[12].median).toBeGreaterThan(0.5);
  });
});
