# Direct application data

Snaplot now accepts application rows inside `createChart(element, options)` and as native React/Solid chart props. There is no public conversion step.

```ts
import { createChart } from 'snaplot';
const chart = createChart(element, {
  data: rows,
  x: 'time',
  series: [{ y: 'cpu', label: 'CPU' }],
});
chart.update({ data: nextRows });
```

Dates infer time axes, strings infer categories, and numbers infer linear axes. Numeric timestamps explicitly select `type: 'time'`. Stable sorting happens on ingestion for ordered marks and preserves original rows and source indices. Nullish and NaN metric values remain gaps.

Series may override `data` and `x` for independent sampling. Named `Float64Array` columns provide the reusable-buffer path. Band bounds, scatter encodings, tooltip fields and row identities all accept fields or accessors. Explicit histogram results pass directly into histogram series.

See the [root API overview](../../README.md) and generated site documentation for the complete contract. Historical findings in API_FRICTION.md describe the API before this overhaul, not the current authoring requirements.
