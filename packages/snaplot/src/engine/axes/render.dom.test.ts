// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME } from '../../constants';
import type { Layout } from '../spec';
import { updateDOMLabels } from './render';

describe('axis text appearance', () => {
  it('shares one color for ticks and titles and updates pooled labels on theme changes', () => {
    const host = document.createElement('div');
    const layout: Layout = {
      width: 300,
      height: 200,
      dpr: 1,
      plot: { left: 40, top: 10, width: 240, height: 140 },
      axes: { x: { position: 'bottom', area: { left: 40, top: 150, width: 240, height: 50 } } },
    };
    const result = {
      labels: new Map([
        [
          'x',
          [
            { text: '0', x: 40, y: 160, anchor: 'middle' as const },
            { text: 'Time (s)', x: 160, y: 188, anchor: 'middle' as const, kind: 'title' as const },
          ],
        ],
      ]),
    };
    updateDOMLabels(
      host,
      result,
      { ...DEFAULT_THEME, textColor: '#eeeeee', axisLabelColor: '#84969e' },
      layout,
    );
    const nodes = [...host.children] as HTMLElement[];
    for (const node of nodes) {
      expect(node.style.color).toBe('rgb(132, 150, 158)');
      expect(node.style.opacity).toBe('');
    }
    updateDOMLabels(
      host,
      result,
      { ...DEFAULT_THEME, axisLabelColor: undefined, textColor: '#123456' },
      layout,
    );
    expect(host.children[0]).toBe(nodes[0]);
    expect(nodes[0].style.color).toBe('rgb(18, 52, 86)');
    expect(nodes[1].style.color).toBe(nodes[0].style.color);
  });
});
