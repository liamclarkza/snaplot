import { createSignal, createEffect, onCleanup, Show, For } from 'solid-js';
import type { Component } from 'solid-js';
import { Prose } from '../components/ui';
import { Sidebar, GROUPS, parseDocsRoute, docsHash, scrollTo } from './docs/Sidebar';
import {
  GettingStarted,
  ChartTypes,
  SeriesOptions,
  Scales,
  Interactions,
  Tooltips,
  Theming,
  Data,
  Plugins,
  Recipes,
  ApiReference,
} from './docs/sections';
// In dev/build the site aliases `snaplot` → src/index.ts, so we import the CSS
// directly from the package source. Published consumers use `'snaplot/legend-table.css'`.
import '../../../packages/snaplot/src/styles/legendTable.css';

const PAGE_COMPONENTS: Record<string, Component> = {
  'getting-started': GettingStarted,
  'chart-types': ChartTypes,
  'series-options': SeriesOptions,
  'scales-axes': Scales,
  interactions: Interactions,
  tooltips: Tooltips,
  theming: Theming,
  data: Data,
  plugins: Plugins,
  recipes: Recipes,
  api: ApiReference,
};

export default function Docs() {
  const [route, setRoute] = createSignal(parseDocsRoute(window.location.hash));

  const onHash = () => {
    const prev = route();
    const next = parseDocsRoute(window.location.hash);
    setRoute(next);
    if (next.anchor) {
      // Same page: smooth-scroll now. New page: wait a frame for the
      // section components to mount before resolving the anchor.
      if (prev.slug === next.slug) scrollTo(next.anchor);
      else requestAnimationFrame(() => requestAnimationFrame(() => scrollTo(next.anchor as string)));
    } else if (prev.slug !== next.slug) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  };
  window.addEventListener('hashchange', onHash);
  onCleanup(() => window.removeEventListener('hashchange', onHash));

  // Deep link on initial load (`#/docs/recipes/recipe-ticks` pasted into
  // the address bar): resolve the anchor once the page has mounted.
  createEffect(() => {
    const anchor = route().anchor;
    if (anchor) requestAnimationFrame(() => scrollTo(anchor));
  });

  const group = () => GROUPS.find((g) => g.slug === route().slug) ?? GROUPS[0];
  const groupIndex = () => GROUPS.indexOf(group());
  const prevGroup = () => GROUPS[groupIndex() - 1] ?? null;
  const nextGroup = () => GROUPS[groupIndex() + 1] ?? null;

  const pagerLink = (target: { slug: string; label: string }, dir: 'prev' | 'next') => (
    <a
      href={docsHash(target.slug)}
      style={{
        display: 'flex',
        'flex-direction': 'column',
        gap: '2px',
        padding: '12px 16px',
        border: '1px solid var(--border)',
        'border-radius': '8px',
        'text-decoration': 'none',
        'min-width': '160px',
        'text-align': dir === 'next' ? 'right' : 'left',
      }}
    >
      <span style={{ 'font-size': '11px', color: 'var(--text-secondary)' }}>
        {dir === 'prev' ? 'Previous' : 'Next'}
      </span>
      <span style={{ color: 'var(--accent)', 'font-size': 'var(--fs-sm)', 'font-weight': '600' }}>
        {target.label}
      </span>
    </a>
  );

  return (
    <div style={{ display: 'flex', 'max-width': 'var(--max-width)', margin: '0 auto', padding: '48px 24px 80px', gap: '48px' }}>
      <Sidebar activeSlug={route().slug} />

      {/* Content */}
      <div style={{ flex: '1', 'min-width': '0' }}>
        <div style={{ 'font-size': '12px', color: 'var(--text-secondary)', 'margin-bottom': '4px' }}>
          Documentation
        </div>
        <h1 style={{ 'font-size': '28px', 'font-weight': '700', 'margin-bottom': '8px' }}>{group().label}</h1>
        <Show when={route().slug === 'getting-started'}>
          <Prose>
            Every example in these docs is <b>live and editable</b>. Change the config and the chart updates instantly.
          </Prose>
          <Prose>
            <b>Driving the demos:</b> drag inside a chart to box-zoom, pinch or cmd-scroll over the plot to zoom, shift+drag to pan, double-click to reset, hover for tooltips. Axis controls are opt-in. Full reference under{' '}
            <a href={docsHash('interactions', 'interaction-modes')} style={{ color: 'var(--accent)', 'text-decoration': 'none' }}>Interactions</a>.
          </Prose>
        </Show>

        {/* Keyed: swap the whole section tree when the group changes so
            chart instances from the previous page are disposed. */}
        <Show when={group().slug} keyed>
          {(slug) => {
            const Page = PAGE_COMPONENTS[slug];
            return <Page />;
          }}
        </Show>

        <nav
          aria-label="Docs pages"
          style={{ display: 'flex', 'justify-content': 'space-between', gap: '16px', 'margin-top': '48px' }}
        >
          <div>
            <For each={prevGroup() ? [prevGroup() as { slug: string; label: string }] : []}>
              {(g) => pagerLink(g, 'prev')}
            </For>
          </div>
          <div>
            <For each={nextGroup() ? [nextGroup() as { slug: string; label: string }] : []}>
              {(g) => pagerLink(g, 'next')}
            </For>
          </div>
        </nav>
      </div>
    </div>
  );
}
