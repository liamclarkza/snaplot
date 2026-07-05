import { describe, expect, it } from 'vitest';
import {
  PALETTE_SEQUENTIAL_DARK,
  PALETTE_SEQUENTIAL_LIGHT,
} from '../constants';
import type { ThemeConfig } from '../types';
import {
  resolveTheme,
  lightTheme,
  darkTheme,
  studioTheme,
  tokyoTheme,
  oceanTheme,
  forestTheme,
  violetTheme,
  fogTheme,
  ivoryTheme,
  mintTheme,
  sunsetTheme,
  midnightTheme,
  marsTheme,
  refinedDarkTheme,
} from './theme';

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

  it('chooses dark ramps for a dark named background', () => {
    const theme = resolveTheme({} as HTMLElement, {
      backgroundColor: 'black',
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

/**
 * Guard for the shipped named themes. Every one is hand-tuned, so this asserts
 * the two properties a machine can check that a human eye cannot guarantee at
 * review time: WCAG AA text/tick contrast, and presence of the role palettes.
 */
const NAMED_THEMES: Record<string, ThemeConfig> = {
  lightTheme,
  darkTheme,
  studioTheme,
  tokyoTheme,
  oceanTheme,
  forestTheme,
  violetTheme,
  fogTheme,
  ivoryTheme,
  mintTheme,
  sunsetTheme,
  midnightTheme,
  marsTheme,
  refinedDarkTheme,
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.trim().replace('#', '');
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Relative luminance per the WCAG 2.x sRGB definition. */
function relativeLuminance(hex: string): number {
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio in the range 1..21. */
function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

describe('named theme guard', () => {
  const AA_SMALL_TEXT = 4.5;

  for (const [name, theme] of Object.entries(NAMED_THEMES)) {
    it(`${name} clears WCAG AA for text and ticks`, () => {
      expect(contrastRatio(theme.textColor, theme.backgroundColor)).toBeGreaterThanOrEqual(
        AA_SMALL_TEXT,
      );
      expect(contrastRatio(theme.tickColor, theme.backgroundColor)).toBeGreaterThanOrEqual(
        AA_SMALL_TEXT,
      );
    });

    it(`${name} defines the categorical, sequential, and heatmap role palettes`, () => {
      const categorical = theme.categoricalPalette ?? theme.palette;
      expect(categorical?.length ?? 0).toBeGreaterThan(0);
      expect(theme.sequentialPalette?.length ?? 0).toBeGreaterThan(0);
      expect(theme.heatmapGradient?.length ?? 0).toBeGreaterThan(0);
    });
  }
});
