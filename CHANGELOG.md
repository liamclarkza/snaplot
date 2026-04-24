# Changelog

All notable changes to snaplot are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres
to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.6.0] - 2026-04-24

### Fixed
- **Axis tick density at deep zoom.** `LinearScale` no longer collapses to
  one or two ticks when the zoomed domain straddles a single integer
  (e.g. `[49.7, 50.3]` used to render only `50`). The integer fast-path in
  `niceTicks` now requires at least three integer ticks before firing;
  narrower ranges subdivide via the nice-step path so the axis always
  keeps enough reference lines to read.
- **Time axis at sub-second zoom.** `TimeScale` gained 10ms / 50ms / 100ms /
  250ms / 500ms intervals plus a linear-subdivision fallback, so zooming
  past one second no longer leaves the X axis with a single tick. Tick
  formatting also renders `HH:MM:SS.mmm` when the domain is under one
  second so adjacent ticks are visibly distinct.
- **Consistent decimal count on linear axes.** `LinearScale.tickFormat`
  now derives its precision from the actual nice step and applies the
  same decimal count to every value in the axis. Integer-valued ticks no
  longer short-circuit to `6` while their neighbours render as `6.20` /
  `6.40` — they render as `6.00`, keeping the column aligned.

### Changed
- **Tabular numerals by default.** Axis tick labels and the default
  tooltip now ship with `font-variant-numeric: tabular-nums` so digits
  stay in fixed-width columns instead of jiggling as values update
  during zoom, pan, or live data. The docs site applies the same rule
  at `body` level so all numeric readouts, demos, and legend tables
  inherit it automatically.

## [0.5.0] - 2026-04-18

### Breaking
- `ZoomConfig.wheelFactor` renamed to `ZoomConfig.wheelStep`, with new
  semantics: it is now the zoom fraction per max wheel / pinch tick
  rather than a scale factor. Default changes from `1.1` (10 % per
  tick) to `0.1` (same 10 % per tick, stated directly). `0` disables
  wheel zoom. Negative values are clamped to 0. Migration:
  `wheelFactor: 1.1` → `wheelStep: 0.1`, `wheelFactor: 2` → `wheelStep: 1`.

### Added
- Biome 2.4 for lint + format (`npm run lint`, `npm run check`).
- Vitest for unit tests (`npm test`), initial suites for
  `data/binarySearch`, `scales/niceNumbers`, `config/merge`.
- Lefthook pre-commit + pre-push hooks.
- `.github/workflows/quality.yml` running lint + typecheck + tests + builds on PRs.
- `CONTRIBUTING.md` documenting dev workflow and release process.

### Fixed
- **Security**: `TooltipManager.defaultRender` now HTML-escapes series labels,
  formatted values and colour strings. A series named `<img src=x onerror=…>`
  no longer executes.
- **Stability**: one throwing event listener no longer stops the render loop
  or other subscribers on the same event (`ChartCore.emitEvent` is now wrapped
  in try/catch with console logging).
- **Performance**: histogram tooltip bin lookup uses `upperBound` instead of
  a linear scan, O(log n) vs O(n). Meaningful for charts with many bins.

### Changed
- Dropped unused `chartRef` and two `as any` casts in `legendPlugin`.
- Dropped an `as any` cast in `legendTablePlugin` (setOptions accepts
  `DeepPartial` already).
- Legend plugin click handler now re-reads `chart.getOptions()` each
  invocation so stale closures can't reference outdated series indices.

## [0.4.1]

See git history before this entry for commits prior to the changelog being
introduced: `git log v0.4.1`.
