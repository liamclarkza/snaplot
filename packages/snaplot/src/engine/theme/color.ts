/**
 * The colour parser (plan §3.1, §5.3): the W5 contract `parseColor(css) → RGBA` (§3.2), created by
 * M9b over the parser of the time, which M11 owns and makes the only one (every user colour
 * resolved once to RGBA, `withAlpha` included; arch-02). Today it serves the places that reason
 * about a CSS colour: dark-background detection (indicator rings, tooltip shadows, role-palette
 * selection), alpha application (area gradients) and opaque grid strokes.
 *
 * Scope is deliberately small: hex (3/4/6/8 digit), rgb()/rgba() with comma or space syntax, and
 * the named colors that plausibly appear as chart backgrounds. Anything else returns null and
 * callers keep their existing fallback behavior.
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
 * Parse a CSS colour to RGBA, or null when unsupported. Alpha comes from `transparent` (0), the
 * fourth digit of `#rgba`, the last pair of `#rrggbbaa`, or the alpha of `rgba(r, g, b, a)` and
 * `rgb(r g b / a)` (a number or a percentage); otherwise 1.
 */
export function parseColor(color: string): RGBA | null {
  const c = color.trim().toLowerCase();

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
  const foreground = parseColor(color);
  const surface = parseColor(background);
  const alpha = Math.max(0, Math.min(1, opacity));
  if (foreground && surface) {
    const combined = alpha * Math.max(0, Math.min(1, foreground.a));
    const blend = (channel: number, under: number) =>
      Math.round(under + (channel - under) * combined);
    return `rgb(${blend(foreground.r, surface.r)},${blend(foreground.g, surface.g)},${blend(foreground.b, surface.b)})`;
  }

  // Per-axis colors may use CSS color spaces that aren't in the small parser.
  // Cache the browser's conversion so pan/zoom frames do not read back pixels.
  const key = `${color}|${alpha}|${background}`;
  const cached = opaqueColorCache.get(key);
  if (cached) return cached;
  if (typeof document === 'undefined') return color;
  colorProbe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!colorProbe) return color;
  colorProbe.canvas.width = 1;
  colorProbe.canvas.height = 1;
  colorProbe.fillStyle = background;
  colorProbe.fillRect(0, 0, 1, 1);
  colorProbe.globalAlpha = alpha;
  colorProbe.fillStyle = color;
  colorProbe.fillRect(0, 0, 1, 1);
  const pixel = colorProbe.getImageData(0, 0, 1, 1).data;
  const result = `rgb(${pixel[0]},${pixel[1]},${pixel[2]})`;
  if (opaqueColorCache.size >= 128) opaqueColorCache.clear();
  opaqueColorCache.set(key, result);
  return result;
}

const opaqueColorCache = new Map<string, string>();
let colorProbe: CanvasRenderingContext2D | null | undefined;
