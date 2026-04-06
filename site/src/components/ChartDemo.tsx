import type { JSX } from 'solid-js';

export default function ChartDemo(props: {
  title: string;
  description: string;
  children: JSX.Element;
  height?: string;
}) {
  return (
    <div style={{
      'margin-bottom': '40px',
    }}>
      <h3 style={{
        'font-size': '16px',
        'font-weight': '600',
        'margin-bottom': '6px',
        color: 'var(--text)',
      }}>
        {props.title}
      </h3>
      <p style={{
        'font-size': '13px',
        color: 'var(--text-secondary)',
        'margin-bottom': '12px',
      }}>
        {props.description}
      </p>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        'border-radius': 'var(--radius-lg)',
        overflow: 'hidden',
        height: props.height ?? '320px',
      }}>
        {props.children}
      </div>
    </div>
  );
}
