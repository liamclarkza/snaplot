/**
 * The two runs' logs, fetched from site/public/data/pick-a-checkpoint/ and shaped for the charts:
 * per-run columns for the training loss (every 20 steps) and per-run rows for the validation
 * metrics (once per epoch). Each run is its own source, so the charts never see gaps.
 */
import type { ColumnData } from 'snaplot';
import { type EpochRow, parseTrain, parseVal, smooth } from './answer';

export interface RunInfo {
  id: string;
  name: string;
  lr: number;
  schedule: 'constant' | 'cosine';
  l2: number;
  labelSmoothing: number;
}

export interface Logs {
  runs: RunInfo[];
  epochs: number;
  valRows: number;
  trainRows: number;
  /** Training loss per run: `epoch` (fractional) and `loss` columns. */
  train: Map<string, { epoch: Float64Array; loss: Float64Array }>;
  /** Validation rows per run, by epoch. */
  val: Map<string, EpochRow[]>;
  /** Every validation row, in file order (the answer's input). */
  allVal: EpochRow[];
}

export async function loadLogs(base: string): Promise<Logs> {
  const get = async (file: string) => {
    const response = await fetch(`${base}data/pick-a-checkpoint/${file}`);
    if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
    return response.text();
  };
  const [trainCsv, valCsv, runsJson] = await Promise.all([
    get('train.csv'),
    get('val.csv'),
    get('runs.json'),
  ]);
  const meta = JSON.parse(runsJson) as {
    runs: RunInfo[];
    epochs: number;
    trainRows: number;
    valRows: number;
  };
  const allVal = parseVal(valCsv);
  const steps = parseTrain(trainCsv);
  const train = new Map<string, { epoch: Float64Array; loss: Float64Array }>();
  const val = new Map<string, EpochRow[]>();
  for (const run of meta.runs) {
    const own = steps.filter((s) => s.run === run.id);
    train.set(run.id, {
      epoch: Float64Array.from(own, (s) => s.epoch),
      loss: Float64Array.from(own, (s) => s.trainLoss),
    });
    val.set(
      run.id,
      allVal.filter((r) => r.run === run.id),
    );
  }
  return { ...meta, train, val, allVal };
}

/** One run's training loss as chart columns, smoothed with weight `w` (0 = raw). */
export function trainColumns(
  logs: Logs,
  run: string,
  w: number,
): ColumnData & { columns: { epoch: Float64Array; loss: Float64Array } } {
  const own = logs.train.get(run);
  if (!own) throw new Error(`no training log for run ${run}`);
  const loss = w > 0 ? Float64Array.from(smooth(Array.from(own.loss), w)) : own.loss;
  return { columns: { epoch: own.epoch, loss } };
}

/** The run's settings in a line, as a run table lists them. */
export function describeRun(run: RunInfo): string {
  const lr =
    run.schedule === 'cosine' ? `lr ${run.lr} → 0, cosine` : `lr ${run.lr}, ${run.schedule}`;
  const extras = [
    run.l2 > 0 ? `L2 ${run.l2.toExponential(0).replace('e-', 'e−')}` : '',
    run.labelSmoothing > 0 ? `label smoothing ${run.labelSmoothing}` : '',
  ].filter(Boolean);
  return [lr, ...extras].join(' · ');
}
