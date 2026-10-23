/**
 * When the fixture app reports a fixture ready (paint.ts). A capture once showed DOM labels over
 * blank canvases, so a fixture counts as painted only once its canvases have ink; M3a review #3
 * asked for a way to declare that neither layer will (plan §5.1's empty state, M10).
 */
import { describe, expect, it } from 'vitest';
import { inkLayer, paintReady } from './paint';

const rendered = { grid: 1, data: 1 };

describe('fixture paint readiness', () => {
  it('waits for both layers to render', () => {
    expect(paintReady({}, { renderCount: null, gridInk: 10, dataInk: 10 })).toBe(false);
    expect(paintReady({}, { renderCount: { grid: 1, data: 0 }, gridInk: 10, dataInk: 10 })).toBe(
      false,
    );
    expect(paintReady({}, { renderCount: rendered, gridInk: 10, dataInk: 10 })).toBe(true);
  });

  it('needs data-layer ink by default', () => {
    expect(inkLayer({})).toBe('data');
    expect(paintReady({}, { renderCount: rendered, gridInk: 10, dataInk: 0 })).toBe(false);
  });

  it('needs grid-layer ink for a fixture with blankData', () => {
    const fixture = { blankData: 'no data' };
    expect(inkLayer(fixture)).toBe('grid');
    expect(paintReady(fixture, { renderCount: rendered, gridInk: 0, dataInk: 0 })).toBe(false);
    expect(paintReady(fixture, { renderCount: rendered, gridInk: 10, dataInk: 0 })).toBe(true);
  });

  it('needs no ink when blankGrid says the grid is blank too, only both renders', () => {
    const fixture = { blankData: 'no data', blankGrid: 'the §5.1 empty state draws no grid' };
    expect(inkLayer(fixture)).toBeNull();
    expect(paintReady(fixture, { renderCount: rendered, gridInk: 0, dataInk: 0 })).toBe(true);
    expect(paintReady(fixture, { renderCount: { grid: 0, data: 1 }, gridInk: 0, dataInk: 0 })).toBe(
      false,
    );
  });
});
