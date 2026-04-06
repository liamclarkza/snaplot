/**
 * Deep merge utility for chart configuration.
 *
 * Merge cascade: global defaults → theme → chart-level → series-level.
 * Objects merge recursively. Primitives overwrite.
 * Arrays: series arrays merge by index, other arrays replace entirely.
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

      if (isPlainObject(targetVal) && isPlainObject(sourceVal)) {
        (result as any)[key] = deepMerge(
          targetVal as Record<string, unknown>,
          sourceVal as Record<string, unknown>,
        );
      } else if (
        key === 'series' &&
        Array.isArray(targetVal) &&
        Array.isArray(sourceVal)
      ) {
        // Series arrays merge by index
        const merged = [...(targetVal as unknown[])];
        for (let i = 0; i < (sourceVal as unknown[]).length; i++) {
          if (i < merged.length && isPlainObject(merged[i]) && isPlainObject((sourceVal as unknown[])[i])) {
            merged[i] = deepMerge(
              merged[i] as Record<string, unknown>,
              (sourceVal as unknown[])[i] as Record<string, unknown>,
            );
          } else {
            merged[i] = (sourceVal as unknown[])[i];
          }
        }
        (result as any)[key] = merged;
      } else {
        (result as any)[key] = sourceVal;
      }
    }
  }

  return result;
}
