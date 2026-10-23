// R1 `pick-a-checkpoint`: real training logs of a small MLP on handwritten digits (plan §10.2).
//
//   npm run demo-data -- pick-a-checkpoint [--offline] [--fallback]
//
// Input: UCI "Optical Recognition of Handwritten Digits" (CC BY 4.0), `optdigits.tra` (3,823
// rows) for training and `optdigits.tes` (1,797 rows) for validation, read from the UCI zip.
// Fallback (`--fallback`, or when UCI fails 3 times): scikit-learn's `digits.csv.gz` (BSD-3),
// which is the 1,797-row UCI test split, divided 70/30 by a seeded shuffle.
//
// Model: a seeded 64-32-10 MLP (ReLU, softmax, cross-entropy), plain mini-batch SGD with batch
// size 4, 60 epochs, identical initial weights and shuffles for both runs:
// - run A, baseline: constant LR 0.05, no regularisation;
// - run B, regularised: cosine LR 0.1 → 0, L2 1e-4 on weights, label smoothing 0.1.
// Logs: training cross-entropy every 20 steps (the mean of those 20 mini-batches) and
// validation cross-entropy and accuracy after each epoch. Both losses are plain cross-entropy
// against the true label, so the runs are comparable (run B optimises the smoothed loss).
// Outputs: site/public/data/pick-a-checkpoint/{train.csv, val.csv, runs.json, SOURCE.md} and the
// docs slice site/src/examples/data/training.ts.

import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
  DATA,
  SLICES,
  biomeFormat,
  csvLine,
  log,
  mulberry32,
  openCache,
  parseArgs,
  rel,
  renderSourceMd,
  retrievalDate,
  round,
  sizeOf,
  writeOut,
  readZip,
} from './lib.mjs';

export const SLUG = 'pick-a-checkpoint';
const UCI_URL =
  'https://archive.ics.uci.edu/static/public/80/optical+recognition+of+handwritten+digits.zip';
const SKLEARN_URL =
  'https://raw.githubusercontent.com/scikit-learn/scikit-learn/1.5.2/sklearn/datasets/data/digits.csv.gz';
const SEED = 482;
const EPOCHS = 60;
const BATCH = 4;
const HIDDEN = 32;
const LOG_EVERY = 20;
export const RUNS = [
  { id: 'A', name: 'baseline', lr: 0.05, schedule: 'constant', l2: 0, labelSmoothing: 0 },
  { id: 'B', name: 'regularised', lr: 0.1, schedule: 'cosine', l2: 1e-4, labelSmoothing: 0.1 },
];

const parseRows = (text) =>
  text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(',').map(Number));

/** Train one run; returns the step and epoch logs. Pure: same inputs, same numbers. */
export function train(run, trainSet, valSet) {
  const I = 64;
  const H = HIDDEN;
  const O = 10;
  const rng = mulberry32(SEED);
  const W1 = new Float64Array(H * I);
  const b1 = new Float64Array(H);
  const W2 = new Float64Array(O * H);
  const b2 = new Float64Array(O);
  const lim1 = Math.sqrt(6 / I); // He-uniform for the ReLU layer
  const lim2 = Math.sqrt(6 / (H + O)); // Glorot-uniform for the softmax layer
  for (let i = 0; i < W1.length; i++) W1[i] = (rng() * 2 - 1) * lim1;
  for (let i = 0; i < W2.length; i++) W2[i] = (rng() * 2 - 1) * lim2;

  const h = new Float64Array(H);
  const p = new Float64Array(O);
  const forward = (row) => {
    for (let j = 0; j < H; j++) {
      let s = b1[j];
      for (let k = 0; k < I; k++) s += (W1[j * I + k] * row[k]) / 16;
      h[j] = s > 0 ? s : 0;
    }
    let max = -Infinity;
    for (let o = 0; o < O; o++) {
      let s = b2[o];
      for (let j = 0; j < H; j++) s += W2[o * H + j] * h[j];
      p[o] = s;
      if (s > max) max = s;
    }
    let sum = 0;
    for (let o = 0; o < O; o++) sum += p[o] = Math.exp(p[o] - max);
    for (let o = 0; o < O; o++) p[o] /= sum;
  };

  const N = trainSet.length;
  const stepsPerEpoch = Math.ceil(N / BATCH);
  const totalSteps = stepsPerEpoch * EPOCHS;
  const order = Array.from({ length: N }, (_, i) => i);
  const gW1 = new Float64Array(W1.length);
  const gb1 = new Float64Array(H);
  const gW2 = new Float64Array(W2.length);
  const gb2 = new Float64Array(O);
  const dz = new Float64Array(O);
  const steps = [];
  const epochs = [];
  let step = 0;
  let window = 0;
  for (let epoch = 1; epoch <= EPOCHS; epoch++) {
    const shuffle = mulberry32(SEED * 1000 + epoch); // the same order for both runs
    for (let i = N - 1; i > 0; i--) {
      const j = Math.floor(shuffle() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (let s = 0; s < stepsPerEpoch; s++) {
      gW1.fill(0);
      gb1.fill(0);
      gW2.fill(0);
      gb2.fill(0);
      const batch = order.slice(s * BATCH, (s + 1) * BATCH);
      let batchLoss = 0;
      for (const idx of batch) {
        const row = trainSet[idx];
        const label = row[64];
        forward(row);
        batchLoss -= Math.log(p[label]);
        for (let o = 0; o < O; o++) {
          const target = (o === label ? 1 - run.labelSmoothing : 0) + run.labelSmoothing / O;
          dz[o] = p[o] - target;
          gb2[o] += dz[o];
          for (let j = 0; j < H; j++) gW2[o * H + j] += dz[o] * h[j];
        }
        for (let j = 0; j < H; j++) {
          if (h[j] <= 0) continue;
          let back = 0;
          for (let o = 0; o < O; o++) back += W2[o * H + j] * dz[o];
          gb1[j] += back;
          for (let k = 0; k < I; k++) gW1[j * I + k] += (back * row[k]) / 16;
        }
      }
      const lr =
        run.schedule === 'cosine'
          ? run.lr * 0.5 * (1 + Math.cos((Math.PI * step) / totalSteps))
          : run.lr;
      const n = batch.length;
      for (let i = 0; i < W1.length; i++) W1[i] -= lr * (gW1[i] / n + run.l2 * W1[i]);
      for (let i = 0; i < W2.length; i++) W2[i] -= lr * (gW2[i] / n + run.l2 * W2[i]);
      for (let i = 0; i < H; i++) b1[i] -= (lr * gb1[i]) / n;
      for (let i = 0; i < O; i++) b2[i] -= (lr * gb2[i]) / n;
      step++;
      window += batchLoss / n;
      if (step % LOG_EVERY === 0) {
        steps.push({ step, epoch: step / stepsPerEpoch, loss: window / LOG_EVERY });
        window = 0;
      }
    }
    let loss = 0;
    let correct = 0;
    for (const row of valSet) {
      forward(row);
      loss -= Math.log(p[row[64]]);
      let best = 0;
      for (let o = 1; o < O; o++) if (p[o] > p[best]) best = o;
      if (best === row[64]) correct++;
    }
    epochs.push({ epoch, step, loss: loss / valSet.length, correct, total: valSet.length });
  }
  return { steps, epochs, stepsPerEpoch };
}

async function loadInput(cache, { fallback }) {
  if (!fallback) {
    try {
      const zip = readZip(
        await cache.get('optical+recognition+of+handwritten+digits.zip', UCI_URL),
      );
      return {
        source: 'uci',
        trainSet: parseRows(zip.get('optdigits.tra').toString('utf8')),
        valSet: parseRows(zip.get('optdigits.tes').toString('utf8')),
      };
    } catch (error) {
      if (error.name !== 'DownloadFailed') throw error;
      log(`  NOTE: ${error.message}; using the scikit-learn fallback`);
    }
  }
  // scikit-learn digits.csv.gz: 1,797 rows of 64 pixels (0–16) and a label; a seeded 70/30 split.
  const rows = parseRows(
    gunzipSync(await cache.get('digits.csv.gz', SKLEARN_URL)).toString('utf8'),
  );
  const rng = mulberry32(SEED);
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  const cut = Math.round(rows.length * 0.7);
  return { source: 'sklearn', trainSet: rows.slice(0, cut), valSet: rows.slice(cut) };
}

async function main() {
  const args = parseArgs();
  const cache = openCache(SLUG, args);
  const fallback = args.fallback || (args.offline && cache.extra.source === 'sklearn');
  log(`${SLUG}${args.offline ? ' (offline)' : ''}${fallback ? ' (fallback)' : ''}`);
  const { source, trainSet, valSet } = await loadInput(cache, { fallback });
  cache.extra.source = source;
  cache.save();
  for (const row of [...trainSet, ...valSet]) {
    if (row.length !== 65 || row.some((v) => !Number.isInteger(v))) {
      throw new Error('unexpected digits row shape');
    }
  }

  const results = RUNS.map((run) => ({ run, ...train(run, trainSet, valSet) }));
  const trainLines = [csvLine(['run', 'step', 'epoch', 'trainLoss'])];
  const valLines = [csvLine(['run', 'epoch', 'step', 'valLoss', 'valAcc', 'valCorrect'])];
  for (const { run, steps, epochs } of results) {
    for (const s of steps)
      trainLines.push(csvLine([run.id, s.step, round(s.epoch, 4), round(s.loss, 5)]));
    for (const e of epochs) {
      valLines.push(
        csvLine([
          run.id,
          e.epoch,
          e.step,
          round(e.loss, 5),
          round(e.correct / e.total, 5),
          e.correct,
        ]),
      );
    }
  }
  const outDir = join(DATA, SLUG);
  const trainPath = writeOut(join(outDir, 'train.csv'), `${trainLines.join('\n')}\n`);
  const valPath = writeOut(join(outDir, 'val.csv'), `${valLines.join('\n')}\n`);
  const stepsPerEpoch = results[0].stepsPerEpoch;
  const runsPath = writeOut(
    join(outDir, 'runs.json'),
    `${JSON.stringify({
      model: `MLP 64-${HIDDEN}-10, ReLU, softmax; inputs scaled to [0, 1]`,
      optimiser: `mini-batch SGD, batch ${BATCH}, no momentum`,
      epochs: EPOCHS,
      stepsPerEpoch,
      logEvery: LOG_EVERY,
      seed: SEED,
      trainRows: trainSet.length,
      valRows: valSet.length,
      input: source === 'uci' ? 'UCI optdigits.tra / optdigits.tes' : 'scikit-learn digits.csv.gz',
      runs: RUNS,
    })}\n`,
  );

  // Docs slice: per-epoch validation for both runs, and train loss every half epoch (≤ 20 KB).
  const [a, b] = results;
  const every = Math.round(stepsPerEpoch / 2 / LOG_EVERY); // about every half epoch
  const ta = a.steps.filter((_, i) => i % every === every - 1);
  const tb = b.steps.filter((_, i) => i % every === every - 1);
  const slicePath = join(SLICES, 'training.ts');
  writeOut(
    slicePath,
    [
      '// Generated by `npm run demo-data -- pick-a-checkpoint`; do not edit.',
      '// Real training logs: a seeded 64-32-10 MLP trained in scripts/demo-data/train-digits.mjs on the',
      '// UCI "Optical Recognition of Handwritten Digits" dataset (Alpaydin and Kaynak, 1998; CC BY 4.0,',
      '// doi:10.24432/C50P49). Logs are MIT. Full logs and SOURCE.md: site/public/data/pick-a-checkpoint/.',
      '',
      '/** Validation after each epoch: run A (baseline) and run B (regularised). */',
      'export interface EpochRow {',
      '  epoch: number;',
      '  baselineLoss: number;',
      '  regularisedLoss: number;',
      '  /** Fraction of the 1,797 validation digits classified correctly. */',
      '  baselineAccuracy: number;',
      '  regularisedAccuracy: number;',
      '}',
      '',
      '/** Training cross-entropy (mean of the last 20 mini-batches), about every half epoch. */',
      'export interface StepRow {',
      '  step: number;',
      '  baseline: number;',
      '  regularised: number;',
      '}',
      '',
      `export const validation: EpochRow[] = ${JSON.stringify(
        a.epochs.map((e, i) => ({
          epoch: e.epoch,
          baselineLoss: round(e.loss, 4),
          regularisedLoss: round(b.epochs[i].loss, 4),
          baselineAccuracy: round(e.correct / e.total, 4),
          regularisedAccuracy: round(b.epochs[i].correct / b.epochs[i].total, 4),
        })),
      )};`,
      '',
      `export const trainLoss: StepRow[] = ${JSON.stringify(
        ta.map((s, i) => ({
          step: s.step,
          baseline: round(s.loss, 4),
          regularised: round(tb[i].loss, 4),
        })),
      )};`,
      '',
    ].join('\n'),
  );
  biomeFormat([runsPath, slicePath]);

  const raw = Object.entries(cache.files).map(([name, f]) => ({ name, ...f }));
  const best = (r) => r.epochs.reduce((m, e) => (e.loss < m.loss ? e : m));
  const uci = source === 'uci';
  const md = renderSourceMd({
    title: 'Pick a checkpoint: data source',
    slug: SLUG,
    summary:
      'Real training logs of two runs of a small neural network classifying 8 × 8 handwritten digits, produced by the generator from a public dataset.',
    urls: uci
      ? [
          `Input: ${UCI_URL}`,
          'Dataset page: https://archive.ics.uci.edu/dataset/80/optical+recognition+of+handwritten+digits',
          `Fallback input (not used): ${SKLEARN_URL}`,
        ]
      : [`Input (fallback): ${SKLEARN_URL}`, `Primary input (failed): ${UCI_URL}`],
    licence: uci ? 'CC BY 4.0 (input); MIT (logs)' : 'BSD-3-Clause (input); MIT (logs)',
    licenceEvidence: uci
      ? [
          'The UCI Machine Learning Repository page for dataset 80 states: "This dataset is licensed under a Creative Commons Attribution 4.0 International (CC BY 4.0) license."',
          'The training logs are produced by `scripts/demo-data/train-digits.mjs` in this repository and are MIT, like the repository.',
        ]
      : [
          'scikit-learn is BSD-3-Clause (https://github.com/scikit-learn/scikit-learn/blob/main/COPYING); `digits.csv.gz` ships in its source tree.',
          'The training logs are produced by `scripts/demo-data/train-digits.mjs` in this repository and are MIT, like the repository.',
        ],
    attribution: uci
      ? 'E. Alpaydin and C. Kaynak, Optical Recognition of Handwritten Digits, UCI Machine Learning Repository, doi:10.24432/C50P49'
      : 'scikit-learn digits dataset (from UCI Optical Recognition of Handwritten Digits)',
    retrieved: retrievalDate(cache.files),
    regenerate: [
      `npm run demo-data -- ${SLUG}            # download into scripts/demo-data/.cache/${SLUG}/ and train`,
      `npm run demo-data -- ${SLUG} --offline  # retrain from that cache (about 5 s)`,
    ],
    rows: [
      `Input: ${trainSet.length} training rows and ${valSet.length} validation rows of 64 pixel counts (0–16) and a label.`,
      `\`train.csv\`: ${trainLines.length - 1} rows (${a.steps.length} per run, every ${LOG_EVERY} of ${stepsPerEpoch * EPOCHS} steps).`,
      `\`val.csv\`: ${valLines.length - 1} rows (${EPOCHS} epochs per run).`,
    ],
    files: sizeOf([trainPath, valPath, runsPath]),
    raw,
    processing: [
      `Model: MLP 64-${HIDDEN}-10 with ReLU and softmax; inputs divided by 16. Weights He-uniform (layer 1) and Glorot-uniform (layer 2) from mulberry32 seed ${SEED}; biases 0.`,
      `Optimiser: plain mini-batch SGD, batch ${BATCH}, ${stepsPerEpoch} steps per epoch, ${EPOCHS} epochs. Both runs use the same initial weights and the same per-epoch shuffles.`,
      'Run A (baseline): constant learning rate 0.05, no regularisation. Run B (regularised): cosine learning rate 0.1 → 0 over all steps, L2 1e-4 on weights (added to the gradient), label smoothing 0.1.',
      `\`trainLoss\`: mean cross-entropy of the last ${LOG_EVERY} mini-batches, logged at every ${LOG_EVERY}th step; \`epoch\` = step / ${stepsPerEpoch}.`,
      '`valLoss`: mean cross-entropy on the validation rows after the epoch; `valAcc` = `valCorrect` / rows. Both runs report plain cross-entropy against the true label (run B trains on the smoothed target, which raises its cross-entropy floor).',
    ],
    oracle: [
      ...results.map(
        ({ run, epochs }) =>
          `Run ${run.id} minimum validation loss: **${round(best({ epochs }).loss, 5)}** at epoch ${best({ epochs }).epoch} (accuracy ${round(best({ epochs }).correct / best({ epochs }).total, 5)}); epoch ${EPOCHS}: ${round(epochs.at(-1).loss, 5)}.`,
      ),
      '`answer.test.ts` runs an independent argmin over the committed `val.csv` (it does not import `answer.ts`) and requires the same run and epoch.',
    ],
    reference:
      'TensorBoard and Weights & Biases run comparison: cool-neutral tool chrome `#F1F3F5` with white chart panels, two run colours (`#1F4FB0`, `#D2492A`) used across charts, table and chips, charts two-thirds and the decision panel one-third, Roboto.',
    notes: uci
      ? []
      : [
          `NOTE: the UCI download failed 3 times, so this build uses the plan §10.2 fallback (scikit-learn digits, seeded 70/30 split). Regenerate with \`npm run demo-data -- ${SLUG}\` once UCI is reachable.`,
        ],
  });
  writeOut(join(outDir, 'SOURCE.md'), md);
  log(`  wrote ${rel(trainPath)}, ${rel(valPath)}, ${rel(slicePath)}`);
}

await main();
