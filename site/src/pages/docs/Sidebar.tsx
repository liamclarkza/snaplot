import { createSignal, createEffect, For, Show } from 'solid-js';
import type { Accessor } from 'solid-js';

export type NavItem =
  | { type: 'link'; id: string; label: string }
  | { type: 'divider'; label: string };

/**
 * Ordered navigation for the docs sidebar. Adding a section here also adds
 * it to the mobile drawer. Paired with anchor IDs inside Docs.tsx — the
 * `scrollTo` helper jumps to the matching `<Section id="…">`.
 */
export const NAV: NavItem[] = [
  { type: 'divider', label: 'Getting Started' },
  { type: 'link', id: 'install', label: 'Installation' },
  { type: 'link', id: 'quick-start', label: 'Quick Start' },
  { type: 'link', id: 'data-model', label: 'Data Model' },

  { type: 'divider', label: 'Chart Types' },
  { type: 'link', id: 'line', label: 'Line' },
  { type: 'link', id: 'area', label: 'Area' },
  { type: 'link', id: 'band', label: 'Band (Fill Between)' },
  { type: 'link', id: 'scatter', label: 'Scatter' },
  { type: 'link', id: 'heatmap', label: 'Density Heatmap' },
  { type: 'link', id: 'bar', label: 'Bar' },
  { type: 'link', id: 'histogram', label: 'Histogram' },

  { type: 'divider', label: 'Series Options' },
  { type: 'link', id: 'interpolation', label: 'Interpolation' },
  { type: 'link', id: 'styling', label: 'Styling' },
  { type: 'link', id: 'line-dash', label: 'Line Dash' },
  { type: 'link', id: 'nan-gaps', label: 'NaN Gaps' },
  { type: 'link', id: 'dual-axis', label: 'Dual Y-Axis' },

  { type: 'divider', label: 'Scales & Axes' },
  { type: 'link', id: 'linear-scale', label: 'Linear Scale' },
  { type: 'link', id: 'log-scale', label: 'Log Scale' },
  { type: 'link', id: 'time-scale', label: 'Time Scale' },
  { type: 'link', id: 'tick-format', label: 'Custom Tick Formatting' },

  { type: 'divider', label: 'Interactions' },
  { type: 'link', id: 'interaction-modes', label: 'Interaction Modes' },
  { type: 'link', id: 'zoom', label: 'Zoom & Selection' },
  { type: 'link', id: 'pan', label: 'Pan' },
  { type: 'link', id: 'cursor', label: 'Cursor & Crosshair' },
  { type: 'link', id: 'touch', label: 'Touch Gestures' },

  { type: 'divider', label: 'Tooltips' },
  { type: 'link', id: 'tooltip-modes', label: 'Tooltip Modes' },
  { type: 'link', id: 'tooltip-custom', label: 'Custom Tooltip Renderer' },
  { type: 'link', id: 'tooltip-snap', label: 'Proximity & Snap' },

  { type: 'divider', label: 'Theming' },
  { type: 'link', id: 'themes-builtin', label: 'Built-in Themes' },
  { type: 'link', id: 'themes-custom', label: 'Custom Theme' },
  { type: 'link', id: 'css-vars', label: 'CSS Variables' },

  { type: 'divider', label: 'Data' },
  { type: 'link', id: 'streaming', label: 'Streaming' },
  { type: 'link', id: 'downsampling', label: 'Downsampling' },

  { type: 'divider', label: 'Plugins' },
  { type: 'link', id: 'reference-lines', label: 'Reference Lines' },
  { type: 'link', id: 'legend-plugin', label: 'Legend Plugin' },
  { type: 'link', id: 'legend-table', label: 'Legend Table' },
  { type: 'link', id: 'cross-chart-sync', label: 'Cross-chart Sync' },
  { type: 'link', id: 'cursor-snapshot', label: 'Cursor Snapshot' },
  { type: 'link', id: 'custom-plugins', label: 'Custom Plugins' },

  { type: 'divider', label: 'API Reference' },
  { type: 'link', id: 'api-methods', label: 'ChartInstance Methods' },
  { type: 'link', id: 'api-events', label: 'Events' },
  { type: 'link', id: 'api-types', label: 'Types' },
];

/** Scroll to a section anchor, offset by the sticky top nav height. */
export function scrollTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const navHeight = 56 + 16;
  const y = el.getBoundingClientRect().top + window.scrollY - navHeight;
  window.scrollTo({ top: y, behavior: 'smooth' });
}

/**
 * Docs sidebar — desktop: static sticky aside. Mobile: slide-out drawer
 * with a floating hamburger trigger (styled via .docs-menu-btn /
 * .docs-sidebar classes in global.css).
 *
 * Returns the rendered JSX plus the signal pair so the parent can react
 * to open/close state if it needs to (currently the parent doesn't).
 */
export function Sidebar() {
  const [sidebarOpen, setSidebarOpen] = createSignal(false);
  return <SidebarUI sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />;
}

export function SidebarUI(props: {
  sidebarOpen: Accessor<boolean>;
  setSidebarOpen: (v: boolean) => void;
}) {
  // iOS-Safari-friendly body-scroll lock when the mobile drawer is open.
  // overflow:hidden on body is flaky there; position:fixed + saved offset
  // is the reliable pattern.
  let savedScrollY = 0;
  let navTarget: string | null = null;
  let wasOpen = false;

  createEffect(() => {
    const open = props.sidebarOpen();
    if (open) {
      savedScrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${savedScrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.overflow = 'hidden';
      wasOpen = true;
    } else if (wasOpen) {
      wasOpen = false;
      const target = navTarget;
      navTarget = null;

      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';

      window.scrollTo(0, savedScrollY);

      if (target) {
        requestAnimationFrame(() => scrollTo(target));
      }
    }
  });

  function navClick(id: string) {
    if (props.sidebarOpen()) {
      navTarget = id;
      props.setSidebarOpen(false);
    } else {
      scrollTo(id);
    }
  }

  return (
    <>
      {/* Mobile hamburger — visible below 768px via .docs-menu-btn media query. */}
      <button
        type="button"
        class="docs-menu-btn"
        aria-label={props.sidebarOpen() ? 'Close navigation' : 'Open navigation'}
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

      {/* Mobile drawer scrim */}
      <Show when={props.sidebarOpen()}>
        <div
          role="presentation"
          onClick={() => props.setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: '0',
            background: 'rgba(0,0,0,0.5)',
            'z-index': '149',
          }}
        />
      </Show>

      <aside
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
        <For each={NAV}>
          {(item) =>
            item.type === 'divider' ? (
              <div
                style={{
                  'font-size': '10.5px',
                  'font-weight': '600',
                  'text-transform': 'uppercase',
                  'letter-spacing': '0.08em',
                  color: 'var(--text-secondary)',
                  opacity: '0.5',
                  padding: 'var(--space-3) 0 var(--space-1)',
                  'user-select': 'none',
                }}
              >
                {item.label}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => navClick(item.id)}
                style={{
                  color: 'var(--text-secondary)',
                  'font-size': 'var(--fs-sm)',
                  padding: '3px 0 3px 8px',
                  cursor: 'pointer',
                  background: 'transparent',
                  border: 'none',
                  'text-align': 'left',
                  font: 'inherit',
                }}
              >
                {item.label}
              </button>
            )
          }
        </For>
      </aside>
    </>
  );
}
