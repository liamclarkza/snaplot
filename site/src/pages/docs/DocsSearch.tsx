import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import api from './api.gen.json';
import { GROUPS, docsHash } from './nav';

interface SearchEntry {
  label: string;
  detail: string;
  slug: string;
  id: string;
}

/**
 * Static search index: every section of every docs page, plus the
 * generated API reference entries so method/event/type names are
 * findable directly ("refreshTheme" jumps to the methods table).
 */
function buildIndex(): SearchEntry[] {
  const entries: SearchEntry[] = [];
  for (const group of GROUPS) {
    for (const item of group.items) {
      entries.push({ label: item.label, detail: group.label, slug: group.slug, id: item.id });
    }
  }
  for (const m of api.methods) {
    entries.push({ label: `${m.name}()`, detail: 'ChartInstance', slug: 'api', id: 'api-methods' });
  }
  for (const e of api.events) {
    entries.push({ label: e.name, detail: 'Event', slug: 'api', id: 'api-events' });
  }
  for (const t of [...api.types, ...api.solidTypes]) {
    entries.push({ label: t.name, detail: 'Type', slug: 'api', id: 'api-types' });
  }
  return entries;
}

const INDEX = buildIndex();
const MAX_RESULTS = 9;

function matches(query: string): SearchEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const starts: SearchEntry[] = [];
  const contains: SearchEntry[] = [];
  for (const entry of INDEX) {
    const label = entry.label.toLowerCase();
    if (label.startsWith(q)) starts.push(entry);
    else if (label.includes(q)) contains.push(entry);
    if (starts.length >= MAX_RESULTS) break;
  }
  return [...starts, ...contains].slice(0, MAX_RESULTS);
}

/** Search box at the top of the docs sidebar; "/" focuses it. */
export default function DocsSearch(props: { onNavigate?: () => void }) {
  const [query, setQuery] = createSignal('');
  const [cursor, setCursor] = createSignal(0);
  const [anchor, setAnchor] = createSignal({ top: 0, left: 0 });
  let inputRef!: HTMLInputElement;

  const results = createMemo(() => matches(query()));

  // The sidebar scrolls (overflow-y: auto), which would clip an
  // absolutely-positioned dropdown, so the results panel is fixed and
  // anchored to the input's viewport rect, re-measured per keystroke.
  function measureAnchor() {
    const rect = inputRef.getBoundingClientRect();
    setAnchor({ top: rect.bottom + 4, left: rect.left });
  }

  // "/" focuses search from anywhere on the docs page (unless typing).
  onMount(() => {
    const onSlash = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (!inputRef?.isConnected) return;
      e.preventDefault();
      inputRef.focus();
    };
    document.addEventListener('keydown', onSlash);
    onCleanup(() => document.removeEventListener('keydown', onSlash));
  });

  function go(entry: SearchEntry) {
    setQuery('');
    setCursor(0);
    inputRef.blur();
    props.onNavigate?.();
    window.location.hash = docsHash(entry.slug, entry.id);
  }

  function onKeyDown(e: KeyboardEvent) {
    const list = results();
    if (e.key === 'Escape') {
      setQuery('');
      inputRef.blur();
    } else if (e.key === 'ArrowDown' && list.length > 0) {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, list.length - 1));
    } else if (e.key === 'ArrowUp' && list.length > 0) {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter' && list.length > 0) {
      e.preventDefault();
      go(list[Math.min(cursor(), list.length - 1)]);
    }
  }

  return (
    <div style={{ position: 'relative', 'margin-bottom': 'var(--space-2)' }}>
      <input
        ref={inputRef!}
        type="search"
        placeholder="Search docs  /"
        aria-label="Search documentation"
        value={query()}
        onInput={(e) => {
          setQuery(e.currentTarget.value);
          setCursor(0);
          measureAnchor();
        }}
        onKeyDown={onKeyDown}
        style={{
          width: '100%',
          padding: '6px 10px',
          'font-size': 'var(--fs-sm)',
          font: 'inherit',
          color: 'var(--text)',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          'border-radius': '6px',
          outline: 'none',
        }}
      />
      <Show when={results().length > 0}>
        <div
          role="listbox"
          style={{
            position: 'fixed',
            top: `${anchor().top}px`,
            left: `${anchor().left}px`,
            'z-index': '220',
            width: '260px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            'border-radius': '8px',
            'box-shadow': '0 8px 24px rgba(0,0,0,0.35)',
            overflow: 'hidden',
          }}
        >
          <For each={results()}>
            {(entry, i) => (
              <button
                type="button"
                role="option"
                aria-selected={i() === cursor()}
                onMouseEnter={() => setCursor(i())}
                onClick={() => go(entry)}
                style={{
                  display: 'flex',
                  'justify-content': 'space-between',
                  gap: '12px',
                  width: '100%',
                  padding: '7px 10px',
                  border: 'none',
                  cursor: 'pointer',
                  font: 'inherit',
                  'font-size': 'var(--fs-sm)',
                  'text-align': 'left',
                  color: 'var(--text)',
                  background: i() === cursor() ? 'var(--bg-hover, rgba(127,127,127,0.12))' : 'transparent',
                }}
              >
                <span style={{ overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>
                  {entry.label}
                </span>
                <span style={{ color: 'var(--text-secondary)', 'font-size': '11px', 'flex-shrink': '0' }}>
                  {entry.detail}
                </span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
