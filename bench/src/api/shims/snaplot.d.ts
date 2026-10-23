// Type shim for `snaplot`. The adapters read each version's module dynamically (api/common.ts),
// so the bench never type-checks against one version's declarations: v012, v1 and v2 differ, and
// the overhaul keeps changing the current one.
export {};
