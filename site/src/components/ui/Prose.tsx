import type { JSX } from 'solid-js';

/**
 * Body paragraph with secondary text colour and comfortable line-height.
 * Named `Prose` to avoid shadowing the HTML `<p>` element.
 */
export default function Prose(props: { children: JSX.Element }) {
  return (
    <p
      style={{
        color: 'var(--text-secondary)',
        'margin-bottom': 'var(--space-4)',
        'font-size': 'var(--fs-base)',
        'line-height': '1.7',
      }}
    >
      {props.children}
    </p>
  );
}
