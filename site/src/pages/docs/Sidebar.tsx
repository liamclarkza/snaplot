import { createSignal, createEffect, onCleanup, For, Show } from 'solid-js';
import type { Accessor } from 'solid-js';

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

/**
 * Docs sidebar, desktop: static sticky aside. Mobile: slide-out drawer
 * with a floating hamburger trigger (styled via .docs-menu-btn /
 * .docs-sidebar classes in global.css).
 *
 * Links are real anchors (`#/docs/<slug>/<id>`), so middle-click and
 * copy-link work; the Docs shell reacts to the hashchange and handles
 * page swaps and anchor scrolling.
 */
export function Sidebar(props: { activeSlug: string; activeId?: string | null }) {
  const [sidebarOpen, setSidebarOpen] = createSignal(false);
  return (
    <SidebarUI
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      activeSlug={props.activeSlug}
      activeId={props.activeId ?? null}
    />
  );
}

export function SidebarUI(props: {
  sidebarOpen: Accessor<boolean>;
  setSidebarOpen: (v: boolean) => void;
  activeSlug: string;
  activeId: string | null;
}) {
  let navTarget: string | null = null;
  let triggerRef!: HTMLButtonElement;
  let drawerRef!: HTMLElement;
  let wasOpen = false;

  // Lock the page behind the drawer while it's open. Previously we
  // used the position:fixed + saved-scroll-offset dance, but rapid
  // toggling jumped the viewport around, every close ran a fresh
  // `window.scrollTo()`, and the body style swap caused reflows that
  // compounded on each click. `overflow:hidden` on <html> locks the
  // page in place without moving it, works fine across browsers, and
  // is idempotent so it survives any number of rapid clicks.
  createEffect(() => {
    const open = props.sidebarOpen();
    const html = document.documentElement;
    if (open) {
      html.style.overflow = 'hidden';
      requestAnimationFrame(() => {
        const first = drawerRef?.querySelector<HTMLAnchorElement>('a');
        first?.focus();
      });
    } else {
      html.style.overflow = '';
      if (wasOpen) triggerRef?.focus();
      if (navTarget) {
        const target = navTarget;
        navTarget = null;
        // Deferred navigation: the hash change happens only after the
        // drawer has released its scroll lock, so the anchor scroll works.
        requestAnimationFrame(() => {
          window.location.hash = target;
        });
      }
    }
    wasOpen = open;
  });
  onCleanup(() => {
    document.documentElement.style.overflow = '';
  });

  createEffect(() => {
    if (!props.sidebarOpen()) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.setSidebarOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => document.removeEventListener('keydown', onKeyDown));
  });

  function navClick(event: MouseEvent, hash: string) {
    if (props.sidebarOpen()) {
      // In the drawer, defer the hash change until the scroll lock lifts.
      event.preventDefault();
      navTarget = hash;
      props.setSidebarOpen(false);
    }
    // Desktop: let the anchor set the hash; Docs reacts to hashchange.
  }

  const itemStyle = (active: boolean) => ({
    color: active ? 'var(--accent)' : 'var(--text-secondary)',
    'font-size': 'var(--fs-sm)',
    padding: '3px 0 3px 8px',
    'border-left': active ? '2px solid var(--accent)' : '2px solid transparent',
    'text-decoration': 'none',
    display: 'block',
  });

  return (
    <>
      {/* Mobile hamburger, visible below 768px via .docs-menu-btn media query. */}
      <button
        ref={triggerRef!}
        type="button"
        class="docs-menu-btn"
        aria-label={props.sidebarOpen() ? 'Close navigation' : 'Open navigation'}
        aria-expanded={props.sidebarOpen()}
        aria-controls="docs-sidebar"
        onClick={() => props.setSidebarOpen(!props.sidebarOpen())}
        style={{
          position: 'fixed',
          bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
          right: '20px',
          'z-index': '200',
          width: '48px',
          height: '48px',
          'border-radius': '50%',
          background: 'var(--accent)',
          border: 'none',
          color: '#fff',
          'font-size': '22px',
          'line-height': '1',
          cursor: 'pointer',
          display: 'none',
          'box-shadow': '0 4px 16px rgba(0,0,0,0.4)',
        }}
      >
        {props.sidebarOpen() ? (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <line x1="4" y1="4" x2="14" y2="14" /><line x1="14" y1="4" x2="4" y2="14" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <line x1="3" y1="5" x2="15" y2="5" /><line x1="3" y1="9" x2="15" y2="9" /><line x1="3" y1="13" x2="15" y2="13" />
          </svg>
        )}
      </button>

      {/* Mobile drawer scrim, a button so screen readers announce it and
         Escape/Enter dismiss the drawer. Visually reset to look like the
         semi-transparent overlay a div would give. */}
      <Show when={props.sidebarOpen()}>
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => props.setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: '0',
            background: 'rgba(0,0,0,0.5)',
            border: '0',
            cursor: 'pointer',
            padding: '0',
            'z-index': '149',
          }}
        />
      </Show>

      <aside
        ref={drawerRef!}
        id="docs-sidebar"
        role="navigation"
        aria-label="Documentation sections"
        class="docs-sidebar"
        classList={{ 'docs-sidebar-open': props.sidebarOpen() }}
        style={{
          'flex-shrink': '0',
          width: '190px',
          position: 'sticky',
          top: '72px',
          'align-self': 'flex-start',
          display: 'flex',
          'flex-direction': 'column',
          gap: '1px',
          'max-height': 'calc(100vh - 96px)',
          'overflow-y': 'auto',
        }}
      >
        <For each={GROUPS}>
          {(group) => (
            <>
              <a
                href={docsHash(group.slug)}
                onClick={(e) => navClick(e, docsHash(group.slug))}
                aria-current={group.slug === props.activeSlug ? 'page' : undefined}
                style={{
                  'font-size': '10.5px',
                  'font-weight': '600',
                  'text-transform': 'uppercase',
                  'letter-spacing': '0.08em',
                  color: group.slug === props.activeSlug ? 'var(--accent)' : 'var(--text-secondary)',
                  opacity: group.slug === props.activeSlug ? '1' : '0.5',
                  padding: 'var(--space-3) 0 var(--space-1)',
                  'text-decoration': 'none',
                  display: 'block',
                }}
              >
                {group.label}
              </a>
              <Show when={group.slug === props.activeSlug}>
                <For each={group.items}>
                  {(item) => (
                    <a
                      href={docsHash(group.slug, item.id)}
                      onClick={(e) => navClick(e, docsHash(group.slug, item.id))}
                      style={itemStyle(item.id === props.activeId)}
                    >
                      {item.label}
                    </a>
                  )}
                </For>
              </Show>
            </>
          )}
        </For>
      </aside>
    </>
  );
}
