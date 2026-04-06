import type { Plugin, ChartInstance } from '../../types';

/**
 * Built-in tooltip plugin.
 * Tooltip rendering is handled directly by the Chart orchestrator
 * using the TooltipManager, since it requires tight integration
 * with hit-testing and cursor state.
 *
 * This plugin serves as an extension point for customisation.
 */
export const tooltipPlugin: Plugin = {
  id: 'builtin:tooltip',
};
