import { describe, expect, it, vi } from 'vitest';
import { renderAxes } from '../axes/render';
import type { ChartSpec, Layout, Scale, ThemeConfig } from '../spec';
import { crisp } from './crisp';

describe('crisp (render/crisp.ts, the W5 snapping contract)', () => {
  it('snaps to a device-pixel centre at odd DPRs and a device-pixel boundary at even ones', () => {
    expect(crisp(10.4, 1)).toBe(10.5);
    expect(crisp(10.6, 1)).toBe(11.5);
    expect(crisp(10, 1)).toBe(10.5);
    expect(crisp(10.4, 2)).toBe(10.5);
    expect(crisp(10.5, 2)).toBe(10.5);
    expect(crisp(10.4, 3)).toBeCloseTo(31.5 / 3);
    expect(crisp(10.4, 1.25)).toBe(13.5 / 1.25);
    expect(crisp(-0.4, 1)).toBe(0.5);
  });

  it('places every grid, tick and frame stroke of an axis paint on a crisp coordinate', () => {
    for (const dpr of [1, 2]) {
      const lines: number[][] = [];
      const ctx = {
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        clip: vi.fn(),
        stroke: vi.fn(),
        fillRect: vi.fn(),
        setLineDash: vi.fn(),
        measureText: (text: string) => ({ width: text.length * 7 }) as TextMetrics,
        moveTo: (x: number, y: number) => lines.push([x, y]),
        lineTo: (x: number, y: number) => lines.push([x, y]),
        rect: (x: number, y: number, w: number, h: number) => lines.push([x, y, x + w, y + h]),
      } as unknown as CanvasRenderingContext2D;
      const scale = (key: string, from: number, to: number): Scale =>
        ({
          key,
          type: 'linear',
          min: 0,
          max: 10,
          dataToPixel: (v: number) => from + ((to - from) * v) / 10,
          pixelToData: (p: number) => p,
          ticks: () => [0, 2.5, 5, 7.5, 10],
          tickFormat: String,
          nice: () => {},
          setPixelRange: () => {},
        }) as Scale;
      const layout: Layout = {
        width: 200,
        height: 120,
        plot: { left: 30.3, top: 8.6, width: 150.2, height: 90.7 },
        axes: {
          x: { position: 'bottom', area: { left: 30.3, top: 99.3, width: 150.2, height: 20 } },
          y: { position: 'left', area: { left: 0, top: 8.6, width: 30.3, height: 90.7 } },
        },
        dpr,
      };
      const theme = {
        backgroundColor: '#ffffff',
        gridColor: '#cccccc',
        gridOpacity: 1,
        axisLineColor: '#999999',
        textColor: '#000000',
        fontFamily: 'sans-serif',
        fontSize: 11,
      } as unknown as ThemeConfig;
      renderAxes(
        ctx,
        layout,
        new Map([
          ['x', scale('x', 30.3, 180.5)],
          ['y', scale('y', 99.3, 8.6)],
        ]),
        theme,
        { series: [], axes: { x: {}, y: {} } } as unknown as ChartSpec,
      );
      // Clip rectangles are not strokes; every other coordinate is one crisp() produced.
      const strokes = lines.filter(
        (line) => !(line.length === 4 && line[0] === 30.3 && line[1] === 8.6),
      );
      expect(strokes.length).toBeGreaterThan(10);
      for (const line of strokes) {
        // A crisp coordinate sits on a device-pixel centre (odd DPR) or boundary (even DPR).
        const phase = dpr % 2 === 1 ? 0.5 : 0;
        const snapped = line.some((v) => Math.abs(((((v * dpr) % 1) + 1) % 1) - phase) < 1e-9);
        expect(snapped, `${line} at dpr ${dpr}`).toBe(true);
      }
    }
  });
});
