// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { TooltipPoint } from '../engine/spec';
import { lightTheme } from '../engine/theme/resolve';
import { TOOLTIP_CSS, TooltipManager } from './tooltip';

afterEach(() => {
  for (const style of document.querySelectorAll('style')) style.remove();
  document.body.replaceChildren();
});

const point = (label: string, color: string): TooltipPoint => ({
  seriesIndex: 0,
  dataIndex: 0,
  label,
  x: 1,
  y: 2,
  color,
  formattedX: '1',
  formattedY: '2',
});

describe('the tooltip styles (dom/styles.ts adoptStyles)', () => {
  it('adopts one stylesheet per document for every tooltip, and keeps its placement inline', () => {
    const one = new TooltipManager(lightTheme);
    const two = new TooltipManager(lightTheme);
    const styles = [...document.querySelectorAll('style[data-snaplot-styles]')];
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toContain(TOOLTIP_CSS);
    const tip = [...document.body.children].find((el) =>
      el.classList.contains('snaplot-tooltip'),
    ) as HTMLElement;
    expect(tip.style.position).toBe('fixed');
    expect(tip.style.pointerEvents).toBe('none');
    expect(tip.style.opacity).toBe('0');
    one.destroy();
    two.destroy();
  });

  it('renders rows with classes, and only the swatch colour inline', () => {
    const tooltip = new TooltipManager(lightTheme);
    tooltip.show([point('<b>a</b>', 'red'), point('b', '#00f')], 10, 10);
    const tip = document.body.querySelector<HTMLElement>('.snaplot-tooltip')!;
    expect(tip.querySelectorAll('.snaplot-tooltip-row')).toHaveLength(2);
    const inline = [...tip.querySelectorAll<HTMLElement>('[style]')].map((el) =>
      el.getAttribute('style'),
    );
    expect(inline).toEqual(['background:red', 'background:#00f']);
    expect(tip.textContent).toContain('<b>a</b>');
    tooltip.destroy();
  });
});
