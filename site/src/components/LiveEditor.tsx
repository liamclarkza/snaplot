import { createSignal, createMemo, onCleanup, onMount } from 'solid-js';
import { highlight } from 'sugar-high';
import {
  Chart,
  darkTheme, lightTheme, oceanTheme, midnightTheme,
  createLegendPlugin,
  createLegendTablePlugin,
  createReferenceLinesPlugin,
  nameColumn, valueColumn, swatchColumn, metricColumn, column,
} from 'snaplot';
import type { ColumnarData, ChartConfig, ChartInstance } from 'snaplot';
import { useTheme } from '../ThemeContext';

// Available to user code inside the editor via new Function args
const evalContext = {
  darkTheme, lightTheme, oceanTheme, midnightTheme,
  createLegendPlugin,
  createLegendTablePlugin,
  createReferenceLinesPlugin,
  nameColumn, valueColumn, swatchColumn, metricColumn, column,
};
const evalArgNames = Object.keys(evalContext);
const evalArgValues = Object.values(evalContext);

/**
 * Editable live example using a contenteditable div with syntax highlighting.
 * No textarea overlay — single element handles both editing and display.
 *
 * On input: extract plain text → re-highlight → update innerHTML
 * while preserving cursor position.
 */
export default function LiveEditor(props: {
  defaultCode: string;
  data: ColumnarData;
  height?: string;
  onReady?: (chart: ChartInstance) => void;
}) {
  const { theme: siteTheme } = useTheme();
  const [error, setError] = createSignal(false);
  const [userConfig, setUserConfig] = createSignal<ChartConfig>(evalConfig(props.defaultCode));
  const [copied, setCopied] = createSignal(false);

  // Merge the site-wide theme so all live-editor charts respond to
  // the light/dark toggle without the user needing to type `theme:` in
  // the editor. If the user's code explicitly sets a theme, it wins
  // because the user config is spread last.
  const config = createMemo(() => {
    const uc = userConfig();
    return {
      theme: siteTheme() === 'light' ? lightTheme : darkTheme,
      ...uc,
    } as ChartConfig;
  });

  let editorRef!: HTMLDivElement;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let currentCode = props.defaultCode;

  function evalConfig(text: string): ChartConfig {
    try {
      // Theme objects (darkTheme, oceanTheme, etc.) are available in the eval scope
      return new Function(...evalArgNames, 'return (' + text + ')')(...evalArgValues) as ChartConfig;
    } catch {
      return { series: [] };
    }
  }

  function getCaretOffset(el: HTMLElement): number {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return 0;
    const range = sel.getRangeAt(0).cloneRange();
    range.selectNodeContents(el);
    range.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
    return range.toString().length;
  }

  function setCaretOffset(el: HTMLElement, offset: number) {
    const sel = window.getSelection();
    if (!sel) return;

    let charCount = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const len = node.length;
      if (charCount + len >= offset) {
        const range = document.createRange();
        range.setStart(node, offset - charCount);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      charCount += len;
    }
  }

  function rehighlight() {
    const text = editorRef.innerText || '';
    currentCode = text;

    const caretPos = getCaretOffset(editorRef);
    editorRef.innerHTML = highlight(text);
    setCaretOffset(editorRef, caretPos);

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try {
        const result = new Function(...evalArgNames, 'return (' + text + ')')(...evalArgValues);
        setUserConfig(result as ChartConfig);
        setError(false);
      } catch {
        setError(true);
      }
    }, 300);
  }

  function onInput() {
    rehighlight();
  }

  function insertAtCaret(text: string) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      // Prevent contentEditable from creating <div> elements.
      // Insert a newline character and re-highlight.
      e.preventDefault();
      insertAtCaret('\n');
      rehighlight();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      insertAtCaret('  ');
      rehighlight();
    }
  }

  function copy() {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  onMount(() => {
    editorRef.innerHTML = highlight(props.defaultCode);
  });

  onCleanup(() => clearTimeout(debounceTimer));

  return (
    <div style={{
      border: `1px solid ${error() ? 'rgba(220, 60, 60, 0.6)' : 'var(--border)'}`,
      'border-radius': 'var(--radius-lg)',
      overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      {/* Live chart */}
      <div style={{ height: props.height ?? '280px', background: 'var(--bg-surface)' }}>
        <Chart config={config()} data={props.data} onReady={props.onReady} />
      </div>

      {/* Editable highlighted code */}
      <div style={{
        position: 'relative',
        'border-top': '1px solid var(--border)',
        background: 'var(--code-bg)',
      }}>
        {/* Copy button */}
        <button
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
            'z-index': '2',
          }}
        >
          {copied() ? 'Copied!' : 'Copy'}
        </button>

        <div
          ref={editorRef!}
          contentEditable
          spellcheck={false}
          onInput={onInput}
          onKeyDown={onKeyDown}
          style={{
            'font-family': 'var(--font-mono)',
            'font-size': '13px',
            'line-height': '1.7',
            'white-space': 'pre-wrap',
            'word-wrap': 'break-word',
            'tab-size': '2',
            padding: '16px 20px',
            outline: 'none',
            'min-height': '80px',
            'max-height': '500px',
            overflow: 'auto',
            color: 'var(--text)',
            'caret-color': 'var(--accent)',
          }}
        />
      </div>
    </div>
  );
}
