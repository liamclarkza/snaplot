# Recharts adapter notes

The adapter in `src/adapters/RechartsChart.tsx` uses `ComposedChart` for line,
area, bar, and mixed series, and switches to `ScatterChart` when every visible
series is a scatter series. The shared rows remain the chart data for Cartesian
marks. Scatter marks receive a small per-series `{ x, y }` projection because
Recharts' scatter API reads the point coordinate from the scatter data object.
The projection keeps `y: null` entries so Recharts can apply its own null
coordinate handling.

The adapter sets `isAnimationActive={false}` on every mark and tooltip so the
comparison does not include animation work. Line and area marks use linear
interpolation to match the shared fixtures and explicitly set
`connectNulls={false}`. Hidden marks are removed from the render, while the
right axis remains mounted whenever the spec defines a right-axis series so
toggling that series does not change the plot width. Numeric axes use
`scale="log"` for log specs, and bar specs use Recharts' numeric `padding="gap"`
to keep the first and last bar centered inside the x range. Axis and tooltip
formatters come from the shared spec. The legend is intentionally absent; the
comparison shell owns the accessible legend and passes its hidden IDs to each
adapter.

Log axes receive explicit decade ticks derived from their fixed domain when one
is supplied, or from the positive data range otherwise. This avoids Recharts'
default log tick set becoming crowded with arbitrary intermediate values. The
Y-axis titles use centered labels with explicit horizontal offsets so the
compact margins do not clip them at either card edge.

API friction and limitations:

- Recharts' scatter API is point-oriented while the shared contract is row
  oriented, so each scatter series needs the projection described above. In
  Recharts 3.10.1, `computeScatterPoints` maps a null coordinate to an invalid
  pixel coordinate and the default `Symbols` shape omits that point. Scatter
  has no connecting line by default, so this is the expected null-gap result;
  keeping null rows also avoids the empty-item-data fallback to chart-level
  data.
- A `ComposedChart` is used for mixed mark types. Recharts 3.10.1 registers
  `Scatter` as a valid Cartesian graphical item under `ComposedChart`, so the
  mixed path is supported by the installed source. A chart containing only
  scatter marks uses `ScatterChart`, which supplies item-level tooltip behavior.
  Mixed scatter plus Cartesian marks still need browser checking for visual
  composition and tooltip behavior.
- The shared contract has one `yFormat` and one `yScale`, so that formatter and
  scale are applied to both left and right axes. `rightDomain` remains
  independent when supplied.
- Recharts derives an x domain automatically. Log x/y scales therefore require
  positive finite values, as they do in the underlying d3 scale. The adapter
  does not silently alter invalid data.
- `ResponsiveContainer` measures its parent. The wrapper and container both
  use `height: 100%`; the parent chart card must provide a fixed, non-zero
  height for the chart to render.
- The compact margins leave 30px for the left title and 34px for the right
  title, with 40px/46px axis widths. The title offsets and margins should be
  checked at the narrowest responsive card width.

Browser validation is still required for Recharts 3 rendering details: log
scale tick density, right-axis label placement, tooltip behavior for scatter
points, and mixed scatter/Cartesian composition. This file makes no
performance claims; those belong to the browser comparison run.
