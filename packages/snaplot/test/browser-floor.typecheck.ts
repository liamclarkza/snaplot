// The library type-checks against the D25 browser floor (tsconfig lib ES2023 + DOM): an API newer
// than Chrome 111, Firefox 115 and Safari 16.4 does not compile (gap-environments-08). The
// shipped syntax is checked by check:package ([gap-environments-08] in test/consumers).

// @ts-expect-error Object.groupBy is ES2024 (Chrome 117, Safari 17.4)
export const grouped = Object.groupBy([1, 2], (n: number) => (n % 2 ? 'odd' : 'even'));
// @ts-expect-error Promise.withResolvers is ES2024 (Chrome 119, Safari 17.4)
export const resolvers = Promise.withResolvers<void>();
// ES2023 (Chrome 110, Firefox 115, Safari 16): within the floor.
export const sorted = [3, 1, 2].toSorted();
