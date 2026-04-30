import { For, Show, createMemo, createSignal, createEffect, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import { highlight } from 'sugar-high';
import type { ThemeConfig } from 'snaplot';
import {
  lightTheme,
  darkTheme,
  studioTheme,
  tokyoTheme,
  oceanTheme,
  forestTheme,
  sunsetTheme,
  violetTheme,
  fogTheme,
  ivoryTheme,
  mintTheme,
} from 'snaplot';
import { useTheme } from '../ThemeContext';

type Seed = { label: string; theme: ThemeConfig };

// Split by background tonality so the editor can show light themes
// on the left and dark themes on the right. Lets the user pick a
// starting palette by visual mode at a glance.
const LIGHT_SEEDS: Seed[] = [
  { label: 'Paper',  theme: lightTheme },
  { label: 'Studio', theme: studioTheme },
  { label: 'Fog',    theme: fogTheme },
  { label: 'Ivory',  theme: ivoryTheme },
  { label: 'Mint',   theme: mintTheme },
];
const DARK_SEEDS: Seed[] = [
  { label: 'Slate',  theme: darkTheme },
  { label: 'Tokyo',  theme: tokyoTheme },
  { label: 'Ocean',  theme: oceanTheme },
  { label: 'Forest', theme: forestTheme },
  { label: 'Sunset', theme: sunsetTheme },
  { label: 'Violet', theme: violetTheme },
];

/**
 * Some built-in themes use `rgba(...)` values for tooltip surfaces.
 * Native `<input type="color">` only takes `#rrggbb`, so we punt to the
 * browser's CSS color parser via getComputedStyle and read back rgb()
 * tuples. Alpha is dropped in the picker; the user can re-add it by
 * editing the emitted code if they need translucency.
 */
function toHex(color: string): string {
  if (typeof document === 'undefined') return '#000000';
  const probe = document.createElement('div');
  probe.style.color = '';
  probe.style.color = color;
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  document.body.removeChild(probe);
  const m = computed.match(/\d+(?:\.\d+)?/g);
  if (!m || m.length < 3) return '#000000';
  const [r, g, b] = m.slice(0, 3).map((n) => Math.round(Number(n)));
  return (
    '#' +
    [r, g, b]
      .map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * Emit a paste-able TS object literal for the working theme. Single-quoted
 * strings to match the rest of the snaplot codebase. Palette is one entry
 * per line so diffs read cleanly.
 */
function emitThemeCode(t: ThemeConfig): string {
  const emitPalette = (palette: string[]) => palette.map((c) => `    '${c}',`).join('\n');
  const optionalPalette = (
    key: keyof Pick<ThemeConfig, 'categoricalPalette' | 'sequentialPalette' | 'divergingPalette' | 'heatmapGradient'>,
  ) => {
    const palette = t[key];
    if (!palette || palette.length === 0) return '';
    return `  ${key}: [
${emitPalette(palette)}
  ],
`;
  };
  return `import type { ThemeConfig } from 'snaplot';

const customTheme: ThemeConfig = {
  backgroundColor: '${t.backgroundColor}',
  textColor: '${t.textColor}',
  fontFamily: ${JSON.stringify(t.fontFamily)},
  fontSize: ${t.fontSize},
  gridColor: '${t.gridColor}',
  gridOpacity: ${t.gridOpacity},
  palette: [
${emitPalette(t.palette)}
  ],
${optionalPalette('categoricalPalette')}${optionalPalette('sequentialPalette')}${optionalPalette('divergingPalette')}${optionalPalette('heatmapGradient')}  axisLineColor: '${t.axisLineColor}',
  borderColor: '${t.borderColor}',
  borderOpacity: ${t.borderOpacity},
  tickColor: '${t.tickColor}',
  crosshairColor: '${t.crosshairColor}',
  tooltipBackground: '${t.tooltipBackground}',
  tooltipTextColor: '${t.tooltipTextColor}',
  tooltipBorderColor: '${t.tooltipBorderColor}',
};
`;
}

type ColorKey =
  | 'backgroundColor'
  | 'textColor'
  | 'gridColor'
  | 'axisLineColor'
  | 'borderColor'
  | 'tickColor'
  | 'crosshairColor'
  | 'tooltipBackground'
  | 'tooltipTextColor'
  | 'tooltipBorderColor';

const COLOR_FIELDS: { key: ColorKey; label: string }[] = [
  { key: 'backgroundColor',   label: 'Background' },
  { key: 'textColor',         label: 'Text' },
  { key: 'gridColor',         label: 'Grid' },
  { key: 'axisLineColor',     label: 'Axis line' },
  { key: 'borderColor',       label: 'Plot border' },
  { key: 'tickColor',         label: 'Tick label' },
  { key: 'crosshairColor',    label: 'Crosshair' },
  { key: 'tooltipBackground', label: 'Tooltip bg' },
  { key: 'tooltipTextColor',  label: 'Tooltip text' },
  { key: 'tooltipBorderColor',label: 'Tooltip border' },
];

export default function ThemeEditor(props: {
  theme: ThemeConfig;
  onChange: (t: ThemeConfig) => void;
}) {
  const code = createMemo(() => emitThemeCode(props.theme));
  // Used by seed pills so picking a Light / Dark starting point also
  // flips the page chrome to match. The nav-bar toggle still lets the
  // user override afterwards.
  const { setTheme: setPageMode } = useTheme();

  function patch<K extends keyof ThemeConfig>(key: K, value: ThemeConfig[K]) {
    props.onChange({ ...props.theme, [key]: value });
  }

  function patchPalette(value: string[]) {
    props.onChange({
      ...props.theme,
      palette: value,
      categoricalPalette: [...value],
    });
  }

  function setPaletteEntry(i: number, value: string) {
    const next = [...props.theme.palette];
    next[i] = value;
    patchPalette(next);
  }
  function addPaletteEntry() {
    if (props.theme.palette.length >= 12) return;
    patchPalette([...props.theme.palette, '#888888']);
  }
  function removePaletteEntry(i: number) {
    if (props.theme.palette.length <= 1) return;
    const next = props.theme.palette.filter((_, j) => j !== i);
    patchPalette(next);
  }
  /**
   * Drop-on-target reorder: the dragged swatch lands at index `to` in the
   * new array, and every other entry shifts to make room. `splice(to, 0)`
   * after the source removal works in both directions because the source
   * is already gone before the insert.
   */
  function reorderPaletteEntry(from: number, to: number) {
    if (from === to) return;
    const next = [...props.theme.palette];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    patchPalette(next);
  }

  // Drag state for palette reorder. `dragIndex` is the swatch being
  // dragged, `dragOverIndex` the slot it would land in if released now.
  // Both are null when no drag is active.
  const [dragIndex, setDragIndex] = createSignal<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = createSignal<number | null>(null);

  // Code panel is collapsed by default. The block is wide and pushes the
  // controls below the fold in the sticky left rail; the toggle keeps the
  // editor compact unless the user wants to copy the literal.
  const [codeOpen, setCodeOpen] = createSignal(false);

  function seed(t: ThemeConfig) {
    props.onChange({
      ...t,
      palette: [...t.palette],
      categoricalPalette: t.categoricalPalette ? [...t.categoricalPalette] : undefined,
      sequentialPalette: t.sequentialPalette ? [...t.sequentialPalette] : undefined,
      divergingPalette: t.divergingPalette ? [...t.divergingPalette] : undefined,
      heatmapGradient: t.heatmapGradient ? [...t.heatmapGradient] : undefined,
    });
  }

  return (
    <div
      style={{
        // Match the dashboard panel cards so the editor and chart panels
        // sit on a consistent surface across the page. Falls back to
        // --bg-surface for any caller outside /demos.
        background: 'var(--chart-panel-bg, var(--bg-surface))',
        'border-radius': 'var(--radius-lg)',
        'box-shadow': 'var(--elev-1-inset), var(--elev-1-shadow)',
        padding: 'var(--space-4) var(--space-5)',
        display: 'flex',
        'flex-direction': 'column',
        gap: 'var(--space-3)',
      }}
      class="theme-editor"
    >
      <div style={{ 'min-width': '0' }}>
        <Header label="Starting point" />
        <div
          style={{
            display: 'grid',
            'grid-template-columns': '1fr 1fr',
            gap: '4px 12px',
            'margin-bottom': '12px',
          }}
        >
          <SubLabel label="Light" />
          <SubLabel label="Dark" />
          <SeedPills
            seeds={LIGHT_SEEDS}
            onSeed={(t) => { seed(t); setPageMode('light'); }}
          />
          <SeedPills
            seeds={DARK_SEEDS}
            onSeed={(t) => { seed(t); setPageMode('dark'); }}
          />
        </div>

        <Header label="Surfaces" />
        <Grid>
          <For each={COLOR_FIELDS.slice(0, 2)}>
            {(f) => (
              <ColorRow
                label={f.label}
                value={props.theme[f.key]}
                onChange={(v) => patch(f.key, v)}
              />
            )}
          </For>
          <NumberRow
            label="Font size"
            value={props.theme.fontSize}
            min={8}
            max={20}
            step={1}
            onChange={(v) => patch('fontSize', v)}
          />
        </Grid>

        <Header label="Lines & ticks" />
        <Grid>
          <ColorRow label="Grid"        value={props.theme.gridColor}     onChange={(v) => patch('gridColor', v)} />
          <RangeRow label="Grid α"      value={props.theme.gridOpacity}   onChange={(v) => patch('gridOpacity', v)} />
          <ColorRow label="Axis line"   value={props.theme.axisLineColor} onChange={(v) => patch('axisLineColor', v)} />
          <ColorRow label="Plot border" value={props.theme.borderColor}   onChange={(v) => patch('borderColor', v)} />
          <RangeRow label="Border α"    value={props.theme.borderOpacity} onChange={(v) => patch('borderOpacity', v)} />
          <ColorRow label="Tick label"  value={props.theme.tickColor}     onChange={(v) => patch('tickColor', v)} />
          <ColorRow label="Crosshair"   value={props.theme.crosshairColor}onChange={(v) => patch('crosshairColor', v)} />
        </Grid>

        <Header label="Tooltip" />
        <Grid>
          <ColorRow label="Background"  value={props.theme.tooltipBackground}  onChange={(v) => patch('tooltipBackground', v)} />
          <ColorRow label="Text"        value={props.theme.tooltipTextColor}   onChange={(v) => patch('tooltipTextColor', v)} />
          <ColorRow label="Border"      value={props.theme.tooltipBorderColor} onChange={(v) => patch('tooltipBorderColor', v)} />
        </Grid>

        <Header label="Palette" />
        <div
          role="list"
          style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '8px', 'align-items': 'center' }}
          onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
        >
          <For each={props.theme.palette}>
            {(c, i) => (
              <PaletteSwatch
                color={c}
                index={i()}
                isDragging={dragIndex() === i()}
                isDropTarget={dragOverIndex() === i() && dragIndex() !== null && dragIndex() !== i()}
                onChange={(v) => setPaletteEntry(i(), v)}
                onRemove={() => removePaletteEntry(i())}
                onDragStart={() => setDragIndex(i())}
                onDragEnter={() => { if (dragIndex() !== null) setDragOverIndex(i()); }}
                onDrop={() => {
                  const from = dragIndex();
                  if (from !== null) reorderPaletteEntry(from, i());
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
              />
            )}
          </For>
          <Show when={props.theme.palette.length < 12}>
            <button
              type="button"
              onClick={addPaletteEntry}
              title="Add palette colour"
              style={{
                width: '32px',
                height: '32px',
                'border-radius': '50%',
                border: '1px dashed var(--border)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                'font-size': '18px',
                'line-height': '1',
                padding: '0',
              }}
            >
              +
            </button>
          </Show>
        </div>
        <p
          style={{
            'font-size': 'var(--fs-xs)',
            color: 'var(--text-secondary)',
            opacity: 0.7,
            margin: '6px 0 0',
          }}
        >
          Drag a swatch onto another to reorder. Click to recolour, × to remove.
        </p>
      </div>

      <div style={{ 'min-width': '0' }}>
        {/* Plain text-link button. Heavier styling here drew the eye away
            from the colour rows that are the actual editor surface. */}
        <button
          type="button"
          onClick={() => setCodeOpen(true)}
          style={{
            'margin-top': '4px',
            background: 'transparent',
            border: 'none',
            padding: '0',
            color: 'var(--text-secondary)',
            'font-size': '11px',
            'text-decoration': 'underline',
            'text-underline-offset': '3px',
            cursor: 'pointer',
            'font-family': 'inherit',
          }}
        >
          Show code
        </button>
      </div>

      {/* Bottom-sheet drawer for the emitted theme literal. Mounted via
          Portal so it escapes the sticky aside's overflow:auto and
          covers the full viewport width. The dashboard above stays
          visible so users can still see their custom theme repaint
          while reading the code. */}
      <Show when={codeOpen()}>
        <Portal mount={document.body}>
          <CodeSheet code={code()} onClose={() => setCodeOpen(false)} />
        </Portal>
      </Show>
    </div>
  );
}

function SeedPills(props: { seeds: Seed[]; onSeed: (t: ThemeConfig) => void }) {
  return (
    <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '4px' }}>
      <For each={props.seeds}>
        {(s) => (
          <button
            type="button"
            onClick={() => props.onSeed(s.theme)}
            style={{
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
              'border-radius': 'var(--radius-pill)',
              padding: '1px 8px',
              'font-size': '10.5px',
              'font-weight': 500,
              cursor: 'pointer',
              'font-family': 'inherit',
            }}
          >
            {s.label}
          </button>
        )}
      </For>
    </div>
  );
}

function SubLabel(props: { label: string }) {
  return (
    <div
      style={{
        'font-size': '10px',
        'font-weight': 600,
        'text-transform': 'uppercase',
        'letter-spacing': '0.06em',
        color: 'var(--text-secondary)',
        opacity: 0.6,
      }}
    >
      {props.label}
    </div>
  );
}

/**
 * Bottom-anchored sheet that holds the generated ThemeConfig literal.
 * Slides up from the viewport edge so the dashboard charts stay visible
 * while the user reads / copies the code. Esc closes; clicking the
 * close button or the "Done" pill closes; the sheet doesn't trap focus
 * because the editor next to it is the primary surface and we want
 * users to keep editing without dismissing the sheet first.
 */
function CodeSheet(props: { code: string; onClose: () => void }) {
  const [copied, setCopied] = createSignal(false);
  const html = createMemo(() => highlight(props.code));

  // Esc to dismiss. document-level so the sheet doesn't need focus.
  createEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    document.addEventListener('keydown', onKey);
    onCleanup(() => document.removeEventListener('keydown', onKey));
  });

  const copy = () => {
    navigator.clipboard.writeText(props.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      role="dialog"
      aria-label="Theme code"
      style={{
        position: 'fixed',
        left: '0',
        right: '0',
        bottom: '0',
        'max-height': 'min(50vh, 520px)',
        background: 'var(--chart-panel-bg, var(--bg-surface))',
        'border-top': '1px solid var(--border)',
        'box-shadow': '0 -8px 28px rgba(0, 0, 0, 0.18)',
        display: 'flex',
        'flex-direction': 'column',
        'z-index': '200',
      }}
    >
      <div
        style={{
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'space-between',
          gap: '12px',
          padding: '10px 16px',
          'border-bottom': '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', 'align-items': 'baseline', gap: '8px', 'min-width': '0' }}>
          <span style={{ 'font-size': 'var(--fs-sm)', 'font-weight': 600 }}>customTheme</span>
          <span
            style={{
              'font-size': 'var(--fs-xs)',
              color: 'var(--text-secondary)',
              overflow: 'hidden',
              'text-overflow': 'ellipsis',
              'white-space': 'nowrap',
            }}
          >
            ThemeConfig literal · paste into your project
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            onClick={copy}
            style={{
              background: copied() ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'transparent',
              color: copied() ? 'var(--accent)' : 'var(--text-secondary)',
              border: '1px solid var(--border)',
              'border-radius': '6px',
              padding: '3px 10px',
              'font-size': '11px',
              cursor: 'pointer',
              'font-family': 'inherit',
            }}
          >
            {copied() ? 'Copied!' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
              'border-radius': '6px',
              padding: '3px 10px',
              'font-size': '11px',
              cursor: 'pointer',
              'font-family': 'inherit',
            }}
          >
            Close
          </button>
        </div>
      </div>
      <pre
        style={{
          margin: '0',
          padding: '14px 18px',
          'overflow-y': 'auto',
          'overflow-x': 'auto',
          'font-family': 'var(--font-mono)',
          'font-size': '13px',
          'line-height': '1.65',
          'white-space': 'pre',
          flex: '1',
        }}
      >
        <code innerHTML={html()} />
      </pre>
    </div>
  );
}

function Header(props: { label: string }) {
  return (
    <div
      style={{
        'font-size': '10.5px',
        'font-weight': '600',
        'text-transform': 'uppercase',
        'letter-spacing': '0.08em',
        color: 'var(--text-secondary)',
        opacity: '0.7',
        'margin-bottom': '8px',
        'margin-top': 'var(--space-3)',
      }}
    >
      {props.label}
    </div>
  );
}

function Grid(props: { children: any }) {
  return (
    <div
      style={{
        display: 'flex',
        'flex-direction': 'column',
        gap: '6px',
        'margin-bottom': '6px',
      }}
    >
      {props.children}
    </div>
  );
}

function ColorRow(props: { label: string; value: string; onChange: (v: string) => void }) {
  const hex = createMemo(() => toHex(props.value));
  return (
    <label
      style={{
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'space-between',
        gap: '8px',
        'font-size': 'var(--fs-xs)',
        color: 'var(--text-secondary)',
      }}
    >
      <span style={{ 'min-width': '0', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>{props.label}</span>
      <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '6px' }}>
        <code style={{ 'font-size': '11px', color: 'var(--text)' }}>{hex()}</code>
        <input
          type="color"
          value={hex()}
          onInput={(e) => props.onChange(e.currentTarget.value)}
          style={{
            width: '28px',
            height: '20px',
            padding: '0',
            border: '1px solid var(--border)',
            'border-radius': '4px',
            background: 'transparent',
            cursor: 'pointer',
          }}
        />
      </span>
    </label>
  );
}

function RangeRow(props: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label
      style={{
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'space-between',
        gap: '8px',
        'font-size': 'var(--fs-xs)',
        color: 'var(--text-secondary)',
      }}
    >
      <span style={{ 'min-width': '0', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>{props.label}</span>
      <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '6px' }}>
        <code style={{ 'font-size': '11px', color: 'var(--text)' }}>{props.value.toFixed(2)}</code>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={props.value}
          onInput={(e) => props.onChange(Number(e.currentTarget.value))}
          style={{ width: '70px' }}
        />
      </span>
    </label>
  );
}

function NumberRow(props: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label
      style={{
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'space-between',
        gap: '8px',
        'font-size': 'var(--fs-xs)',
        color: 'var(--text-secondary)',
      }}
    >
      <span>{props.label}</span>
      <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '6px' }}>
        <code style={{ 'font-size': '11px', color: 'var(--text)' }}>{props.value}</code>
        <input
          type="range"
          min={props.min}
          max={props.max}
          step={props.step}
          value={props.value}
          onInput={(e) => props.onChange(Number(e.currentTarget.value))}
          style={{ width: '70px' }}
        />
      </span>
    </label>
  );
}

function PaletteSwatch(props: {
  color: string;
  index: number;
  isDragging: boolean;
  isDropTarget: boolean;
  onChange: (v: string) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDrop: () => void;
}) {
  const hex = createMemo(() => toHex(props.color));
  return (
    // The wrapping span owns drag-and-drop. The inner color input still
    // handles click-to-pick because it sits on top of the span and HTML5
    // D&D fires on mousedown-and-move, while the input opens its picker
    // on mouseup, so a quick click never triggers a drag.
    <span
      role="listitem"
      draggable={true}
      onDragStart={(e) => {
        // dataTransfer must be populated for Firefox to start the drag.
        // The actual reorder reads from the editor's signal, not this
        // payload, but Firefox refuses to fire dragover without it.
        e.dataTransfer?.setData('text/plain', String(props.index));
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        props.onDragStart();
      }}
      onDragEnter={(e) => { e.preventDefault(); props.onDragEnter(); }}
      onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; }}
      onDrop={(e) => { e.preventDefault(); props.onDrop(); }}
      title="Drag to reorder"
      style={{
        position: 'relative',
        width: '32px',
        height: '32px',
        display: 'inline-block',
        cursor: 'grab',
        opacity: props.isDragging ? 0.4 : 1,
        transform: props.isDropTarget ? 'scale(1.12)' : 'none',
        'box-shadow': props.isDropTarget
          ? '0 0 0 2px var(--accent)'
          : 'none',
        'border-radius': '50%',
        transition: 'transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out)',
      }}
    >
      <input
        type="color"
        value={hex()}
        onInput={(e) => props.onChange(e.currentTarget.value)}
        title={hex()}
        aria-label={`Palette colour ${hex()}`}
        style={{
          width: '32px',
          height: '32px',
          padding: '0',
          border: '1px solid var(--border)',
          'border-radius': '50%',
          background: 'transparent',
          cursor: 'pointer',
          'pointer-events': props.isDragging ? 'none' : 'auto',
        }}
      />
      <button
        type="button"
        onClick={props.onRemove}
        title="Remove colour"
        aria-label="Remove palette colour"
        style={{
          position: 'absolute',
          top: '-4px',
          right: '-4px',
          width: '14px',
          height: '14px',
          'border-radius': '50%',
          border: 'none',
          background: 'var(--bg-surface)',
          'box-shadow': '0 0 0 1px var(--border)',
          color: 'var(--text-secondary)',
          'font-size': '10px',
          'line-height': '1',
          cursor: 'pointer',
          padding: '0',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
        }}
      >
        ×
      </button>
    </span>
  );
}
