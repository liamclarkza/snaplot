import { describe, expect, it, vi } from 'vitest';
import type { ChartConfig } from '../types';

vi.mock('solid-js', async () => vi.importActual('solid-js/dist/solid.js'));

import { createRoot } from 'solid-js';
import { createChartGroup } from './createChartGroup';

describe('createChartGroup bindings', () => {
  it('omits zoom sync by default and includes it only when opted in', () => {
    createRoot((dispose) => {
      const group = createChartGroup();

      const bindings = group.bind();
      expect(bindings.cursor.syncKey).toBe(group.syncKey);
      expect(bindings.highlight.syncKey).toBe(group.syncKey);
      expect(bindings.zoom).toBeUndefined();

      expect(group.bind({ zoom: true }).zoom?.syncKey).toBe(group.syncKey);

      dispose();
    });
  });

  it('apply does not clobber a caller-set syncKey and preserves other fields', () => {
    createRoot((dispose) => {
      const group = createChartGroup();
      const config: ChartConfig = {
        series: [{ label: 'a', dataIndex: 1 }],
        cursor: { syncKey: 'mine', show: true },
      };

      const applied = group.apply(config);
      expect(applied.cursor?.syncKey).toBe('mine');
      expect(applied.cursor?.show).toBe(true);
      expect(applied.highlight?.syncKey).toBe(group.syncKey);
      // Zoom sync is opt-in.
      expect(applied.zoom).toBeUndefined();

      const withZoom = group.apply(config, { zoom: true });
      expect(withZoom.zoom?.syncKey).toBe(group.syncKey);

      dispose();
    });
  });
});
