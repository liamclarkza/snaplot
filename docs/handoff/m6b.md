# M6b: Demo datasets, generators and answers

- **Branch:** `ovh/m6b-demo-data` · **Worktree:** `.claude/worktrees/m6b` · **Base:** `16547da` (`overhaul` at
  start, = `ovh-m1-done` plus the M1 handoff)
- **Status:** complete

## Summary

- **Generators** (`scripts/demo-data/`, Node 22, no new dependencies), one per real dataset of plan §10.2, behind
  one dispatcher: `npm run demo-data -- <slug> [--offline] [--fallback]`, `… all`, `… check`.
  - `lib.mjs`: downloads with 3 attempts and exponential backoff (1 s, 2 s), a per-demo raw cache
    (`scripts/demo-data/.cache/<slug>/`, gitignored) whose `manifest.json` records URL, SHA-256, bytes and
    retrieval date of every raw file, `--offline` replay from that cache (hashes verified), a 30-line zip reader
    over `inflateRawSync`, a seeded PRNG, Biome formatting of generated JSON/TS, and one `SOURCE.md` renderer so
    every demo has the same headings.
  - `ridgecrest-aftershocks.mjs`: ComCat `/count`, windows halved until each is under 20,000 events (4 windows),
    CSV per window, de-duplicated by id, `time, lat, lon, depth, mag, id, depthBand`; USGS `/count` M≥2.5 for
    three UTC days as the oracle.
  - `central-park-summer.mjs`: GHCN-Daily USW00094728 → per-day records (1869–2024), 1991–2020 p10/median/p90
    over a ±7-day window, the exact-day 1991–2020 mean, and 2025 June–August; NCEI 1991–2020 monthly normals and
    a separate raw scan as the oracle.
  - `train-digits.mjs` (slug `pick-a-checkpoint`): UCI optdigits from the zip, two seeded 64-32-10 MLP runs in
    plain JS (about 3 s), `train.csv` / `val.csv` / `runs.json`; the scikit-learn fallback is implemented and was
    exercised once with `--fallback`, then the UCI build was restored byte-identically.
  - `battery-payback.mjs`: OPSD 60-minute data; picks the first residential household with PV, import and
    export that has a calendar year with ≥ 98% measured hours (no gap, no negative delta, no OPSD interpolation),
    differences the cumulative meters in whole Wh, asserts the sums equal last − first, and computes the battery
    answer with its own implementation.
  - `find-the-clipping.mjs`: archive.org search (NASA, then LibriVox poetry), licence evidence, MP3 of 60–240 s
    and ≤ 2 MB, decoded lazily one candidate at a time in Playwright's Chromium on an `OfflineAudioContext` at the
    file's own sample rate; bundles the first with ≥ 3 clipped runs and a silence > 2 s, byte-for-byte. It also
    bundles `answer.ts` with esbuild, runs it on the same decode and stops unless it equals the reference scan. The
    synthetic-sweep fallback is implemented and was exercised once with `--fallback`, then restored.
  - `index.mjs check`: SOURCE.md fields and licence (public domain, CC0, CC BY 4.0, MIT or BSD-3; no SA/NC/ND),
    caps (≤ 1 MB gzipped per demo, S1 audio ≤ 2 MB raw, slices ≤ 20 KB with a provenance comment), and, with the
    raw cache, two `--offline` runs per generator that must equal each other and the committed files.
- **Answers** (`site/src/demos/<slug>/answer.ts` + `answer.test.ts`, 6 demos): pure functions shared by the page,
  its readouts and the tests. Each test file has the §10.2 oracle as a check that does not use `answer.ts` code,
  with the oracle values recorded in `SOURCE.md` (and `oracle.json` / `meta.json` / `recording.json`).
- **Simulator** (`site/src/demos/deploy-482/simulator.ts` + `simulator.test.ts`): four M/G/c worker pools with GC
  pauses and a 1 s timeout, #481 benign at t0 + 6 min, #482 adding an N+1 to `/search` at t0 + 18 min,
  `rollback()`, `?seed=` replay, one random stream per endpoint, nearest-rank percentiles by selection. Shared
  with the homepage hero (M16a).
- **Docs data slices** (`site/src/examples/data/`): `aftershocks.ts` (8.2 KB), `central-park.ts` (7.5 KB),
  `training.ts` (15.9 KB), `household.ts` (13.4 KB), `waveform.ts` (9.3 KB), each generated with a provenance
  comment and typed exports.
- **Defects the oracles found in my own generators** (each fixed in its own commit): the V2 recompute caught
  record ties broken in raw tenths of °C instead of the published whole °F (`600aeb5`).

Commits (oldest first):

| SHA | Subject |
|---|---|
| `658ce3d` | feat(demos): reproducible dataset generators and bundled extracts |
| `600aeb5` | fix(demos): break Central Park record ties in published whole °F |
| `75aaac6` | feat(demos): computed answers with independent oracles |
| `6c86e04` | feat(demos): seeded deploy simulator |
| `307df36` | fix(demos): name the digits fallback source in its slice and note |
| `a03f7b8` | fix(demos): record that the household meters never run backwards |
| (tip) | docs(handoff): record the M6b gates |

The three brief subjects are commits 1, 3 and 4; the `fix(demos)` commits are corrections found while testing.

Closes: demos-05 (data side; M16a closes the page side).

### The computed answers (for M16a/b/c)

| Demo | Answer (from the committed data) |
|---|---|
| V1 `ridgecrest-aftershocks` | "Daily M≥2.5 count fell below 10% of its peak (1239) on 8 July, 2 days after the M7.1; half of the 3-month total came in the first 1.9 days." `decay(events, from, to)` gives the brush readout. |
| V2 `central-park-summer` | "8 days between June and August 2025 had highs above the normal range; the mean high was 0.1 °F above the 1991–2020 median." Records: "June 23 tied (96 °F, 1888); June 24 (99 °F; old record 96 °F in 1888)." |
| R1 `pick-a-checkpoint` | "Ship run A at epoch 11: validation loss 0.1241, accuracy 95.7%." / "Run A overfits after epoch 11 (+37.1% from its minimum)." Run B has the better accuracy (97.0% at its best) but a higher cross-entropy floor from label smoothing; the page should say so next to the panel. |
| R2 `battery-payback` | "A 5 kWh battery would have saved €284 in 2017; at €3,500 installed it pays back in 12.3 years." (€284.36 exactly; `battery(kWh)` for the slider.) |
| S1 `find-the-clipping` | "12 clipped runs (samples at or above −0.1 dBFS); the longest is 0.091 ms (4 samples) at 00:35; 5 silences longer than 2 s." |
| S2 `deploy-482` | "p99 on /search rose from 103 ms to 234 ms within 2 min of #482; other endpoints are unchanged, so roll back #482." (seed 482) |

Definitions are in each `answer.ts` header and in the SOURCE.md files: V1 counts M≥2.5 per UTC day, "below 10%"
is the first day after the peak under a tenth of it, "half … in the first X days" runs from the window's first
M≥2.5 event; R1 overfitting is the last epoch ≥ 5% above the run's minimum; S2 compares the median per-second p99
of the 5 minutes before with the 2 minutes after a deploy (moved ≥ ±50%, unchanged within ±20%).

## Gates

`npm run verify` (worktree, at the tip):

```
Checked 180 files in 93ms. No fixes applied.
 Test Files  47 passed (47)
      Tests  519 passed | 1 expected fail (520)
…
dist/createChart-C40ozEdw.js  302.27 kB │ gzip: 80.91 kB │ map: 929.85 kB
[vite:dts] Declaration files built in 1220ms.
✓ built in 1.62s
…
dist/solid.server.js  300.62 kB │ gzip: 81.02 kB │ map: 956.47 kB
✓ built in 394ms
verify exit: 0
```

`git rebase -x` over every commit (7 commits, so required by EXECUTION.md rule 4), with the demo tests and the
data check added because `npm test` does not cover `site/` yet, and a clean-tree check after the data check (so
every commit's committed data equals its own generators' offline output). The base is unchanged, so the SHAs are
too. Tail of the final run:

```
git rebase -x "git diff --quiet HEAD~1 -- package-lock.json || npm ci; npm test >$L 2>&1 && grep -E 'Tests ' $L | tail -1 && npx vitest run --dir site/src/demos --passWithNoTests … && node scripts/demo-data/index.mjs check … && test -z \"\$(git status --porcelain)\" && git log --oneline -1" overhaul
      Tests  519 passed | 1 expected fail (520)
No test files found, exiting with code 0
demo-data check: OK
658ce3d feat(demos): reproducible dataset generators and bundled extracts
      Tests  519 passed | 1 expected fail (520)
No test files found, exiting with code 0
demo-data check: OK
600aeb5 fix(demos): break Central Park record ties in published whole °F
      Tests  519 passed | 1 expected fail (520)
      Tests  37 passed (37)
demo-data check: OK
75aaac6 feat(demos): computed answers with independent oracles
      Tests  519 passed | 1 expected fail (520)
      Tests  53 passed (53)
demo-data check: OK
6c86e04 feat(demos): seeded deploy simulator
      Tests  519 passed | 1 expected fail (520)
      Tests  53 passed (53)
demo-data check: OK
307df36 fix(demos): name the digits fallback source in its slice and note
      Tests  519 passed | 1 expected fail (520)
      Tests  53 passed (53)
demo-data check: OK
a03f7b8 fix(demos): record that the household meters never run backwards
      Tests  519 passed | 1 expected fail (520)
      Tests  53 passed (53)
demo-data check: OK
<tip> docs(handoff): record the M6b gates
Successfully rebased and updated refs/heads/ovh/m6b-demo-data.
```

`node scripts/overhaul/metrics.mjs`: identical to `overhaul` (`16547da`) apart from `generatedAt` and `gitHead`;
M6b touches no library code (`source.files` 69, `physicalLines` 20236, `codeLines` 15381, largest file
`core/Chart.ts` 4525).

Exit 1, "running every generator twice with `--offline` gives identical outputs (hash check)", plus SOURCE.md
fields and caps (`npm run demo-data -- check`):

```
ridgecrest-aftershocks: data 671.6 KB gzipped
  slice aftershocks.ts: 8.2 KB
  ridgecrest-aftershocks: 4 outputs identical across 2 offline runs
central-park-summer: data 7.3 KB gzipped
  slice central-park.ts: 7.5 KB
  central-park-summer: 4 outputs identical across 2 offline runs
pick-a-checkpoint: data 45.1 KB gzipped
  slice training.ts: 15.9 KB
  pick-a-checkpoint: 5 outputs identical across 2 offline runs
battery-payback: data 81.6 KB gzipped
  slice household.ts: 13.4 KB
  battery-payback: 4 outputs identical across 2 offline runs
find-the-clipping: data 0.5 KB gzipped, audio 1227.3 KB
  slice waveform.ts: 9.3 KB
  find-the-clipping: 4 outputs identical across 2 offline runs
deploy-482: data 0.0 KB gzipped

demo-data check: OK
exit 0
```

"Identical" means equal to each other and to the committed files. The check was also run against deliberately
broken SOURCE.md files (a missing heading, a `CC BY-SA 4.0` licence) and failed on both, then restored.

Exit 2, the demo tests with their oracles (`npx vitest run --dir site/src/demos`, M6a not merged):

```
 ✓ … [ridgecrest-aftershocks] answer > oracle: daily M≥2.5 counts equal USGS /count for three UTC days (no answer.ts)
 ✓ … [ridgecrest-aftershocks] answer > the decay numbers equal an independent recount
 ✓ … [central-park-summer] answer > oracle: 1991–2020 monthly mean highs are within ±1 °F of NCEI normals (no answer.ts)
 ✓ … [central-park-summer] answer > oracle: five spot-checked record highs equal the raw maxima (no answer.ts)
 ✓ … [central-park-summer] answer > recomputes the whole extract from the raw cache and matches the committed JSON
 ✓ … [pick-a-checkpoint] answer > oracle: an independent argmin over the committed CSV picks the same checkpoint (no answer.ts)
 ✓ … [battery-payback] answer > oracle: the yearly sums equal the last minus the first meter reading (no answer.ts)
 ✓ … [battery-payback] answer > oracle: a hand-computed 3-day profile
 ✓ … [battery-payback] answer > reconciles with the generator to the cent
 ✓ … [find-the-clipping] answer > oracle: matches a brute-force count on random signals (no shared code)
 ✓ … [find-the-clipping] answer > the bundled recording qualifies (reference scan in recording.json)
 ✓ … [deploy-482] simulator > oracle: every bucket percentile equals a brute-force sort of its samples
 ✓ … [deploy-482] answer > oracle: the banner numbers equal medians recomputed from the buckets (no answer.ts)
 ✓ … [deploy-482] answer > clears #481 and blames #482 on every seed tried
 … (53 tests in all)
 Test Files  7 passed (7)
      Tests  53 passed (53)
```

Type check: the new TypeScript (`site/src/demos/**/*.ts`, `site/src/examples/data/*.ts`) passes `tsc --noEmit`
with `strict`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `isolatedModules` and
`types: ["vite/client"]` (a temporary tsconfig, not committed; exit 0). `biome ci .` is clean, with no lint warnings
in the new files.

Gates not available on this base (their milestones have not merged; the root delegations fail as M0 intended):
`test:visual` and `check-visual-diffs` (M3a), `ledger` / `trace-check` / `test:browser` (M3b), `check:package` /
`check:size` / `check:api` (M5), `build:site` / `check:examples` (M6a; `npm run build:site` → "No workspaces found:
--workspace=site"). `bench:ab` does not apply (no `src/engine`, `src/core` or `src/public` change).

## Visual-ledger rows

None.

## Requests for integrator

1. **Merge order:** after M6a (plan W1 order). No file overlaps M6a: M6b writes only `scripts/demo-data/**`,
   `site/public/data/**`, `site/src/examples/data/**`, `site/src/demos/<slug>/{answer,simulator}{,.test}.ts` and
   this file.
2. **Site test config (M6a):** once `site/vitest.config.ts` covers `src/**`, these tests run in `npm test`. They
   need the node environment only (no DOM), Vite `?raw` imports of the committed data, and `import.meta.glob` for
   the optional raw cache. If the site config adds a different `root`, the relative paths still resolve from each
   test file.
3. **Site type check (M6a):** the files pass TypeScript `strict` + `verbatimModuleSyntax` with `vite/client` types.
   They are not written for `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` (Astro's "strictest"
   preset; about 60 errors, mostly typed-array indexing). If M6a picks that preset for `src/**`, either exclude
   `src/demos/**` and `src/examples/data/**` from it or ask for a follow-up.
4. **`site/tests/data-size.test.ts` (M6a):** count bytes the way `npm run demo-data -- check` does: gzip every
   file in `site/public/data/<slug>/` except `*.md`, against 1 MB; for `find-the-clipping` count the audio file's
   raw bytes (already compressed) against 2 MB; slices ≤ 20 KB. Current values are in the Gates output above. The
   test may simply run the check without `--require-cache`.
5. **Footer attribution (M16):** in every `SOURCE.md`, the `## Attribution` section is exactly one line and the
   first line under `## Licence` is the licence label, so the footer is "Data: <attribution> (<licence>)".
6. **Tooling the generators rely on:** `find-the-clipping.mjs` imports `playwright` (a `bench` devDependency)
   with `@playwright/test` as a fallback, and `esbuild` (root devDependency); all generators call the pinned Biome
   in `node_modules/.bin`. If M4/M5 move these, keep one Playwright entry and esbuild resolvable from the root.
7. **Raw cache:** the cache that reproduces the committed files lives only in this worktree,
   `.claude/worktrees/m6b/scripts/demo-data/.cache/` (42 MB). Copy it into the main checkout's
   `scripts/demo-data/.cache/` before removing the worktree if later milestones (M16, M14) should run `--offline`
   and the V2 raw recompute test (that one test skips without it; everything else runs from committed files).

No library defects were found (M6b does not use the library), so there are no W5 fixture requests.

## Known gaps

- **R2 fallback not built.** OPSD was reachable, so the NESO Carbon Intensity fallback demo (a different question
  with its own answer) was not implemented. If OPSD fails 3 times, `battery-payback.mjs` exits 2 with the
  fallback instructions instead of producing data. The R1 and S1 fallbacks are implemented and were exercised.
- **Page-side acceptance belongs to M16a/b/c:** the S1 in-page `OfflineAudioContext` reference scan and playback
  checks, S2 heap/marker-alignment and follow checks, V1 brush timing and Tokyo time zone, R1/R2 Playwright
  specs, the print check for V2. The data, answers and oracles they need are here.
- **Node version:** the generators use only Node 22 APIs (`fetch`, `AbortSignal.timeout`, `node:zlib`) but were
  run on the local Node 24.18.
- **Free parameters the plan left open**, chosen and documented in SOURCE.md: R1 batch size 4 (plain SGD, no
  momentum; with batch 8–32 run A's validation loss stays flat and noisy after epoch 15, so the 5% rule would
  fire on noise rather than on a rising trend; with batch 4 it rises steadily from epoch 11), the V2
  ±7-day percentile window, the S1 silence rule (50 ms windows below −50 dBFS RMS), the S2 traffic and N+1 sizes.
- No ledger `it.fails` entries: nothing is pending.

## Data notes

All raw files were retrieved on **2026-10-23**; every SOURCE.md lists each raw URL with its bytes and SHA-256.

| Demo | Source and licence | Committed extract | Notes |
|---|---|---|---|
| V1 | USGS ComCat FDSN, U.S. public domain | `events.csv` 39,244 events (2,661 M≥2.5), 2.42 MB raw / 671.6 KB gz; `oracle.json` | `/count` now reports 39,245 (the plan's 39,218 was 2026-10-21; the catalogue grows); one event without a magnitude is dropped; 3 quarry blasts kept, as in the `/count` oracle. Oracle days: 2019-07-06 1239, 2019-07-08 109, 2019-08-22 14. |
| V2 | NOAA NCEI GHCN-Daily USW00094728, U.S. Government work, doi:10.7289/V5D21VHZ | `summer.json` 366 climatology days + 92 days of 2025, 103 KB raw / 7 KB gz; `oracle.json` | Raw `USW00094728.csv` 17,838,327 B, SHA-256 `eb340d1b…f331`. NCEI normals: Jun 79.7, Jul 84.9, Aug 83.3 °F; the extract's means are 79.9, 85.1, 83.5. Observations in whole °F (exact for U.S. stations). |
| R1 | UCI optdigits, CC BY 4.0 (logs MIT) | `train.csv` 5,736 rows, `val.csv` 120 rows, `runs.json`; 45 KB gz | Zip 591,292 B, SHA-256 `0d7b054f…3fb0`. |
| R2 | OPSD Household Data 2020-04-15, CC BY 4.0 (attribution copied verbatim from the README) | `hourly.csv` 8,760 rows, `meta.json`; 82 KB gz | Chosen `DE_KN_residential4`, 2017: 8,704 measured hours (99.36%), 56 OPSD-interpolated hours kept and flagged, 0 gaps, 0 decreasing readings. Raw 15,654,559 B, SHA-256 `15956440…7d60`. |
| S1 | NASA via the Internet Archive, item `12-02-21_Space-to-Ground-Comm_PDAM-prep-conversation`, U.S. Government work | `recording.mp3` 1,256,733 B (unchanged, SHA-256 `acbea8c6…5c41`), `recording.json` | 102.9 s, 44.1 kHz stereo. Licence evidence: NASA collection and a NASA creator (`john.l.stoll@nasa.gov`); the item has no `licenseurl`. 4 candidates decoded; the first three had no clipped runs. |
| S2 | Seeded simulator, MIT | none (SOURCE.md only) | Labelled "Simulated service"; `?seed=` replays. |

Regenerate: `npm run demo-data -- <slug>` (online, refreshes the cache and may change counts as catalogues
update) or `npm run demo-data -- <slug> --offline` (byte-identical from the cache); `npm run demo-data -- check`
verifies everything. No fallback was applied to any committed extract.

## Human steps

None required. Optional: review the S1 licence evidence (a NASA ISS space-to-ground recording uploaded by a NASA
account in the NASA collection, without an explicit `licenseurl`); if a recording with an explicit public-domain
`licenseurl` is preferred, the generator's search order can be changed and rerun.
