import { describe, expect, it } from 'vitest';
import {
  PALETTE_SEQUENTIAL_DARK,
  PALETTE_SEQUENTIAL_LIGHT,
} from '../constants';
import { resolveTheme } from './theme';

describe('resolveTheme palette roles', () => {
  it('fills heatmap roles from the light defaults', () => {
    const theme = resolveTheme({} as HTMLElement);

    expect(theme.sequentialPalette).toEqual([...PALETTE_SEQUENTIAL_LIGHT]);
    expect(theme.heatmapGradient).toEqual([...PALETTE_SEQUENTIAL_LIGHT]);
  });

  it('uses the caller palette as the categorical palette', () => {
    const theme = resolveTheme({} as HTMLElement, {
      palette: ['#123456', '#abcdef'],
    });

    expect(theme.palette).toEqual(['#123456', '#abcdef']);
    expect(theme.categoricalPalette).toEqual(['#123456', '#abcdef']);
  });

  it('chooses dark ordered ramps for custom dark themes without role palettes', () => {
    const theme = resolveTheme({} as HTMLElement, {
      backgroundColor: '#101318',
      palette: ['#7aa2f7', '#9ece6a'],
    });

    expect(theme.sequentialPalette).toEqual([...PALETTE_SEQUENTIAL_DARK]);
    expect(theme.heatmapGradient).toEqual([...PALETTE_SEQUENTIAL_DARK]);
  });

  it('uses explicit heatmap gradients before sequential palettes', () => {
    const theme = resolveTheme({} as HTMLElement, {
      sequentialPalette: ['#111111', '#222222'],
      heatmapGradient: ['#333333', '#444444'],
    });

    expect(theme.sequentialPalette).toEqual(['#111111', '#222222']);
    expect(theme.heatmapGradient).toEqual(['#333333', '#444444']);
  });
});
