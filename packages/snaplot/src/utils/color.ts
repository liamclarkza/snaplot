/**
 * Shared color parsing for the handful of places that need to reason
 * about a user-supplied CSS color: dark-background detection (indicator
 * rings, tooltip shadows, role-palette selection) and alpha application
 * (area gradients). Four call sites previously hand-rolled parsers that
 * each mishandled 3-digit hex and named colors.
 *
 * Scope is deliberately small: hex (3/4/6/8 digit), rgb()/rgba() with
 * comma or space syntax, and the named colors that plausibly appear as
 * chart backgrounds. Anything else returns null and callers keep their
 * existing fallback behavior.
 */

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

/** Parse a CSS color to [r, g, b] in 0-255, or null when unsupported. */
export function parseColor(color: string): [number, number, number] | null {
  const c = color.trim().toLowerCase();

  const named = NAMED_COLORS[c];
  if (named) return [named[0], named[1], named[2]];

  if (c.startsWith('#')) {
    const hex = c.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
      return [r, g, b];
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
      return [r, g, b];
    }
    return null;
  }

  const rgbMatch = c.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (rgbMatch) {
    return [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
  }

  return null;
}

/**
 * Perceived-luminance dark check (ITU-R BT.601 weights). `fallback` is
 * returned for colors parseColor cannot handle, so each call site keeps
 * a deliberate default instead of a silently wrong classification.
 */
export function isDarkColor(color: string, fallback: boolean): boolean {
  const rgb = parseColor(color);
  if (!rgb) return fallback;
  const luma = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  return luma < 128;
}

/** Apply alpha to any parseable color; falls back to the input unchanged. */
export function withAlpha(color: string, alpha: number): string {
  const rgb = parseColor(color);
  if (!rgb) return color;
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}
