import { createContext, useContext, createSignal, createEffect, type Accessor } from 'solid-js';

export type SiteTheme = 'dark' | 'light';

const ThemeContext = createContext<{
  theme: Accessor<SiteTheme>;
  toggle: () => void;
  setTheme: (t: SiteTheme) => void;
}>();

export function ThemeProvider(props: { children: any }) {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('snaplot-theme') : null;
  const [theme, setTheme] = createSignal<SiteTheme>((stored as SiteTheme) ?? 'dark');

  createEffect(() => {
    const t = theme();
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('snaplot-theme', t);
  });

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>
      {props.children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext)!;
}
