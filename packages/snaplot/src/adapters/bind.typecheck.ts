// Type test of the binding's prop split (plan §7.1): OPTION_KEYS lists every ChartOptions key,
// so an option added to the public type is never sent to the host element as an attribute.
// `satisfies` in bind.ts already rejects a key ChartOptions does not have. Type-checked by
// `npm run typecheck`; never run.
import type { ChartOptions } from 'snaplot';
import type { OPTION_KEYS } from './bind';

type Listed = (typeof OPTION_KEYS)[number];
type Missing = Exclude<keyof ChartOptions, Listed>;

/** `true` only when no ChartOptions key is missing from OPTION_KEYS. */
export const everyOptionIsListed: [Missing] extends [never] ? true : Missing = true;
