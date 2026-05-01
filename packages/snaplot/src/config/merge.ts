/**
 * Deep merge utility for chart configuration.
 *
 * Merge cascade: global defaults → theme → chart-level → series-level.
 * Objects merge recursively. Primitives overwrite.
 * Arrays replace entirely. This keeps declarative config updates from
 * retaining stale entries such as removed series or plugin options.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Float64Array) &&
    !(value instanceof Float32Array)
  );
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
      } else {
        out[keyStr] = sourceVal;
      }
    }
  }

  return result;
}
