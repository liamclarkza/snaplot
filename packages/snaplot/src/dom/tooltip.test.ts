import { describe, expect, it, vi } from 'vitest';
import { computeTooltipPosition, sliceSvg, TooltipManager, tooltipMeasurementKey } from './tooltip';
import type { TooltipPoint } from '../engine/spec';
import { lightTheme } from '../engine/theme/resolve';

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

  it('opens left of the cursor when asked, and right where the left has no room', () => {
    expect(computeTooltipPosition({ ...base, side: 'left' })).toEqual({ left: 208, top: 312 });
    expect(computeTooltipPosition({ ...base, side: 'left', clientX: 150 })).toEqual({
      left: 162,
      top: 312,
    });
  });

  it('flips above the cursor near the bottom viewport edge', () => {
    expect(computeTooltipPosition({ ...base, clientY: 570 })).toEqual({ left: 412, top: 458 });
  });

  it('clamps oversized edge cases to a readable viewport margin', () => {
    expect(
      computeTooltipPosition({
        ...base,
        clientX: 4,
        clientY: 4,
        width: 900,
        height: 700,
      }),
    ).toEqual({ left: 8, top: 8 });
  });

  it('keeps touch tooltips centred above the finger when space permits', () => {
    expect(computeTooltipPosition({ ...base, pointerType: 'touch' })).toEqual({
      left: 310,
      top: 128,
    });
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
      setAttribute: vi.fn(),
      remove: vi.fn(),
      get offsetWidth() {
        widthReads++;
        return 120;
      },
      get offsetHeight() {
        heightReads++;
        return 44;
      },
    };
    vi.stubGlobal('document', {
      createElement: () => element,
      body: { appendChild: vi.fn() },
      documentElement: { clientWidth: 390, clientHeight: 844 },
      fullscreenElement: null,
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

describe('sliceSvg', () => {
  const profile = (length: number[], bin = -1) => ({
    from: Float64Array.from(length.map((_, i) => i / length.length)),
    to: Float64Array.from(length.map((_, i) => (i + 1) / length.length)),
    length: Float64Array.from(length),
    bin,
  });
  const paths = (svg: string) => [...svg.matchAll(/ d="([^"]*)"/g)].map((match) => match[1]);

  it('draws a bar per bin on a baseline, bars of one height as one', () => {
    const [bars, baseline] = paths(sliceSvg(profile([0.5, 0.5, 1, 0])));
    expect(bars).toBe('M0 44V22.5H84V44ZM84 44V1H126V44Z');
    expect(baseline).toBe('M0 44.5H168');
  });

  it('leaves an empty cell out and marks the bin under the pointer', () => {
    const svg = sliceSvg(profile([1, Number.NaN, 0.5, 0.25], 2));
    const [bars, marked] = paths(svg);
    expect(bars).toBe('M0 44V1H42V44ZM84 44V22.5H126V44ZM126 44V33.3H168V44Z');
    expect(marked).toBe('M84 44V22.5H126V44Z');
    expect(svg).toContain('<rect x="84" width="42" height="44"');
  });

  it('keeps a row of thousands of bins a small picture: the tallest bin per pixel column', () => {
    const length = Array.from({ length: 4000 }, (_, i) => (i % 2 ? 1 : 0.1));
    const [bars] = paths(sliceSvg(profile(length)));
    expect(bars).toBe('M0 44V1H168V44Z');
  });
});
