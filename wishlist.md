# snaplot Wishlist

## Completed

### Identity-Based Highlight Sync

Orbit found a cross-chart highlight mismatch when multiple charts share a
highlight sync group but do not have identical series sets or ordering.
`snaplot` now supports stable-key highlight sync through `highlight.getKey`,
`chart.setHighlightKey()`, `chart.getHighlightKey()`, and
`group.highlightKey()`. Numeric index sync remains the default for simple
charts with identical series ordering.

Shipped behavior:

- Highlight sync can use stable series identity instead of only local numeric index.
- Identity can come from `SeriesConfig.meta`, for example `meta.runId`.
- The sync group publishes identity payloads and receivers map them to local series indexes.
- Numeric index sync is still the default for identical series ordering.

Possible API shape:

```ts
highlight: {
  syncKey: "project-charts",
  getKey: (series) => series.meta?.runId,
}
```

This would make Orbit's chart grid safer because each metric chart can contain
a different subset/order of runs while still sharing cursor and zoom behavior.
