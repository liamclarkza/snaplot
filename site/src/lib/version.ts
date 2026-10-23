/**
 * The library version the site documents, read from the package it builds against, and the
 * install string that follows from it (D1): a prerelease installs from the `next` dist-tag.
 */
import pkg from 'snaplot/package.json' with { type: 'json' };

export const version: string = pkg.version;
export const isPrerelease = version.includes('-');
/** "1.0" for 1.0.0-beta.0. */
export const releaseLine = version.split('.').slice(0, 2).join('.');

export function installCommand(v: string = version): string {
  return v.includes('-') ? 'npm i snaplot@next' : 'npm i snaplot';
}

/** Runtime dependencies of the published package (the fact line on the homepage). */
export const dependencyCount = Object.keys(
  (pkg as { dependencies?: Record<string, string> }).dependencies ?? {},
).length;
