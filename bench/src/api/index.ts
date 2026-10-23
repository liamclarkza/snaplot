// The adapter for the snaplot build this page runs against. One adapter so far: v1, the
// rows-first `createChart` API of the current tree.

import type { BenchApi } from './types';
import { v1 } from './v1';

export function loadApi(_override?: string | null): BenchApi {
  return v1();
}
