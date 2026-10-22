# API usability trial results

## Trial 1: plain ML tracker

Initial guess: the README's independent datasets example could be copied directly with per-series `data`, explicit series IDs, a `referenceLines` threshold, `update`, and `appendData` targeted by `seriesId`.

Result: compiled as written. No API glue was needed. The explicit IDs are required because both series read the same `loss` field; the different `step` values demonstrate independently sampled runs.

## Trial 2: React categorical biology bars

Initial guess: React 19's ref-as-prop and controlled `hiddenSeries` can be combined with `SeriesLegend` by passing a `useRef` chart handle to `Chart` and `chartRef.current` to the legend.

First failure: a ref-only version compiled, but reading `chartRef.current` in the same render would leave the legend disconnected because assigning a ref does not rerender the parent. Successful simpler path: React's callback `ref={setChart}` stores the handle in state, which both keeps the imperative handle and rerenders the native legend with the live chart. The example also calls `chart?.resetViewport()` from a button to show the handle is directly usable. Explicit category order was supplied from the observed labels.

## Counts and friction

- ML tracker: 35 lines including data and comments; 3 public calls (`createChart`, `update`, `appendData`).
- Biology bars: 41 lines including data and JSX; 2 public components (`Chart`, `SeriesLegend`) plus React `useState` and a callback ref.
- Discoverability friction: low for independent sources and append targeting because README examples name the exact options. The React legend/ref wiring is less obvious: README names both features, but does not show the callback-ref-to-state pattern or explain that the legend starts with a null handle. Explicit series IDs for duplicate Y fields are also easy to miss without the independent-datasets note.

Validation command: `tsc -p experiments/chart-lab/trials/tsconfig.json --noEmit`.
