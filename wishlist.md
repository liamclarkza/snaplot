# snaplot Wishlist

## Identity-Based Highlight Sync

Orbit found a cross-chart highlight mismatch when multiple charts share a
highlight sync group but do not have identical series sets or ordering.
`snaplot` currently publishes numeric `seriesIndex` values through
`highlight.syncKey`; receiving charts interpret that index against their own
local series array, which can highlight the wrong run.

Wanted behavior:

- Allow highlight sync to use stable series identity instead of only local
  numeric index.
- Support identity from `SeriesConfig.meta`, for example `meta.runId`.
- Publish the identity through the sync group and let each receiving chart map
  it back to its own local series index.
- Keep numeric index sync as the default for simple charts with identical
  series ordering.

Possible API shape:

```ts
highlight: {
  syncKey: "project-charts",
  getKey: (series) => series.meta?.runId,
}
```

or:

```ts
highlight: {
  syncKey: "project-charts",
  identity: "meta.runId",
}
```

This would make Orbit's chart grid safer because each metric chart can contain
a different subset/order of runs while still sharing cursor and zoom behavior.
