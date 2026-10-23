import { describe, expect, it, vi } from 'vitest';
vi.mock('solid-js', async () => vi.importActual('solid-js/dist/solid.js'));
const mock = vi.hoisted(() => ({ destroy: vi.fn(), create: vi.fn() }));
vi.mock('../api/createChart', () => ({
  createChartGroup: (options: unknown) => {
    mock.create(options);
    return { destroy: mock.destroy };
  },
}));
import { createRoot } from 'solid-js';
import { createChartGroup } from './createChartGroup';
describe('Solid group ownership', () => {
  it('forwards synchronization options and disconnects on owner cleanup', () => {
    createRoot((dispose) => {
      createChartGroup({ viewport: true, alignPlots: true });
      expect(mock.create).toHaveBeenCalledWith({ viewport: true, alignPlots: true });
      expect(mock.destroy).not.toHaveBeenCalled();
      dispose();
      expect(mock.destroy).toHaveBeenCalledOnce();
    });
  });
});
