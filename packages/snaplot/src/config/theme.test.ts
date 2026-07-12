import { afterEach, describe, expect, it, vi } from 'vitest';
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
  createTheme,
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

describe('createTheme semantic tokens', () => {
  it('maps product tokens onto the detailed theme roles', () => {
    const theme = createTheme({
      base: ivoryTheme,
      surface: 'container',
      text: 'var(--product-text)',
      muted: 'var(--product-muted)',
      accent: 'var(--product-accent)',
      categorical: ['#123456', '#abcdef'],
      tooltip: { surface: '#111', text: '#fff', border: '#333' },
    });

    expect(theme.backgroundColor).toBe('container');
    expect(theme.textColor).toBe('var(--product-text)');
    expect(theme.tickColor).toBe('var(--product-muted)');
    expect(theme.gridColor).toBe('var(--product-muted)');
    expect(theme.axisLineColor).toBe('var(--product-muted)');
    expect(theme.borderColor).toBe('var(--product-muted)');
    expect(theme.crosshairColor).toBe('var(--product-accent)');
    expect(theme.palette).toEqual(['#123456', '#abcdef']);
    expect(theme.categoricalPalette).toEqual(['#123456', '#abcdef']);
    expect(theme.tooltipBackground).toBe('#111');
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

describe('CSS variable and color-space resolution', () => {
  // A controllable DOM: the container carries custom properties, the probe
  // "computes" colors from a lookup table standing in for the browser's
  // color engine (var() resolution, oklch to rgb conversion).
  const COMPUTED: Record<string, string> = {
    'var(--surface)': 'rgb(20, 22, 31)',
    'var(--accent)': 'rgb(122, 162, 247)',
    'oklch(0.32 0.02 260)': 'rgb(40, 44, 60)',
  };

  // sRGB bytes the fake 1x1 canvas "paints" for colors the small parser
  // cannot read, standing in for the browser's color engine.
  const CANVAS_BYTES: Record<string, [number, number, number, number]> = {
    'oklch(0.32 0.02 260)': [40, 44, 60, 255],
  };

  function stubDom(containerVars: Record<string, string>) {
    const probes: Array<{ style: { display: string; _color: string } }> = [];
    const makeProbe = () => {
      const probe = {
        style: {
          display: '',
          _color: '',
          get color() {
            return this._color;
          },
          set color(v: string) {
            // The CSSOM keeps the previous value for unparseable input; our
            // stub accepts anything the lookup or a plain parser knows.
            this._color = v;
          },
        },
        remove: vi.fn(),
      };
      probes.push(probe as never);
      return probe;
    };
    const makeCanvas = () => {
      let fillStyle = '';
      return {
        getContext: () => ({
          canvas: { width: 0, height: 0 },
          get fillStyle() {
            return fillStyle;
          },
          set fillStyle(v: string) {
            // Mirror the canvas keeping its previous fillStyle for values
            // the (stub) color engine does not know.
            if (CANVAS_BYTES[v] || v === '#010203') fillStyle = v;
          },
          clearRect: () => {},
          fillRect: () => {},
          getImageData: () => ({ data: CANVAS_BYTES[fillStyle] ?? [0, 0, 0, 0] }),
        }),
      };
    };
    const container = {
      appendChild: vi.fn(),
      style: {},
    } as unknown as HTMLElement;

    vi.stubGlobal('document', {
      createElement: (tag: string) => (tag === 'canvas' ? makeCanvas() : makeProbe()),
    });
    vi.stubGlobal('getComputedStyle', (el: unknown) => {
      const probe = probes.find((p) => p === el);
      if (probe) {
        return { color: COMPUTED[probe.style._color] ?? probe.style._color };
      }
      // The container: expose custom properties.
      return {
        color: '',
        getPropertyValue: (name: string) => containerVars[name] ?? '',
      };
    });
    return container;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves var() references in user theme fields to computed colors', () => {
    const container = stubDom({});
    const theme = resolveTheme(container, {
      backgroundColor: 'var(--surface)',
      crosshairColor: 'var(--accent)',
    });
    expect(theme.backgroundColor).toBe('rgb(20, 22, 31)');
    expect(theme.crosshairColor).toBe('rgb(122, 162, 247)');
  });

  it('normalizes oklch backgrounds so dark detection picks dark role palettes', () => {
    const container = stubDom({});
    const theme = resolveTheme(container, {
      backgroundColor: 'oklch(0.32 0.02 260)',
    });
    expect(theme.backgroundColor).toBe('rgb(40, 44, 60)');
    // rgb(40,44,60) is dark: the sequential ramp must be the dark-anchored one.
    const darkDefault = resolveTheme(container, { backgroundColor: '#14161f' });
    expect(theme.sequentialPalette).toEqual(darkDefault.sequentialPalette);
  });

  it('reads --chart-* custom properties from the container', () => {
    const container = stubDom({
      '--chart-bg': '#101216',
      '--chart-text': '#e8eaed',
      '--chart-crosshair': 'var(--accent)',
    });
    const theme = resolveTheme(container);
    expect(theme.backgroundColor).toBe('#101216');
    expect(theme.textColor).toBe('#e8eaed');
    expect(theme.crosshairColor).toBe('rgb(122, 162, 247)');
  });

  it('copies the nearest opaque ancestor surface for backgroundColor: container', () => {
    const parent = { parentElement: null } as unknown as HTMLElement;
    const container = { parentElement: parent } as unknown as HTMLElement;
    vi.stubGlobal('getComputedStyle', (el: HTMLElement) => ({
      backgroundColor: el === parent ? 'rgb(250, 248, 242)' : 'rgba(0, 0, 0, 0)',
      getPropertyValue: () => '',
    }));

    const theme = resolveTheme(container, { backgroundColor: 'container' });

    expect(theme.backgroundColor).toBe('rgb(250, 248, 242)');
  });

  it('normalizes palette entries to hex so gradient interpolation works', () => {
    const container = stubDom({});
    const theme = resolveTheme(container, {
      heatmapGradient: ['var(--surface)', 'var(--accent)'],
    });
    expect(theme.heatmapGradient).toEqual(['#14161f', '#7aa2f7']);
  });

  it('leaves plain parseable colors untouched without touching the DOM', () => {
    const container = stubDom({});
    const theme = resolveTheme(container, { backgroundColor: '#123456' });
    expect(theme.backgroundColor).toBe('#123456');
    expect((container.appendChild as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });
});
