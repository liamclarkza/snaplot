# Chart.js adapter notes

The adapter uses one `Chart` instance for the lifetime of the canvas. React creates it in an effect and destroys it in the effect cleanup, which is safe under React 19 StrictMode's mount, cleanup, and remount cycle. Later changes replace `chart.data` and `chart.options` and call `update('none')`, so changing scenarios, themes, or the application-owned hidden-series list does not recreate the instance. `responsive: true`, `maintainAspectRatio: false`, a full-size wrapper, and a `ResizeObserver` keep the canvas at the height supplied by the parent chart container.

Chart.js mixed charts require a custom-types-per-dataset configuration. The adapter maps `area` to a filled line dataset, leaves `line` as a line dataset, and uses native `bar` and `scatter` controllers. All datasets use `{x, y}` points with `parsing: false`; a missing series value remains `y: null` so Chart.js can render a gap. The shared legend remains outside the adapter (`legend.display: false`), and hidden IDs are passed through as each dataset's native `hidden` state.

The shared numeric domains map to `min` and `max` on the left and optional right scales. `xScale` and `yScale` select the native `linear` or `logarithmic` scale. Tick formatters are used on both axes and the y value in tooltips. The right scale is only added when at least one series targets it; right-axis grid lines are disabled over the plot area to avoid doubling the primary grid.

The threshold line is a small local plugin because the base Chart.js controllers do not provide a declarative horizontal reference-line primitive. It reads the current spec through a ref, draws after datasets, and uses the current theme's muted color. Its label is the contract's supplied string. If a threshold is outside the visible y domain, Chart.js still gives the plugin a pixel coordinate; browser validation should confirm whether clipping at each scenario's chosen domain looks desirable.

Known integration friction and limits:

- Chart.js's normal `ChartConfiguration` is typed for one root chart type, while this lab needs per-dataset types. The adapter uses `ChartConfigurationCustomTypesPerDataset` and a narrow `unknown` bridge when assigning the rebuilt mixed dataset data back to the retained chart instance. No `any` is used.
- The adapter deliberately does not render a title, subtitle, or legend; those belong to the shared lab shell so competitor outputs can be compared with identical application-owned chrome.
- Bar datasets use the same numeric `{x, y}` points as the other series. The browser pass should check bar width and overlap for each demo's x spacing, especially when bars are mixed with lines.
- Chart.js owns its internal responsive observer as well. The explicit observer is retained to request a resize when the fixed-height parent changes; browser validation should check that this does not produce visible resize churn in the target layout.
- This note records behavior and API constraints only. No comparative performance claim is made here; timing and interaction behavior require the parent's browser evaluation.
