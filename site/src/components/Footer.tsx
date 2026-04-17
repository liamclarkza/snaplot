/**
 * Two-zone footer: brand + one-line tagline on the left, nav links
 * on the right. Folds to centered stack on narrow viewports.
 */
export default function Footer() {
  return (
    <footer
      style={{
        'border-top': '1px solid var(--border)',
        padding: 'var(--space-6) var(--space-5)',
        'margin-top': 'var(--space-7)',
      }}
    >
      <div
        style={{
          'max-width': 'var(--max-width)',
          margin: '0 auto',
          display: 'flex',
          'align-items': 'flex-start',
          'justify-content': 'space-between',
          gap: 'var(--space-5)',
          'flex-wrap': 'wrap',
        }}
      >
        <div>
          <div
            style={{
              'font-size': 'var(--fs-base)',
              'font-weight': 700,
              'letter-spacing': '-0.01em',
              color: 'var(--text)',
              'margin-bottom': 'var(--space-1)',
            }}
          >
            snaplot
          </div>
          <div
            style={{
              'font-size': 'var(--fs-sm)',
              color: 'var(--text-secondary)',
              'max-width': '360px',
              'line-height': 1.5,
            }}
          >
            A canvas chart library for streaming data. MIT licensed.
          </div>
        </div>
        <nav
          aria-label="Footer"
          style={{
            display: 'flex',
            'flex-wrap': 'wrap',
            gap: 'var(--space-4)',
            'align-items': 'center',
            'font-size': 'var(--fs-sm)',
          }}
        >
          <a href="#/docs" style={{ color: 'var(--text-secondary)' }}>Docs</a>
          <a href="#/demos" style={{ color: 'var(--text-secondary)' }}>Demos</a>
          <a
            href="https://github.com/liamclarkza/snaplot"
            target="_blank"
            rel="noopener"
            style={{ color: 'var(--text-secondary)' }}
          >
            GitHub
          </a>
          <a
            href="https://github.com/liamclarkza/snaplot/releases"
            target="_blank"
            rel="noopener"
            style={{ color: 'var(--text-secondary)' }}
          >
            Releases
          </a>
        </nav>
      </div>
    </footer>
  );
}
