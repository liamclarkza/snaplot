import { useTheme } from '../ThemeContext';

export default function Nav() {
  const { theme, toggle } = useTheme();

  return (
    <nav style={{
      position: 'sticky',
      top: '0',
      'z-index': '100',
      background: theme() === 'dark' ? 'rgba(15, 17, 23, 0.85)' : 'rgba(245, 246, 248, 0.85)',
      'backdrop-filter': 'blur(12px)',
      'border-bottom': '1px solid var(--border)',
      transition: 'background 0.2s',
    }}>
      <div style={{
        'max-width': 'var(--max-width)',
        margin: '0 auto',
        padding: '0 24px',
        height: '56px',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'space-between',
      }}>
        <a href="#/" style={{
          'font-size': '18px',
          'font-weight': '700',
          color: 'var(--text)',
          'letter-spacing': '-0.02em',
        }}>
          snaplot
        </a>

        <div style={{ display: 'flex', gap: '20px', 'align-items': 'center' }}>
          <a href="#/docs" style={{ color: 'var(--text-secondary)', 'font-size': '14px', 'font-weight': '500' }}>
            Docs
          </a>

          {/* Light / dark toggle */}
          <button
            onClick={toggle}
            title={theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              'align-items': 'center',
              padding: '4px',
            }}
          >
            {theme() === 'dark' ? (
              /* Sun icon */
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Light mode">
                <title>Light mode</title>
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              /* Moon icon */
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Dark mode">
                <title>Dark mode</title>
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          <a
            href="https://github.com/liamclarkza/snaplot"
            target="_blank"
            rel="noopener"
            style={{ color: 'var(--text-secondary)', display: 'flex', 'align-items': 'center' }}
            title="GitHub"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" role="img" aria-label="GitHub">
              <title>GitHub</title>
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
          </a>
        </div>
      </div>
    </nav>
  );
}
