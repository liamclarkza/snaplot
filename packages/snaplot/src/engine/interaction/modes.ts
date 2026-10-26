/**
 * Interaction modes (`mode`): the zoom and pan axes each preset turns on. The engine applies them
 * to its merged options at construction and on every `mode` change.
 */
import type { ChartSpec, DeepPartial } from '../spec';

/**
 * Apply interaction mode presets to zoom/pan config.
 * Mode presets provide default zoom/pan axes while preserving explicit
 * zoom/pan fields supplied by the caller.
 */
export function applyModePresets(config: ChartSpec, source?: DeepPartial<ChartSpec>): void {
  const mode = config.mode;
  if (!mode) return;

  const zoom = source?.zoom;
  const pan = source?.pan;

  if (mode === 'analytical') {
    config.zoom = {
      ...config.zoom,
      enabled: zoom?.enabled ?? true,
      x: zoom?.x ?? true,
      y: zoom?.y ?? true,
    };
    config.pan = {
      ...config.pan,
      enabled: pan?.enabled ?? true,
      x: pan?.x ?? true,
      y: pan?.y ?? true,
    };
  } else if (mode === 'timeseries') {
    config.zoom = {
      ...config.zoom,
      enabled: zoom?.enabled ?? true,
      x: zoom?.x ?? true,
      y: zoom?.y ?? false,
    };
    config.pan = {
      ...config.pan,
      enabled: pan?.enabled ?? true,
      x: pan?.x ?? true,
      y: pan?.y ?? false,
    };
  } else if (mode === 'readonly') {
    config.zoom = { enabled: false };
    config.pan = { enabled: false };
  }
}
