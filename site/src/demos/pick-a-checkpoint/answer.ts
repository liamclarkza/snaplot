/**
 * "Which checkpoint should we ship?" — the computed answer (plan §10.2, R1).
 *
 * Pure functions of the training logs in `site/public/data/pick-a-checkpoint/{val,train}.csv`:
 * - the checkpoint to ship is the epoch with the lowest validation loss over both runs (ties:
 *   the earlier epoch, then the first run);
 * - a run overfits when its validation loss at the last epoch is at least 5% above its own
 *   minimum; the rise is reported from that minimum to the last epoch.
 * - M16b adds the other criterion the page offers: the epoch with the highest validation
 *   accuracy (ties: the earlier epoch, then the first run).
 */

export interface EpochRow {
  run: string;
  epoch: number;
  step: number;
  valLoss: number;
  /** Fraction correct, 0–1. */
  valAcc: number;
  valCorrect: number;
}

export interface StepRow {
  run: string;
  step: number;
  /** Fractional epoch (step / steps per epoch). */
  epoch: number;
  trainLoss: number;
}

export const OVERFIT_RISE = 0.05;

function parse(csv: string, expected: string): string[][] {
  const lines = csv.trim().split('\n');
  if (lines[0] !== expected) throw new Error(`unexpected header: ${lines[0]}`);
  return lines.slice(1).map((l) => l.split(','));
}

export function parseVal(csv: string): EpochRow[] {
  return parse(csv, 'run,epoch,step,valLoss,valAcc,valCorrect').map((f) => ({
    run: f[0],
    epoch: Number(f[1]),
    step: Number(f[2]),
    valLoss: Number(f[3]),
    valAcc: Number(f[4]),
    valCorrect: Number(f[5]),
  }));
}

export function parseTrain(csv: string): StepRow[] {
  return parse(csv, 'run,step,epoch,trainLoss').map((f) => ({
    run: f[0],
    step: Number(f[1]),
    epoch: Number(f[2]),
    trainLoss: Number(f[3]),
  }));
}

export interface RunSummary {
  run: string;
  /** The epoch with the lowest validation loss. */
  best: EpochRow;
  /** The epoch with the highest validation accuracy. */
  bestAcc: EpochRow;
  last: EpochRow;
  /** (last − best) / best validation loss. */
  rise: number;
  overfits: boolean;
}

/** One summary per run, in first-seen order. */
export function summarizeRuns(rows: readonly EpochRow[]): RunSummary[] {
  const runs = [...new Set(rows.map((r) => r.run))];
  return runs.map((run) => {
    const own = rows.filter((r) => r.run === run).sort((a, b) => a.epoch - b.epoch);
    let best = own[0];
    for (const r of own) if (r.valLoss < best.valLoss) best = r;
    let bestAcc = own[0];
    for (const r of own) if (r.valAcc > bestAcc.valAcc) bestAcc = r;
    const last = own[own.length - 1];
    const rise = (last.valLoss - best.valLoss) / best.valLoss;
    // 1e-12 absorbs float error, so an exact +5% (0.21 over 0.2) counts.
    const overfits = last.epoch > best.epoch && rise + 1e-12 >= OVERFIT_RISE;
    return { run, best, bestAcc, last, rise, overfits };
  });
}

/** What "best" means: the lowest validation loss or the highest validation accuracy. */
export type Criterion = 'valLoss' | 'valAcc';

export interface Decision {
  by: Criterion;
  ship: EpochRow;
  runs: RunSummary[];
}

export function decide(rows: readonly EpochRow[], by: Criterion = 'valLoss'): Decision {
  if (rows.length === 0) throw new Error('no validation rows');
  const runs = summarizeRuns(rows);
  const pick = (r: RunSummary) => (by === 'valLoss' ? r.best : r.bestAcc);
  // A positive score is better: lower loss, higher accuracy.
  const score = (r: EpochRow) => (by === 'valLoss' ? -r.valLoss : r.valAcc);
  let ship = pick(runs[0]);
  for (const r of runs) {
    const b = pick(r);
    if (score(b) > score(ship) || (score(b) === score(ship) && b.epoch < ship.epoch)) ship = b;
  }
  return { by, ship, runs };
}

export const pct = (fraction: number, digits = 1): string => `${(fraction * 100).toFixed(digits)}%`;

/** The decision panel's sentences: the checkpoint, then the overfitting verdict. */
export function headline(d: Decision): string[] {
  const { ship } = d;
  const out = [
    `Ship run ${ship.run} at epoch ${ship.epoch}: validation loss ${ship.valLoss.toFixed(4)}, accuracy ${pct(ship.valAcc)}.`,
  ];
  const over = d.runs.filter((r) => r.overfits);
  if (over.length === 0) {
    const epochs = Math.max(...d.runs.map((r) => r.last.epoch));
    out.push(`${d.runs.length === 2 ? 'Neither run' : 'No run'} overfits within ${epochs} epochs.`);
  }
  for (const r of over) {
    out.push(
      `Run ${r.run} overfits after epoch ${r.best.epoch} (+${pct(r.rise)} from its minimum).`,
    );
  }
  return out;
}

/**
 * The checkpoint the other criterion would ship, when it differs: the decision depends on what
 * the model is judged by, and the panel says so.
 */
export function otherPick(rows: readonly EpochRow[], by: Criterion): string | null {
  const other: Criterion = by === 'valLoss' ? 'valAcc' : 'valLoss';
  const mine = decide(rows, by).ship;
  const theirs = decide(rows, other).ship;
  if (mine.run === theirs.run && mine.epoch === theirs.epoch) return null;
  const metric =
    other === 'valAcc'
      ? `accuracy ${pct(theirs.valAcc)}`
      : `validation loss ${theirs.valLoss.toFixed(4)}`;
  const label = other === 'valAcc' ? 'highest accuracy' : 'lowest validation loss';
  return `By ${label} instead, it would be run ${theirs.run} at epoch ${theirs.epoch} (${metric}).`;
}

/**
 * TensorBoard's smoothing: an exponential moving average with weight `w` (0 = raw), debiased so
 * the first points are not pulled towards 0.
 */
export function smooth(values: readonly number[], w: number): number[] {
  if (w <= 0) return [...values];
  let last = 0;
  return values.map((v, i) => {
    last = last * w + (1 - w) * v;
    return last / (1 - w ** (i + 1));
  });
}
