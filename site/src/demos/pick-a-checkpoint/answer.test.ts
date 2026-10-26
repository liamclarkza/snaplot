import { describe, expect, it } from 'vitest';
import runsJson from '../../../public/data/pick-a-checkpoint/runs.json?raw';
import trainCsv from '../../../public/data/pick-a-checkpoint/train.csv?raw';
import valCsv from '../../../public/data/pick-a-checkpoint/val.csv?raw';
import {
  type EpochRow,
  decide,
  headline,
  otherPick,
  parseTrain,
  parseVal,
  smooth,
  summarizeRuns,
} from './answer';

const val = parseVal(valCsv);
const meta = JSON.parse(runsJson) as { epochs: number; stepsPerEpoch: number; logEvery: number };

describe('[pick-a-checkpoint] answer', () => {
  it('oracle: an independent argmin over the committed CSV picks the same checkpoint (no answer.ts)', () => {
    const lines = valCsv.trim().split('\n');
    const header = lines[0].split(',');
    const [iRun, iEpoch, iLoss, iAcc] = ['run', 'epoch', 'valLoss', 'valAcc'].map((k) =>
      header.indexOf(k),
    );
    let best: string[] | undefined;
    for (const line of lines.slice(1)) {
      const f = line.split(',');
      if (best === undefined || Number.parseFloat(f[iLoss]) < Number.parseFloat(best[iLoss])) {
        best = f;
      }
    }
    if (!best) throw new Error('empty val.csv');
    const { ship } = decide(val);
    expect(ship.run).toBe(best[iRun]);
    expect(ship.epoch).toBe(Number(best[iEpoch]));
    expect(ship.valLoss).toBe(Number(best[iLoss]));
    expect(ship.valAcc).toBe(Number(best[iAcc]));
  });

  it('oracle: an independent argmax of accuracy over the committed CSV (no answer.ts)', () => {
    const lines = valCsv.trim().split('\n');
    const header = lines[0].split(',');
    const [iRun, iEpoch, iAcc] = ['run', 'epoch', 'valAcc'].map((k) => header.indexOf(k));
    const runOrder = [...new Set(lines.slice(1).map((l) => l.split(',')[iRun]))];
    // Highest accuracy; ties go to the earlier epoch, then to the first run.
    const [best] = lines
      .slice(1)
      .map((l) => l.split(','))
      .sort(
        (a, b) =>
          Number(b[iAcc]) - Number(a[iAcc]) ||
          Number(a[iEpoch]) - Number(b[iEpoch]) ||
          runOrder.indexOf(a[iRun]) - runOrder.indexOf(b[iRun]),
      );
    const { ship } = decide(val, 'valAcc');
    expect(ship.run).toBe(best[iRun]);
    expect(ship.epoch).toBe(Number(best[iEpoch]));
    expect(ship.valAcc).toBe(Number(best[iAcc]));
  });

  it('says which checkpoint the other criterion would ship', () => {
    expect(headline(decide(val, 'valAcc'))[0]).toBe(
      'Ship run B at epoch 29: validation loss 0.2317, accuracy 97.7%.',
    );
    expect(otherPick(val, 'valLoss')).toBe(
      'By highest accuracy instead, it would be run B at epoch 29 (accuracy 97.7%).',
    );
    expect(otherPick(val, 'valAcc')).toBe(
      'By lowest validation loss instead, it would be run A at epoch 11 (validation loss 0.1241).',
    );
    // The overfitting verdict is about loss whichever criterion picks the checkpoint.
    expect(headline(decide(val, 'valAcc'))[1]).toBe(
      'Run A overfits after epoch 11 (+37.1% from its minimum).',
    );
  });

  it('states the answer', () => {
    expect(headline(decide(val))).toEqual([
      'Ship run A at epoch 11: validation loss 0.1241, accuracy 95.7%.',
      'Run A overfits after epoch 11 (+37.1% from its minimum).',
    ]);
  });

  it('summarises both runs from the logs', () => {
    const [a, b] = summarizeRuns(val);
    expect(a.run).toBe('A');
    expect(b.run).toBe('B');
    expect(a.last.epoch).toBe(meta.epochs);
    expect(a.overfits).toBe(true);
    expect(b.overfits).toBe(false);
    expect(b.rise).toBeLessThan(0.05);
    // The regularised run trades a higher cross-entropy floor (label smoothing) for accuracy.
    expect(b.best.valAcc).toBeGreaterThan(a.best.valAcc);
  });

  it('keeps per-series gaps: validation at epoch ends, training every 20 steps', () => {
    const train = parseTrain(trainCsv);
    expect(train.filter((r) => r.run === 'A')).toHaveLength(
      (meta.epochs * meta.stepsPerEpoch) / meta.logEvery,
    );
    expect(train.every((r) => r.step % meta.logEvery === 0 && r.trainLoss > 0)).toBe(true);
    expect(val.every((r) => r.step === r.epoch * meta.stepsPerEpoch)).toBe(true);
    expect(val.every((r) => r.valCorrect / 1797 - r.valAcc < 1e-5)).toBe(true);
  });

  it('says when neither run overfits, and breaks ties by the earlier epoch', () => {
    const rows = (run: string, losses: number[]): EpochRow[] =>
      losses.map((valLoss, i) => ({
        run,
        epoch: i + 1,
        step: (i + 1) * 10,
        valLoss,
        valAcc: 0.9,
        valCorrect: 0,
      }));
    const flat = [...rows('A', [0.5, 0.3, 0.31]), ...rows('B', [0.6, 0.3, 0.3])];
    const d = decide(flat);
    expect(d.ship.run).toBe('A');
    expect(d.ship.epoch).toBe(2);
    expect(headline(d)).toEqual([
      'Ship run A at epoch 2: validation loss 0.3000, accuracy 90.0%.',
      'Neither run overfits within 3 epochs.',
    ]);
    // The criteria agree here: no other pick to name.
    const agree = [...rows('A', [0.5, 0.3, 0.31]), ...rows('B', [0.6, 0.4, 0.45])];
    agree[1] = { ...agree[1], valAcc: 0.95 };
    expect(decide(agree, 'valAcc').ship).toMatchObject({ run: 'A', epoch: 2 });
    expect(otherPick(agree, 'valLoss')).toBeNull();
    // Accuracy ties go to the earlier epoch.
    expect(decide(flat, 'valAcc').ship).toMatchObject({ run: 'A', epoch: 1 });
    // A minimum on the last epoch is never "overfitting", whatever came before.
    expect(summarizeRuns(rows('C', [0.4, 0.5, 0.2]))[0].overfits).toBe(false);
    // Exactly +5% at the last epoch counts.
    expect(summarizeRuns(rows('D', [0.2, 0.21]))[0].overfits).toBe(true);
  });

  it('smooths like TensorBoard', () => {
    expect(smooth([1, 2, 3], 0)).toEqual([1, 2, 3]);
    expect(smooth([4, 4, 4], 0.9)).toEqual([4, 4, 4].map(() => expect.closeTo(4, 12)));
    const [first, second] = smooth([1, 2], 0.6);
    expect(first).toBeCloseTo(1, 12);
    // (0.6 · 0.4 + 0.4 · 2) / (1 − 0.6²) = 1.04 / 0.64
    expect(second).toBeCloseTo(1.625, 12);
  });
});
