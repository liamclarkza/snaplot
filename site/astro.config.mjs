// The docs site (plan §8.2, D11): Astro + Starlight, with React and Solid islands for the
// examples, Pagefind search, path routes and a generated API reference. It is served from GitHub
// Pages under /snaplot/ and consumes `snaplot` through its package exports (the built dist/), so
// the docs build is also a packaging test. Run `npm run dev:lib` beside `npm run dev`.
import react from '@astrojs/react';
import solid from '@astrojs/solid-js';
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';
import { fileURLToPath } from 'node:url';

const library = (path) => fileURLToPath(new URL(`../packages/snaplot/${path}`, import.meta.url));

export default defineConfig({
  site: 'https://liamclarkza.github.io',
  base: '/snaplot/',
  // The dev server and `astro preview` take PORT, so parallel worktrees never collide.
  server: { host: '127.0.0.1', port: Number(process.env.PORT ?? 5336) },
  integrations: [
    react({ include: ['**/*.react.tsx'] }),
    // snaplot/solid resolves through its `solid` export condition to dist/solid.jsx, JSX source
    // that Solid's compiler must see too; without it the default JSX transform compiles it as
    // React and the chart never receives its host element.
    solid({ include: ['**/*.solid.tsx', '**/snaplot/dist/solid.jsx'] }),
    starlight({
      title: 'snaplot',
      description:
        'Canvas charts for live data. One options object for vanilla JS, React and Solid.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/liamclarkza/snaplot' }],
      editLink: { baseUrl: 'https://github.com/liamclarkza/snaplot/edit/main/site/' },
      lastUpdated: false,
      // Code frames follow the tokens: no shadow, radius 6px, and a copy tooltip in ink on the
      // background, which passes contrast in both themes (uisite-06).
      expressiveCode: {
        styleOverrides: {
          borderRadius: '6px',
          frames: {
            frameBoxShadowCssValue: 'none',
            tooltipSuccessBackground: 'var(--snaplot-ink)',
            tooltipSuccessForeground: 'var(--snaplot-background)',
          },
        },
      },
      // Fonts and tokens (plan §9, D35). Starlight's own colours are mapped onto the tokens.
      customCss: [
        './src/styles/fonts.css',
        './src/styles/tokens.css',
        './src/styles/base.css',
        './src/styles/docs.css',
      ],
      components: {
        // The three-state theme toggle with guarded storage (uisite-01, uisite-02).
        ThemeProvider: './src/components/ThemeProvider.astro',
        ThemeSelect: './src/components/ThemeSelect.astro',
        // The prerelease banner (D1).
        Banner: './src/components/Banner.astro',
        // The version beside the name (docs-16).
        SiteTitle: './src/components/SiteTitle.astro',
        // Full-text search as an ARIA combobox (uisite-14, docs-11).
        Search: './src/components/Search.astro',
      },
      sidebar: [
        {
          label: 'Start',
          items: [{ slug: 'introduction' }, { slug: 'first-chart' }, { slug: 'sizing' }],
        },
        {
          label: 'Frameworks',
          items: [
            { slug: 'frameworks/vanilla' },
            { slug: 'frameworks/react' },
            { slug: 'frameworks/solid' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { slug: 'guides/data' },
            { slug: 'guides/updating' },
            { slug: 'guides/axes' },
            { slug: 'guides/marks' },
            { slug: 'guides/tooltips-legends' },
            { slug: 'guides/zoom-pan-selection' },
            { slug: 'guides/linked-charts' },
            { slug: 'guides/annotations-plugins' },
            { slug: 'guides/theming' },
            { slug: 'guides/accessibility' },
            { slug: 'guides/performance' },
          ],
        },
        {
          label: 'Reference',
          items: [typeDocSidebarGroup, { slug: 'reference/glossary' }],
        },
        {
          label: 'Help',
          items: [{ slug: 'migrate-0-12' }, { slug: 'troubleshooting' }],
        },
      ],
      plugins: [
        // The API reference (plan §8.4), generated into src/content/docs/reference/api/ (ignored by
        // git) from the three public entry points.
        starlightTypeDoc({
          entryPoints: [library('src/index.ts'), library('src/react.ts'), library('src/solid.ts')],
          tsconfig: library('tsconfig.json'),
          output: 'reference/api',
          sidebar: { label: 'API reference', collapsed: true },
          // The plugin renders but never validates; scripts/typedoc-validate.mjs runs TypeDoc's
          // notDocumented check before every build (a warning until M7, plan §8.4).
          typeDoc: { excludeInternal: true },
        }),
      ],
    }),
  ],
});
