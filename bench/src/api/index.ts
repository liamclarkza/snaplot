// Picks the adapter for the snaplot build this page was bundled against (plan §12 M4):
//
// - `'ChartCore' in mod && !('createChart' in mod)` → v012 (the v0.12.0 release);
// - otherwise construct a chart and test `typeof handle.setOptions === 'function'` → v2, else v1.
//
// `?api=v012|v1|v2` overrides the detection (`bench:ab --api`).

import * as snaplot from 'snaplot';
import type { Loose } from './common';
import type { ApiVersion, BenchApi } from './types';
import { v1 } from './v1';
import { v2 } from './v2';
import { v012 } from './v012';

const mod = snaplot as unknown as Loose;
const ADAPTERS: Record<ApiVersion, () => BenchApi> = { v012, v1, v2 };

export function isApiVersion(value: unknown): value is ApiVersion {
  return value === 'v012' || value === 'v1' || value === 'v2';
}

export function detectApi(): ApiVersion {
  if ('ChartCore' in mod && !('createChart' in mod)) return 'v012';
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;left:-10000px;top:0;width:240px;height:120px';
  document.body.appendChild(el);
  try {
    const handle = mod.createChart(el, {
      data: { columns: { x: Float64Array.of(0, 1), y: Float64Array.of(0, 1) } },
      x: 'x',
      series: [{ y: 'y' }],
    });
    const version: ApiVersion = typeof handle.setOptions === 'function' ? 'v2' : 'v1';
    handle.destroy();
    return version;
  } finally {
    el.remove();
  }
}

export function loadApi(override?: string | null): BenchApi {
  const version = isApiVersion(override) ? override : detectApi();
  return ADAPTERS[version]();
}
