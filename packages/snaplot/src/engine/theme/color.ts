/**
 * The colour parser (plan §3.1, §5.3): the W5 contract `parseColor(css) → RGBA` (§3.2), created by
 * M9b over the parser of the time, which M11 owns and makes the only one (every user colour
 * resolved once to RGBA, `withAlpha` included; arch-02). Today it serves the places that reason
 * about a CSS colour: dark-background detection (indicator rings, tooltip shadows, role-palette
 * selection), alpha application (area gradients) and opaque grid strokes.
 *
 * Hex (3/4/6/8 digit), rgb()/rgba() with comma or space syntax and a few common names parse
 * without the DOM; any other colour the page can paint (every CSS name, hsl(), oklch(),
 * color-mix()) is painted once on a 1×1 canvas and read back, cached per string. `var()` needs an
 * element's cascade: `resolveColor`. Without a DOM, or for a value that is not a colour, the
 * result is null and callers keep their fallback.
 */

/** A parsed colour: sRGB channels 0–255 and alpha 0–1. */
export interface RGBA {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

const NAMED_COLORS: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  transparent: [255, 255, 255],
};

/**
 * Parse a CSS colour to RGBA, or null when it is not one. Alpha comes from `transparent` (0), the
 * fourth digit of `#rgba`, the last pair of `#rrggbbaa`, or the alpha of `rgba(r, g, b, a)` and
 * `rgb(r g b / a)` (a number or a percentage); otherwise 1.
 */
export function parseColor(color: string): RGBA | null {
  const c = color.trim().toLowerCase();
  return parseFast(c) ?? (c.includes('var(') ? null : paintedColor(c));
}

/**
 * Resolve a colour in `element`'s cascade, so `var(--accent)` reads the custom property where the
 * chart sits. Each call reads the cascade afresh (a theme switch changes it); call it when options
 * or the theme change, never per frame.
 */
export function resolveColor(color: string, element: Element | null): RGBA | null {
  if (!color.includes('var(')) return parseColor(color);
  if (!element || typeof document === 'undefined' || typeof getComputedStyle === 'undefined')
    return null;
  const probe = document.createElement('span');
  probe.style.display = 'none';
  probe.style.color = color;
  // The CSSOM rejects a value it cannot parse; the probe would then inherit the text colour.
  if (probe.style.color === '') return null;
  element.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  return computed ? parseColor(computed) : null;
}

/** An RGBA as the CSS the canvas paints: `rgb()` when opaque, else `rgba()`. */
export function cssColor({ r, g, b, a }: RGBA): string {
  const rgb = `${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}`;
  return a >= 1 ? `rgb(${rgb})` : `rgba(${rgb}, ${Math.round(a * 1000) / 1000})`;
}

/**
 * Whether a string is a CSS colour: false only when the page can say so (`CSS.supports`), so a
 * check without a DOM never rejects a colour it cannot read. `var()` is a colour until resolved.
 */
export function isCssColor(color: string): boolean {
  if (parseFast(color.trim().toLowerCase())) return true;
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return true;
  return CSS.supports('color', color);
}

/** The colours the canvas painted, by normalized string (null: not a colour). */
const paintedCache = new Map<string, RGBA | null>();
let paintProbe: CanvasRenderingContext2D | null | undefined;

/** Paint a colour on a 1×1 canvas and read it back: any colour space the canvas accepts. */
function paintedColor(c: string): RGBA | null {
  const cached = paintedCache.get(c);
  if (cached !== undefined) return cached;
  if (typeof document === 'undefined' || !isCssColor(c)) return null;
  paintProbe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!paintProbe || typeof paintProbe.getImageData !== 'function') return null;
  const ctx = paintProbe;
  ctx.canvas.width = 1;
  ctx.canvas.height = 1;
  // The canvas keeps its previous fillStyle for input it rejects: two different sentinels tell
  // a rejected value from one that happens to equal a sentinel.
  ctx.fillStyle = '#010203';
  ctx.fillStyle = c;
  const first = ctx.fillStyle;
  ctx.fillStyle = '#030201';
  ctx.fillStyle = c;
  let result: RGBA | null = null;
  if (first !== '#010203' || ctx.fillStyle !== '#030201') {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    // Premultiplied readback loses the channels of a fully transparent colour.
    result = a === 0 ? { r: 0, g: 0, b: 0, a: 0 } : { r, g, b, a: a / 255 };
  }
  if (paintedCache.size >= 256) paintedCache.clear();
  paintedCache.set(c, result);
  return result;
}

/** The DOM-free parse of a normalized (trimmed, lowercase) colour. */
function parseFast(c: string): RGBA | null {
  const named = NAMED_COLORS[c];
  if (named) return { r: named[0], g: named[1], b: named[2], a: alphaOf(c) };

  if (c.startsWith('#')) {
    const hex = c.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
      return { r, g, b, a: alphaOf(c) };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
      return { r, g, b, a: alphaOf(c) };
    }
    return null;
  }

  const rgbMatch = c.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (rgbMatch) {
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3]),
      a: alphaOf(c),
    };
  }

  return null;
}

/** The alpha of a normalized (trimmed, lowercase) colour `parseColor` read, 1 when it gives none. */
function alphaOf(normalized: string): number {
  if (normalized === 'transparent') return 0;
  if (/^#[\da-f]{4}$/i.test(normalized)) return parseInt(normalized[4], 16) / 15;
  if (/^#[\da-f]{8}$/i.test(normalized)) return parseInt(normalized.slice(7), 16) / 255;
  const match = normalized.match(/(?:\/|,\s*[\d.]+\s*,\s*[\d.]+\s*,)\s*([\d.]+%?)\s*\)$/);
  if (match) return match[1].endsWith('%') ? parseFloat(match[1]) / 100 : Number(match[1]);
  return 1;
}

/**
 * Perceived-luminance dark check (ITU-R BT.601 weights). `fallback` is
 * returned for colors parseColor cannot handle, so each call site keeps
 * a deliberate default instead of a silently wrong classification.
 */
export function isDarkColor(color: string, fallback: boolean): boolean {
  const rgb = parseColor(color);
  if (!rgb) return fallback;
  const luma = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  return luma < 128;
}

/** Apply alpha to any parseable color; falls back to the input unchanged. */
export function withAlpha(color: string, alpha: number): string {
  const rgb = parseColor(color);
  if (!rgb) return color;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

/**
 * Flatten a stroke onto the opaque chart surface before painting it. Painting
 * the resulting opaque color keeps grid intersections from accumulating alpha.
 */
export function opaqueColorOnBackground(
  color: string,
  opacity: number,
  background: string,
): string {
  // Every grid paint asks again with the same few strokes: answer from the recent ones, compared
  // by value, so a frame neither parses nor builds a string.
  for (const entry of opaqueRecent) {
    if (entry.color === color && entry.opacity === opacity && entry.background === background)
      return entry.result;
  }
  const result = blendOpaque(color, opacity, background);
  opaqueRecent[opaqueNext] = { color, opacity, background, result };
  opaqueNext = (opaqueNext + 1) % OPAQUE_RECENT;
  return result;
}

const OPAQUE_RECENT = 8;
const opaqueRecent: { color: string; opacity: number; background: string; result: string }[] = [];
let opaqueNext = 0;

function blendOpaque(color: string, opacity: number, background: string): string {
  const foreground = parseColor(color);
  const surface = parseColor(background);
  const alpha = Math.max(0, Math.min(1, opacity));
  if (!foreground || !surface) return color;
  const combined = alpha * Math.max(0, Math.min(1, foreground.a));
  const blend = (channel: number, under: number) =>
    Math.round(under + (channel - under) * combined);
  return `rgb(${blend(foreground.r, surface.r)},${blend(foreground.g, surface.g)},${blend(foreground.b, surface.b)})`;
}
