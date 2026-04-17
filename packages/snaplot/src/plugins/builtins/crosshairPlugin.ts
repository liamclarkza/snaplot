import type { Plugin } from '../../types';

/**
 * Built-in crosshair plugin.
 * Draws vertical (and optionally horizontal) crosshair line on the overlay canvas.
 * This is integrated into the Chart's render cycle rather than being a standalone plugin,
 * but exposed as a plugin interface for consistency and configurability.
 */
export const crosshairPlugin: Plugin = {
  id: 'builtin:crosshair',
  // Crosshair rendering is handled directly by the Chart orchestrator
  // in the overlay render pass, since it needs tight integration with
  // cursor position and the interaction renderer.
  // This plugin serves as a placeholder for future customisation hooks.
};
