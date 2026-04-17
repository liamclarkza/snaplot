import type { JSX } from 'solid-js';

export default function Section(props: {
  id: string;
  title: string;
  children: JSX.Element;
}) {
  return (
    <section id={props.id} style={{ 'margin-bottom': 'var(--space-7)' }}>
      <h2
        style={{
          'font-size': 'var(--fs-lg)',
          'font-weight': '700',
          'margin-bottom': 'var(--space-4)',
          'padding-top': 'var(--space-5)',
          'border-top': '1px solid var(--border)',
          'letter-spacing': '-0.01em',
        }}
      >
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}
