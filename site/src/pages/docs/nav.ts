/**
 * Docs navigation data and route helpers, in their own module so the
 * sidebar, search, cross-links, and the Docs shell can all import them
 * without creating import cycles.
 */
export interface DocsNavItem {
  id: string;
  label: string;
}

export interface DocsGroup {
  slug: string;
  label: string;
  items: DocsNavItem[];
}

/**
 * Ordered navigation for the docs. Each group is its own routed page at
 * `#/docs/<slug>`; items are section anchors within that page, addressable
 * as `#/docs/<slug>/<id>`. The slug → component mapping lives in Docs.tsx.
 */
export const GROUPS: DocsGroup[] = [
  {
    slug: 'getting-started',
    label: 'Getting Started',
    items: [
      { id: 'install', label: 'Installation' },
      { id: 'quick-start', label: 'Quick Start' },
      { id: 'data-model', label: 'Data Model' },
    ],
  },
  {
    slug: 'chart-types',
    label: 'Chart Types',
    items: [
      { id: 'line', label: 'Line' },
      { id: 'area', label: 'Area' },
      { id: 'band', label: 'Band (Fill Between)' },
      { id: 'scatter', label: 'Scatter' },
      { id: 'heatmap', label: 'Density Heatmap' },
      { id: 'bar', label: 'Bar' },
      { id: 'histogram', label: 'Histogram' },
    ],
  },
  {
    slug: 'series-options',
    label: 'Series Options',
    items: [
      { id: 'interpolation', label: 'Interpolation' },
      { id: 'styling', label: 'Styling' },
      { id: 'line-dash', label: 'Line Dash' },
      { id: 'nan-gaps', label: 'NaN Gaps' },
      { id: 'dual-axis', label: 'Dual Y-Axis' },
    ],
  },
  {
    slug: 'scales-axes',
    label: 'Scales & Axes',
    items: [
      { id: 'linear-scale', label: 'Linear Scale' },
      { id: 'log-scale', label: 'Log Scale' },
      { id: 'time-scale', label: 'Time Scale' },
      { id: 'tick-format', label: 'Custom Tick Formatting' },
    ],
  },
  {
    slug: 'interactions',
    label: 'Interactions',
    items: [
      { id: 'interaction-modes', label: 'Interaction Modes' },
      { id: 'zoom', label: 'Zoom & Selection' },
      { id: 'pan', label: 'Pan' },
      { id: 'cursor', label: 'Cursor & Crosshair' },
      { id: 'touch', label: 'Touch Gestures' },
    ],
  },
  {
    slug: 'tooltips',
    label: 'Tooltips',
    items: [
      { id: 'tooltip-modes', label: 'Tooltip Modes' },
      { id: 'tooltip-custom', label: 'Custom Tooltip Renderer' },
      { id: 'tooltip-snap', label: 'Proximity & Snap' },
    ],
  },
  {
    slug: 'theming',
    label: 'Theming',
    items: [
      { id: 'themes-builtin', label: 'Built-in Themes' },
      { id: 'themes-custom', label: 'Custom Theme' },
      { id: 'css-vars', label: 'CSS Variables' },
    ],
  },
  {
    slug: 'data',
    label: 'Data',
    items: [
      { id: 'streaming', label: 'Streaming' },
      { id: 'downsampling', label: 'Downsampling' },
    ],
  },
  {
    slug: 'plugins',
    label: 'Plugins',
    items: [
      { id: 'reference-lines', label: 'Reference Lines' },
      { id: 'legend-plugin', label: 'Legend Plugin' },
      { id: 'legend-table', label: 'Legend Table' },
      { id: 'cross-chart-sync', label: 'Cross-chart Sync' },
      { id: 'cursor-snapshot', label: 'Cursor Snapshot' },
      { id: 'custom-plugins', label: 'Custom Plugins' },
    ],
  },
  {
    slug: 'recipes',
    label: 'Recipes',
    items: [
      { id: 'recipe-streaming', label: 'Streaming Dashboard' },
      { id: 'recipe-linked', label: 'Linked Charts' },
      { id: 'recipe-brush', label: 'Brush Selection' },
      { id: 'recipe-scatter-encoding', label: 'Encoded Scatter' },
      { id: 'recipe-custom-tooltip', label: 'Custom Tooltip' },
      { id: 'recipe-custom-plugin', label: 'Custom Plugin' },
      { id: 'recipe-theming', label: 'Theming' },
      { id: 'recipe-downsampling', label: 'Downsampling' },
      { id: 'recipe-gaps', label: 'Gaps & spanGaps' },
      { id: 'recipe-ticks', label: 'Ticks & Gridlines' },
      { id: 'recipe-axis-titles', label: 'Axis Titles' },
    ],
  },
  {
    slug: 'api',
    label: 'API Reference',
    items: [
      { id: 'api-methods', label: 'ChartInstance Methods' },
      { id: 'api-events', label: 'Events' },
      { id: 'api-scatter-options', label: 'Scatter Options' },
      { id: 'api-types', label: 'Types' },
    ],
  },
];

export const DEFAULT_SLUG = GROUPS[0].slug;

/** Hash fragment for a docs page (`#/docs/<slug>`) or section within it. */
export function docsHash(slug: string, id?: string): string {
  return id ? `#/docs/${slug}/${id}` : `#/docs/${slug}`;
}

/** Parse `#/docs[/<slug>[/<id>]]` out of a location hash. */
export function parseDocsRoute(hash: string): { slug: string; anchor: string | null } {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  // parts[0] is 'docs'.
  const slug = parts[1] && GROUPS.some((g) => g.slug === parts[1]) ? parts[1] : DEFAULT_SLUG;
  const anchor = parts[2] ?? null;
  return { slug, anchor };
}

/** Scroll to a section anchor, offset by the sticky top nav height. */
export function scrollTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const navHeight = 56 + 16;
  const y = el.getBoundingClientRect().top + window.scrollY - navHeight;
  window.scrollTo({ top: y, behavior: 'smooth' });
}
