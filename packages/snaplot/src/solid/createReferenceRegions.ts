import { createEffect, on } from 'solid-js';
import {
  createReferenceRegionsPlugin,
  type ReferenceRegion,
  type ReferenceRegionsPlugin,
} from '../plugins/builtins/referenceRegionsPlugin';

/**
 * Solid adapter for reference regions. Pass the returned plugin in chart
 * config once; changes to the accessor repaint it without duplicate effects
 * or retained imperative refs in application code.
 */
export function createReferenceRegions(
  source: () => readonly ReferenceRegion[],
): ReferenceRegionsPlugin {
  const plugin = createReferenceRegionsPlugin({ regions: [...source()] });
  createEffect(on(source, regions => plugin.setRegions([...regions]), { defer: true }));
  return plugin;
}
