import { createSignal, onCleanup, Show } from 'solid-js';
import { ThemeProvider } from './ThemeContext';
import Nav from './components/Nav';
import Footer from './components/Footer';
import Home from './pages/Home';
import Docs from './pages/Docs';
import Demos from './pages/Demos';

function getPage() {
  const hash = window.location.hash.slice(1) || '/';
  if (hash.startsWith('/docs')) return 'docs';
  if (hash.startsWith('/demos')) return 'demos';
  return 'home';
}

export default function App() {
  const [page, setPage] = createSignal(getPage());

  const onHash = () => setPage(getPage());
  window.addEventListener('hashchange', onHash);
  onCleanup(() => window.removeEventListener('hashchange', onHash));

  return (
    <ThemeProvider>
      <Nav />
      <Show when={page() === 'home'}><Home /></Show>
      <Show when={page() === 'docs'}><Docs /></Show>
      <Show when={page() === 'demos'}><Demos /></Show>
      <Footer />
    </ThemeProvider>
  );
}
