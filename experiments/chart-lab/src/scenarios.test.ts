import { describe, expect, it } from 'vitest';
import { buildCharts, scenarios } from './scenarios';

describe('comparison fixtures', () => {
  for (const scenario of scenarios) {
    it(`${scenario.id}: reproducible, sorted and safe for every adapter`, () => {
      const charts = buildCharts(scenario.id, 180, 12);
      expect(charts.map((chart) => chart.rows)).toEqual(buildCharts(scenario.id, 180, 12).map((chart) => chart.rows));
      for (const chart of charts) {
        expect(chart.rows.length).toBeGreaterThan(0);
        for (const [index, row] of chart.rows.entries()) {
          expect(Number.isFinite(row.x)).toBe(true);
          if (index > 0) expect(row.x).toBeGreaterThanOrEqual(chart.rows[index - 1].x);
          if (chart.xScale === 'log') expect(row.x).toBeGreaterThan(0);
          for (const series of chart.series) {
            expect(Number.isFinite(row[series.id])).toBe(true);
            if (chart.yScale === 'log') expect(row[series.id]).toBeGreaterThan(0);
          }
        }
      }
    });
    it(`${scenario.id}: gaps and focus preserve X and row identity across libraries`, () => {
      const complete = buildCharts(scenario.id);
      const gaps = buildCharts(scenario.id, 180, 0, 'gaps');
      const empty = buildCharts(scenario.id, 180, 0, 'empty');
      const focus = buildCharts(scenario.id, 180, 0, 'ready', true);
      for (const [index, chart] of complete.entries()) {
        expect(gaps[index].rows.map((row) => row.x)).toEqual(chart.rows.map((row) => row.x));
        expect(empty[index].rows).toEqual([]);
        expect(focus[index].rows).toEqual(chart.rows.slice(Math.floor(chart.rows.length * 2 / 3)));
        if (chart.rows.length > 20) expect(gaps[index].rows.some((row) => chart.series.every((series) => row[series.id] === null))).toBe(true);
      }
    });
  }
});
