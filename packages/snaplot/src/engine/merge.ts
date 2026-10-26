/**
 * Deep merge utility for chart configuration.
 *
 * Merge cascade: global defaults → theme → chart-level → series-level.
 * Objects merge recursively. Primitives overwrite.
 * Arrays replace entirely. This keeps declarative config updates from
 * retaining stale entries such as removed series or plugin options.
 *
 * The result never aliases the caller's nested objects: a plain-object
 * source with no plain-object counterpart in the target is deep-cloned
 * rather than assigned by reference, so constructing a chart cannot mutate
 * the config object the caller passed in (initAxes writes x/y back into
 * `config.axes`), and two charts built from one config never share mutable
 * axis state.
 */

// A merge target we can recurse into: only object literals (or null-proto
// bags). Class instances (Date, Map, Set, every typed array) fail the
// prototype test and are replaced by reference, never spread into `{}` which
// would silently destroy their data.
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  ...sources: Partial<T>[]
): T {
  const result = { ...target };

  for (const source of sources) {
    if (!source) continue;

    for (const key of Object.keys(source) as (keyof T)[]) {
      const targetVal = result[key];
      const sourceVal = source[key];

      if (sourceVal === undefined) continue;

      // `result` is typed `T`, but we write arbitrary keys via the
      // `keyof T` iterator. Cast once to a flexible record shape to keep
      // the loop body `any`-free.
      const out = result as Record<string, unknown>;
      const keyStr = key as string;

      if (isPlainObject(targetVal) && isPlainObject(sourceVal)) {
        out[keyStr] = deepMerge(
          targetVal as Record<string, unknown>,
          sourceVal as Record<string, unknown>,
        );
      } else if (isPlainObject(sourceVal)) {
        // No plain-object target to merge into, but the source is one we would
        // otherwise pass by reference. Deep-clone it (merging into a fresh {})
        // so the config never retains a handle on the caller's object.
        out[keyStr] = deepMerge({}, sourceVal as Record<string, unknown>);
      } else {
        out[keyStr] = sourceVal;
      }
    }
  }

  return result;
}
