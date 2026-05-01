import type { JSX } from 'solid-js';

type Variant = 'primary' | 'secondary';

const BASE_STYLE: Record<string, string> = {
  padding: '10px 24px',
  'border-radius': 'var(--radius)',
  'font-weight': '600',
  'font-size': 'var(--fs-sm)',
  'font-family': 'var(--font)',
  'line-height': '1.4',
  display: 'inline-flex',
  'align-items': 'center',
  'justify-content': 'center',
  gap: 'var(--space-2)',
  border: '0',
  cursor: 'pointer',
  // Button hits 44px min-height for touch accessibility.
  'min-height': '44px',
};

function variantStyle(v: Variant): Record<string, string> {
  if (v === 'primary') {
    return {
      background: 'var(--button-primary-bg, var(--accent))',
      color: 'var(--button-primary-text, #fff)',
    };
  }
  return {
    background: 'var(--bg-surface-hover)',
    color: 'var(--text)',
    'box-shadow': 'inset 0 0 0 1px var(--border)',
  };
}

/**
 * Renders an `<a>` when `href` is provided (for nav CTAs), otherwise a
 * `<button>`. Both share the same visual treatment and touch target.
 */
export default function Button(props: {
  children: JSX.Element;
  variant?: Variant;
  href?: string;
  target?: string;
  rel?: string;
  onClick?: (e: MouseEvent) => void;
  type?: 'button' | 'submit' | 'reset';
}) {
  const style = { ...BASE_STYLE, ...variantStyle(props.variant ?? 'primary') };
  if (props.href) {
    return (
      <a href={props.href} target={props.target} rel={props.rel} style={style}>
        {props.children}
      </a>
    );
  }
  return (
    <button type={props.type ?? 'button'} onClick={props.onClick} style={style}>
      {props.children}
    </button>
  );
}
