import { describe, expect, it } from 'vitest';
import hourlyCsv from '../../../public/data/battery-payback/hourly.csv?raw';
import metaJson from '../../../public/data/battery-payback/meta.json?raw';
import { battery, monthly, parseHourly, simulate } from './answer';
import { paybackSentences, seasonSentence, yearFacts } from './facts';

const hours = parseHourly(hourlyCsv);
const meta = JSON.parse(metaJson) as {
  totals: { pv: number; import: number; export: number };
};

describe('[battery-payback] the page text', () => {
  it("the household's year equals the generator's meter totals", () => {
    const year = yearFacts(hours);
    expect(year.pvKWh).toBeCloseTo(meta.totals.pv, 6);
    expect(year.importKWh).toBeCloseTo(meta.totals.import, 6);
    expect(year.exportKWh).toBeCloseTo(meta.totals.export, 6);
    expect(year.useKWh).toBeCloseTo(meta.totals.import + meta.totals.pv - meta.totals.export, 6);
  });

  it('oracle: the share bought in hours without sun, recounted from the CSV (no facts.ts)', () => {
    let all = 0;
    let dark = 0;
    for (const line of hourlyCsv.trim().split('\n').slice(1)) {
      const [, , pv, imp] = line.split(',');
      all += Number(imp);
      if (Number(pv) === 0) dark += Number(imp);
    }
    expect(yearFacts(hours).importInDarkShare).toBeCloseTo(dark / all, 12);
    expect(Math.round((dark / all) * 100)).toBe(67);
  });

  it('says what a 5 kWh battery changes, summer against winter', () => {
    const sim = simulate(hours, battery(5));
    expect(seasonSentence(monthly(hours, sim), 5)).toBe(
      'Between April and September, a 5 kWh battery would have cut what the house bought from 815 kWh to 141 kWh (−83%); between October and March, from 3,581 kWh to 2,909 kWh (−19%).',
    );
  });

  it('shows the payback arithmetic to the cent', () => {
    expect(paybackSentences(simulate(hours, battery(5)))).toEqual([
      'The battery would have stored 1,497 kWh of surplus, giving up €119.73 of feed-in payments, and delivered 1,347 kWh to the house, saving €404.09 of purchases: €284.36 in the year.',
      'Payback: €3,500 ÷ €284.36 a year = 12.3 years.',
    ]);
  });

  it('never writes a payback for a battery that saves nothing', () => {
    const none = paybackSentences(simulate(hours, battery(0)));
    expect(none[1]).toBe('At no saving, it never pays for itself.');
    expect(none.join(' ')).not.toMatch(/NaN|Infinity/);
  });
});
