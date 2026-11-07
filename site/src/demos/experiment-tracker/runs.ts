/**
 * The simulated project the tracker shows: five pretraining runs of 3,000 steps, seeded, so the
 * page is the same on every load. Every page that shows it labels it "Simulated".
 *
 * Model: a learning rate that warms up for 200 steps and decays on a cosine to a tenth of its
 * peak; a training loss that falls with the learning rate spent so far, with per-step noise that
 * a larger batch halves; an evaluation every 100 steps, a little above the training loss. The
 * run at 6e-4 is too hot: from step 2,300 its gradient norm jumps and its loss climbs, and from
 * step 2,640 its training loss is NaN.
 */

/** One run: its id, how long ago it started, how it ended and its hyperparameters. */
export interface Run {
  id: string;
  age: string;
  state: 'finished' | 'failed';
  params: { lr: number; batch: number; optimizer: string; warmup: number };
}

export const RUNS: readonly Run[] = [
  {
    id: 'baseline',
    age: '1d',
    state: 'finished',
    params: { lr: 1.2e-4, batch: 512, optimizer: 'adamw', warmup: 200 },
  },
  {
    id: 'lr-1e-4',
    age: '1d',
    state: 'finished',
    params: { lr: 1e-4, batch: 512, optimizer: 'adamw', warmup: 200 },
  },
  {
    id: 'lr-6e-4',
    age: '1d',
    state: 'failed',
    params: { lr: 6e-4, batch: 512, optimizer: 'adamw', warmup: 200 },
  },
  {
    id: 'batch-2x',
    age: '20h',
    state: 'finished',
    params: { lr: 1.7e-4, batch: 1024, optimizer: 'adamw', warmup: 200 },
  },
  {
    id: 'lion',
    age: '9h',
    state: 'finished',
    params: { lr: 3e-5, batch: 512, optimizer: 'lion', warmup: 200 },
  },
];

/** The run colours: snaplot's colour-blind-safe dark palette, a run keeping its place. */
export const COLORS: Readonly<Record<string, string>> = Object.fromEntries(
  RUNS.map((run, i) => [run.id, ['#56b4e9', '#e69f00', '#2ec79b', '#cc79a7', '#f0e442'][i]]),
);

export const STEPS = 3000;
/** The step from which the hot run's training loss is NaN. */
export const DIVERGED_AT = 2640;

export type MetricName = 'eval/acc' | 'eval/loss' | 'train/grad_norm' | 'train/loss' | 'train/lr';
export const METRICS: readonly MetricName[] = [
  'eval/acc',
  'eval/loss',
  'train/grad_norm',
  'train/loss',
  'train/lr',
];

/** mulberry32, seeded per run and metric: the same curves on every load. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(seed: number): () => number {
  const rand = random(seed);
  return () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

/** The learning rate at `step`: a linear warmup, then a cosine down to a tenth of the peak. */
export function learningRate(run: Run, step: number): number {
  const { lr, warmup } = run.params;
  if (step < warmup) return (lr * (step + 1)) / warmup;
  const progress = (step - warmup) / (STEPS - warmup);
  return lr * (0.1 + 0.45 * (1 + Math.cos(Math.PI * progress)));
}

/** Every logged value of one run: one per step for training, one per 100 steps for evaluation. */
export function simulate(run: Run, index: number): Record<MetricName, Float64Array> {
  const noise = gaussian(index * 7919 + 1);
  const quiet = run.params.batch >= 1024 ? 0.5 : 1;
  // Lion moves further per unit of learning rate than AdamW.
  const reach = run.params.optimizer === 'lion' ? 9 : 1;
  const hot = run.id === 'lr-6e-4';
  const lr = new Float64Array(STEPS);
  const loss = new Float64Array(STEPS);
  const grad = new Float64Array(STEPS);
  let spent = 0;
  for (let step = 0; step < STEPS; step++) {
    lr[step] = learningRate(run, step);
    spent += lr[step] * reach;
    const floor = 0.78 + 0.45 * Math.exp(-spent / 0.4);
    let value = floor + 2.3 * Math.exp(-spent / 0.09);
    let norm = 1 + 0.06 * noise() * quiet;
    if (hot && step >= 2300) {
      value += 0.004 * Math.exp((step - 2300) / 60);
      norm = 1.45 + 0.08 * noise();
    }
    loss[step] = hot && step >= DIVERGED_AT ? Number.NaN : value * (1 + 0.025 * noise() * quiet);
    grad[step] = hot && step >= DIVERGED_AT ? Number.NaN : norm;
  }
  const evals = STEPS / 100;
  const evalLoss = new Float64Array(evals);
  const evalAcc = new Float64Array(evals);
  for (let i = 0; i < evals; i++) {
    const step = (i + 1) * 100 - 1;
    // The mean of the last 100 training losses, a little above them; NaN once training is.
    let sum = 0;
    for (let s = step - 99; s <= step; s++) sum += loss[s];
    const mean = sum / 100 + 0.04;
    evalLoss[i] = mean;
    evalAcc[i] = Number.isFinite(mean) ? 0.86 - 0.21 * mean + 0.004 * noise() : Number.NaN;
  }
  return {
    'train/lr': lr,
    'train/loss': loss,
    'train/grad_norm': grad,
    'eval/loss': evalLoss,
    'eval/acc': evalAcc,
  };
}

/** The steps of a metric's values: every step for training, every 100th for evaluation. */
export function stepsOf(metric: MetricName): number {
  return metric.startsWith('eval/') ? 100 : 1;
}

/**
 * A metric's values in `buckets` buckets of equal width, as the chart rows: `x` the bucket's
 * middle step (an evaluation's own step), and per run its mean (`<run>`), min (`<run>·min`) and max (`<run>·max`) over the
 * bucket's finite values, `null` where it has none. Also the first step at which each run logged
 * a non-finite value.
 */
export function bucketed(
  values: ReadonlyMap<string, Float64Array>,
  metric: MetricName,
  buckets: number,
): { rows: Record<string, number | null>[]; nonFinite: Map<string, number> } {
  const every = stepsOf(metric);
  const width = STEPS / buckets;
  const rows: Record<string, number | null>[] = [];
  const nonFinite = new Map<string, number>();
  for (let b = 0; b < buckets; b++) {
    const lo = b * width;
    const hi = lo + width;
    // A training bucket is placed at its middle step; an evaluation at the step it ran.
    const row: Record<string, number | null> = { x: every > 1 ? hi : Math.round((lo + hi) / 2) };
    let any = false;
    for (const [run, series] of values) {
      let sum = 0;
      let count = 0;
      let min = Infinity;
      let max = -Infinity;
      for (
        let i = Math.ceil((lo + 1) / every) - 1;
        i < series.length && (i + 1) * every <= hi;
        i++
      ) {
        const v = series[i];
        if (!Number.isFinite(v)) {
          // A training value's index is its step; evaluation i ran at step (i + 1) × 100.
          if (!nonFinite.has(run)) nonFinite.set(run, every > 1 ? (i + 1) * every : i);
          continue;
        }
        sum += v;
        count++;
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
      row[run] = count ? sum / count : null;
      row[`${run}·min`] = count ? min : null;
      row[`${run}·max`] = count ? max : null;
      any ||= count > 0;
    }
    if (any) rows.push(row);
  }
  return { rows, nonFinite };
}

/** A value as the tracker writes it: four significant figures, exponents when tiny or huge. */
export function fmt(v: number | null | undefined): string {
  if (v == null) return '–';
  if (!Number.isFinite(v)) return 'NaN';
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e6)) return v.toExponential(2).replace(/\.?0+e/, 'e');
  if (Number.isInteger(v)) return String(v);
  return v.toPrecision(a >= 100 ? 5 : 4).replace(/\.?0+$/, '');
}
