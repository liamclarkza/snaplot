import { createSignal } from 'solid-js';
import { highlight } from 'sugar-high';

export default function CodeBlock(props: { code: string; lang?: string }) {
  const [copied, setCopied] = createSignal(false);
  const [status, setStatus] = createSignal('');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.code);
      setCopied(true);
      setStatus('Code copied.');
      setTimeout(() => {
        setCopied(false);
        setStatus('');
      }, 2000);
    } catch {
      setCopied(false);
      setStatus('Copy failed.');
    }
  };

  const highlighted = () => highlight(props.code);

  return (
    <div style={{
      position: 'relative',
      background: 'var(--code-bg)',
      'border-radius': 'var(--radius)',
      'font-family': 'var(--font-mono)',
      'font-size': '13.5px',
      'line-height': '1.7',
      overflow: 'auto',
    }}>
      <button
        type="button"
        onClick={copy}
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          background: copied() ? 'rgba(79, 143, 234, 0.2)' : 'rgba(255,255,255,0.06)',
          border: '1px solid var(--border)',
          'border-radius': '4px',
          color: copied() ? 'var(--accent)' : 'var(--text-secondary)',
          padding: '4px 10px',
          cursor: 'pointer',
          'font-size': '11px',
          'font-family': 'var(--font)',
          transition: 'all 0.15s',
          'z-index': '1',
        }}
      >
        {copied() ? 'Copied!' : 'Copy'}
      </button>
      <div role="status" aria-live="polite" style={{ position: 'absolute', left: '16px', bottom: '8px', color: 'var(--text-secondary)', 'font-size': '11px', 'pointer-events': 'none' }}>
        {status()}
      </div>
      <pre style={{ padding: '44px 20px 28px', margin: 0, 'white-space': 'pre', 'overflow-x': 'auto' }}><code innerHTML={highlighted()} /></pre>
    </div>
  );
}
