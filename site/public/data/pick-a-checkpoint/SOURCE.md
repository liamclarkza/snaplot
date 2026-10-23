# Pick a checkpoint: data source

Demo `pick-a-checkpoint`. Real training logs of two runs of a small neural network classifying 8 × 8 handwritten digits, produced by the generator from a public dataset.

## Source

- Input: https://archive.ics.uci.edu/static/public/80/optical+recognition+of+handwritten+digits.zip
- Dataset page: https://archive.ics.uci.edu/dataset/80/optical+recognition+of+handwritten+digits
- Fallback input (not used): https://raw.githubusercontent.com/scikit-learn/scikit-learn/1.5.2/sklearn/datasets/data/digits.csv.gz

## Licence

CC BY 4.0 (input); MIT (logs)

- The UCI Machine Learning Repository page for dataset 80 states: "This dataset is licensed under a Creative Commons Attribution 4.0 International (CC BY 4.0) license."
- The training logs are produced by `scripts/demo-data/train-digits.mjs` in this repository and are MIT, like the repository.

## Attribution

E. Alpaydin and C. Kaynak, Optical Recognition of Handwritten Digits, UCI Machine Learning Repository, doi:10.24432/C50P49

## Retrieved

2026-10-23

## Regenerate

```sh
npm run demo-data -- pick-a-checkpoint            # download into scripts/demo-data/.cache/pick-a-checkpoint/ and train
npm run demo-data -- pick-a-checkpoint --offline  # retrain from that cache (about 5 s)
```

## Rows

- Input: 3823 training rows and 1797 validation rows of 64 pixel counts (0–16) and a label.
- `train.csv`: 5736 rows (2868 per run, every 20 of 57360 steps).
- `val.csv`: 120 rows (60 epochs per run).

## Files

| File | Bytes | Gzipped |
|---|---:|---:|
| `site/public/data/pick-a-checkpoint/train.csv` | 134271 | 43.5 KB |
| `site/public/data/pick-a-checkpoint/val.csv` | 3819 | 1.2 KB |
| `site/public/data/pick-a-checkpoint/runs.json` | 599 | 0.3 KB |

## Raw downloads (SHA-256)

| File | URL | Bytes | SHA-256 |
|---|---|---:|---|
| `optical+recognition+of+handwritten+digits.zip` | https://archive.ics.uci.edu/static/public/80/optical+recognition+of+handwritten+digits.zip | 591292 | `0d7b054fea010270e9b3f06411c654c5e59547732ad626381980baffe0a23fb0` |

## Processing

- Model: MLP 64-32-10 with ReLU and softmax; inputs divided by 16. Weights He-uniform (layer 1) and Glorot-uniform (layer 2) from mulberry32 seed 482; biases 0.
- Optimiser: plain mini-batch SGD, batch 4, 956 steps per epoch, 60 epochs. Both runs use the same initial weights and the same per-epoch shuffles.
- Run A (baseline): constant learning rate 0.05, no regularisation. Run B (regularised): cosine learning rate 0.1 → 0 over all steps, L2 1e-4 on weights (added to the gradient), label smoothing 0.1.
- `trainLoss`: mean cross-entropy of the last 20 mini-batches, logged at every 20th step; `epoch` = step / 956.
- `valLoss`: mean cross-entropy on the validation rows after the epoch; `valAcc` = `valCorrect` / rows. Both runs report plain cross-entropy against the true label (run B trains on the smoothed target, which raises its cross-entropy floor).

## Oracle

- Run A minimum validation loss: **0.12412** at epoch 11 (accuracy 0.95715); epoch 60: 0.17012.
- Run B minimum validation loss: **0.21614** at epoch 30 (accuracy 0.96995); epoch 60: 0.22009.
- `answer.test.ts` runs an independent argmin over the committed `val.csv` (it does not import `answer.ts`) and requires the same run and epoch.

## Design reference

TensorBoard and Weights & Biases run comparison: cool-neutral tool chrome `#F1F3F5` with white chart panels, two run colours (`#1F4FB0`, `#D2492A`) used across charts, table and chips, charts two-thirds and the decision panel one-third, Roboto.
