// Node-only helper for the specs (kept in .mjs because the test tsconfig has no Node types).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Writes a Chromium profile whose minimum font size is `px` (the pref a user sets under
 * Settings → Appearance → Customize fonts). Used by fixtures with `minFontSize`
 * (gap-environments-07); there is no CDP command for it.
 */
export function writeMinFontProfile(dir, px) {
  mkdirSync(join(dir, 'Default'), { recursive: true });
  const prefs = { webkit: { webprefs: { minimum_font_size: px, minimum_logical_font_size: px } } };
  writeFileSync(join(dir, 'Default', 'Preferences'), JSON.stringify(prefs));
}
