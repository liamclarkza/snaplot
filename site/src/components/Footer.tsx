export default function Footer() {
  return (
    <footer style={{
      'border-top': '1px solid var(--border)',
      padding: '32px 24px',
      'text-align': 'center',
      color: 'var(--text-dim)',
      'font-size': '13px',
    }}>
      <div style={{ 'max-width': 'var(--max-width)', margin: '0 auto' }}>
        snaplot — MIT License —{' '}
        <a href="https://github.com/liamclarkza/snaplot" target="_blank" rel="noopener">
          GitHub
        </a>
      </div>
    </footer>
  );
}
