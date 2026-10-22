# Apache ECharts adapter

`EchartsChart` uses the tree-shakable ECharts entry points (`echarts/core`, `echarts/charts`, `echarts/components`, and `echarts/renderers`). It registers line, bar, scatter, grid, tooltip, mark-line, and Canvas renderer modules once at module load. The adapter does not register or render a legend; the chart-lab shell owns that UI and passes stable hidden series IDs.

The option is rebuilt from the shared `ChartSpec` on each spec/theme/hidden update and applied with `notMerge: true`. That clears removed or hidden series while retaining the existing ECharts instance. Animations are disabled for comparison. Numeric and logarithmic axes, explicit left/right domains, null points, line/area/bar/scatter kinds, theme colors, axis labels, and the optional left-axis reference line are represented directly in the option. Area series keep markers off for visual parity; visible bar series add a small percentage `boundaryGap` on the numeric x-axis so edge bars are not clipped while ECharts still derives the extent from the supplied x values.

The component initializes only after its container is mounted, observes the container with `ResizeObserver`, and disposes the instance and observer during cleanup. This is intentionally safe under React 19 StrictMode’s mount/cleanup/remount cycle. The root element is `height: 100%`, so the parent chart frame must provide the fixed height.

Known API friction and validation points:

- ECharts’ callback formatter types accept a string-like axis value even when the axis is numeric. The adapter normalizes that value to a finite number before calling the contract’s numeric formatter.
- ECharts mark lines are series options, so the reference line uses a dedicated empty line series pinned to y-axis 0. This keeps the threshold on the left scale when the primary series is hidden or when only right-axis data remains.
- The adapter uses CanvasRenderer and `setOption(..., { notMerge: true })`; browser validation should confirm the expected pixel output for mixed axis series, log scales, null gaps, hidden-series updates, and parent resize. No performance claim is made here.
