import { describe, expect, it } from 'vitest';
import {
  comparisonColumns,
  comparisonScores,
  comparisonSeries,
  experimentRuns,
  progressColumns,
  progressValue,
  runIdsAtRows,
  runsById,
  topRunsByAccuracy,
} from './data';

describe('CohortLab comparison data flow', () => {
  const allRuns = experimentRuns(40);

  it('resolves stable IDs in requested order without relying on array position', () => {
    const reordered = [allRuns[8], allRuns[2], allRuns[14], allRuns[5]];
    expect(runsById(reordered, [5, 8, 999, 2]).map(run => run.id)).toEqual([5, 8, 2]);
  });

  it('maps selected scatter rows back to stable, unique run IDs', () => {
    const filtered = [allRuns[12], allRuns[4], allRuns[31], allRuns[7]];
    expect(runIdsAtRows(filtered, [2, 0, 2, 99, 1])).toEqual([31, 12, 4]);
  });

  it('keeps series, trajectory columns, and score columns in identical run order', () => {
    const selected = runsById(allRuns, [18, 3, 27]);
    const series = comparisonSeries(selected);
    const trajectories = progressColumns(selected);
    const scores = comparisonColumns(selected);

    expect(series.map(item => item.dataIndex)).toEqual([1, 2, 3]);
    expect(series.map(item => item.meta?.runId)).toEqual([18, 3, 27]);
    expect(trajectories).toHaveLength(selected.length + 1);
    expect(scores).toHaveLength(selected.length + 1);

    selected.forEach((run, index) => {
      expect(trajectories[index + 1][20]).toBeCloseTo(progressValue(run, 20), 10);
      expect(Array.from(scores[index + 1])).toEqual(comparisonScores(run));
    });
  });

  it('keeps normalized scores inside the displayed 0–100 domain', () => {
    for (const run of allRuns) {
      for (const score of comparisonScores(run)) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('ranks visible input by accuracy without mutating its order', () => {
    const visible = [allRuns[9], allRuns[2], allRuns[17], allRuns[5]];
    const originalIds = visible.map(run => run.id);
    const ranked = topRunsByAccuracy(visible, 3);

    expect(visible.map(run => run.id)).toEqual(originalIds);
    expect(ranked).toHaveLength(3);
    expect(ranked[0].accuracy).toBeGreaterThanOrEqual(ranked[1].accuracy);
    expect(ranked[1].accuracy).toBeGreaterThanOrEqual(ranked[2].accuracy);
  });
});
