import { describe, expect, it, vi } from 'vitest';
import { computeTooltipPosition, TooltipManager, tooltipMeasurementKey } from './TooltipManager';
import type { TooltipPoint } from '../types';
import { lightTheme } from '../config/theme';

describe('computeTooltipPosition', () => {
  const base = {
    clientX: 400,
    clientY: 300,
    width: 180,
    height: 100,
    viewportWidth: 800,
    viewportHeight: 600,
    offset: 12,
    pointerType: 'mouse' as const,
  };

  it('uses the ordinary lower-right position when it fits', () => {
    expect(computeTooltipPosition(base)).toEqual({ left: 412, top: 312 });
  });

  it('flips to the cursor left near the right viewport edge', () => {
    expect(computeTooltipPosition({ ...base, clientX: 760 })).toEqual({ left: 568, top: 312 });
  });

  it('flips above the cursor near the bottom viewport edge', () => {
    expect(computeTooltipPosition({ ...base, clientY: 570 })).toEqual({ left: 412, top: 458 });
  });

  it('clamps oversized edge cases to a readable viewport margin', () => {
    expect(computeTooltipPosition({
      ...base,
      clientX: 4,
      clientY: 4,
      width: 900,
      height: 700,
    })).toEqual({ left: 8, top: 8 });
  });

  it('keeps touch tooltips centred above the finger when space permits', () => {
    expect(computeTooltipPosition({ ...base, pointerType: 'touch' })).toEqual({ left: 310, top: 128 });
  });
});

describe('tooltipMeasurementKey', () => {
  const point = (formattedX: string, formattedY: string): TooltipPoint => ({
    seriesIndex: 0,
    dataIndex: 0,
    label: 'Demand',
    x: 1,
    y: 1,
    color: '#000',
    formattedX,
    formattedY,
  });

  it('reuses geometry for changing numeric values with the same width', () => {
    expect(tooltipMeasurementKey([point('19°C', '1.2 kW')])).toBe(
      tooltipMeasurementKey([point('24°C', '1.8 kW')]),
    );
  });

  it('invalidates geometry when displayed widths or fields change', () => {
    expect(tooltipMeasurementKey([point('9°C', '1.2 kW')])).not.toBe(
      tooltipMeasurementKey([point('19°C', '1.25 kW')]),
    );
  });

  it('avoids forced size reads while a same-shape scatter tooltip follows touch', () => {
    let widthReads = 0;
    let heightReads = 0;
    const element = {
      style: { cssText: '' } as Record<string, string>,
      innerHTML: '',
      appendChild: vi.fn(),
      remove: vi.fn(),
      get offsetWidth() { widthReads++; return 120; },
      get offsetHeight() { heightReads++; return 44; },
    };
    vi.stubGlobal('document', {
      createElement: () => element,
      body: { appendChild: vi.fn() },
      documentElement: { clientWidth: 390, clientHeight: 844 },
    });
    vi.stubGlobal('window', { innerWidth: 390, innerHeight: 844 });

    const manager = new TooltipManager(lightTheme);
    manager.show([point('19°C', '1.2 kW')], 200, 400, undefined, 'touch');
    manager.show([point('24°C', '1.8 kW')], 205, 405, undefined, 'touch');

    expect(widthReads).toBe(1);
    expect(heightReads).toBe(1);
    expect(element.style.transform).toContain('translate3d(');
    manager.destroy();
    vi.unstubAllGlobals();
  });
});
