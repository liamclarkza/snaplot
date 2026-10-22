# Visual feedback and library changes

The user preferred the Chart.js renderings in the lab: straight plot edges,
restrained bars, and consistent quiet colors for titles, labels, grid and ticks.
These preferences apply to Snaplot's library defaults, not just this dashboard.
Chart.js is the visual reference. Recharts and ECharts remain API references.
Only implement visual adjustments the user identifies; obtain their approval
before making any additional visual refinements.

The comparison adapter explicitly gives Chart.js bars a 0.75-opacity fill,
1px outline and 2px radius. Those details are a useful design reference, not
proof that an unconfigured Chart.js chart looks exactly like this dashboard.

Snaplot now uses square plot clips/frame, aligned to the tick endpoints; muted
axis titles and tick labels without a second title-only opacity; and grid/frame
colors of equal strength in built-in themes. `gridOpacity` is applied directly
instead of being multiplied by an undocumented 0.55. `createTheme({ muted })`
uses that text color for axis labels and 0.18 opacity for grid/frame/tick strokes.
These stroke colors are composited against the opaque chart background before
painting at full opacity, so crossings do not brighten through alpha accumulation.
Explicit opacity tokens and per-axis grid/tick styling remain available.
`theme.axisLabelColor` / `--chart-axis-label` lets a product tune axis text without
changing primary companion text. `axisLineColor` now controls default tick strokes;
`tickColor` remains the muted companion/reference color.

Bars have a 0.75 default opacity, a 1px outline using their stroke color, and 2px
rounding at the value end. The zero-baseline end stays square for both positive
and negative values. Existing fill callbacks and explicit opacity still work.

## Regular ticks define automatic numeric bounds

The requested behavior is a regular sequence reaching the plot limits. Appending
an arbitrary endpoint tick creates a short final interval and is not the intended
fix. The same constraint matters when thinning labels in small charts.

Inspection of the installed implementations:

- Chart.js 4.5.1 computes a nice numeric interval, rounds automatic bounds outward,
  then adopts the first and last generated ticks as the scale bounds. Its default
  `bounds: 'ticks'` is documented in the [linear-axis documentation](https://www.chartjs.org/docs/latest/axes/cartesian/linear.html).
- ECharts 6.1.0 computes a nice interval and extent together for numeric value axes.
- Recharts 3.10.1 derives nice ticks for automatic numeric domains and extends the
  domain to include them (`combineNiceTicks` / `combineAxisDomainWithNiceTicks`).

Fixed domains are a separate case: the implementations can retain an explicit
endpoint even when it creates a shorter final interval. For example, the ECharts
F1 fixture displays 0, 100, 200, 300, 350 with its explicitly capped Y domain. We
should not copy that artifact as the general Snaplot rule.

Snaplot's dashboard also forced `tickCount: 5`; this override is removed so the
lab uses core tick selection. The F1 fixed 0–350 Y range then receives regular
50-unit increments. Continuous automatic linear bounds are rounded to regular
nice intervals; `roundBounds: false` keeps tight data bounds. Explicit bounds remain intentional constraints. Bar-axis spacing is addressed
separately below. When an aligned
continuous sequence needs thinning, its stride divides the interval count so
both ends survive without adding a short final interval.

This pass addresses visual defaults and numeric ranges. Long-title fitting,
long-label collisions and the missing single-observation line marker remain
tracked in [DEFAULTS_FINDINGS.md](DEFAULTS_FINDINGS.md).

Validation: 403 tests across library, site and lab; TypeScript, Biome and all
three production builds pass. The lab still reports the existing ECharts chunk
size warning. [Updated F1 rendering](evidence/refined-f1-snaplot.png).

## Bar-axis offset investigation

The airport screenshot exposed a remaining error in the initial fix: Snaplot
kept 0.5-category domain padding but thinned category/grid ticks to every second
category. Edge spaces then measured 0.5 and 1.5 categories while internal spaces
measured 2. This is a range/tick-plan mismatch, not a missing endpoint tick.

Chart.js's installed `BarController.overrides` enables both index-axis `offset`
and `grid.offset`, even when the adapter changes that scale's type to `linear`.
`LinearScaleBase.buildTicks` chooses a nice interval and adopts its bounds;
`configure` expands the mapped range by half a tick interval at each end.
`getPixelForGridLine` moves grid strokes half a tick interval from label centers,
including the boundary after the last tick. The [bar-axis documentation](https://www.chartjs.org/docs/latest/charts/bar.html#scale-configuration)
explains these separate offsets. Its [linear-axis documentation](https://www.chartjs.org/docs/latest/axes/cartesian/linear.html)
also documents the tick-bound range and tick-density limit.

A normalization check against the installed Chart.js package confirms that
`x.type: linear` still inherits both bar offsets through dataset-default merging.

For the 7–18 hour airport data, a 2-hour tick interval gives center labels
6, 8, …, 18; mapped bounds 5–19; and grid boundaries 5, 7, …, 19. This keeps both
edge grid cells the same width as the interior cells. The series values stay
at their real numeric X positions; bars do not move to new categories.

Snaplot now uses this coordinated center/grid plan for automatic linear bar
axes. Explicit bounds/ticks, `roundBounds: false`, histogram bin geometry and zoomed
viewports keep their existing behavior. Regression tests cover small category
sets and irregular bar widths as well as the airport case.
[Updated airport comparison](evidence/refined-transport-snaplot.png).

Decimal boundary indices also compensate for floating-point division error,
so an aligned final tick such as 0.6 on a 0.2 interval is retained without
admitting genuinely out-of-range tick values.
