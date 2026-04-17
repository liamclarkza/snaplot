import type { JSX } from 'solid-js';

/**
 * Elevated surface with inset top-edge highlight + layered shadow.
 * Depth comes from elevation, not a 1px border (per the Soft UI guide:
 * "pick one signal for depth").
 */
export default function Card(props: {
  children: JSX.Element;
  /** Override padding. Defaults to --space-5 (24 px). */
  padding?: string;
  /** 'base' uses elev-1, 'raised' uses elev-2 for popovers/modals. */
  elevation?: 'base' | 'raised';
  /** Extra inline styles, merged with the card's defaults. */
  style?: Record<string, string>;
}) {
  const shadow = () =>
    props.elevation === 'raised'
      ? 'var(--elev-1-inset), var(--elev-2-shadow)'
      : 'var(--elev-1-inset), var(--elev-1-shadow)';
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        'border-radius': 'var(--radius-lg)',
        padding: props.padding ?? 'var(--space-5)',
        'box-shadow': shadow(),
        ...(props.style ?? {}),
      }}
    >
      {props.children}
    </div>
  );
}
