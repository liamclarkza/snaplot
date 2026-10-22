import { For } from 'solid-js';
import CodeBlock from '../../../components/CodeBlock';
import { Section, Prose } from '../../../components/ui';
import api from '../api.gen.json';

/**
 * API reference rendered from api.gen.json, which
 * scripts/generate-api-docs.mjs extracts from the library's TypeScript
 * declarations and doc comments at build time. Edit the doc comments in
 * packages/snaplot/src/api/types.ts (and solid sources), not this file.
 */

const cellHead = {
  padding: '10px 12px',
  'text-align': 'left' as const,
  'font-weight': '600',
  color: 'var(--text)',
};
const cellMono = {
  padding: '8px 12px',
  'font-family': 'var(--font-mono)',
  'font-size': '12px',
};
const cellText = { padding: '8px 12px' };

/** Render `code spans` from doc comments as real inline code. */
function DocText(props: { text: string }) {
  const parts = () => props.text.split('`');
  return (
    <For each={parts()}>
      {(part, i) => (i() % 2 === 1 ? <code>{part}</code> : part)}
    </For>
  );
}

function ApiTable(props: {
  headers: string[];
  rows: string[][];
  monoColumns?: number[];
  wrapFirst?: boolean;
}) {
  const mono = new Set(props.monoColumns ?? [0]);
  return (
    <div
      style={{
        'overflow-x': 'auto',
        'margin-bottom': '20px',
        border: '1px solid var(--border)',
        'border-radius': 'var(--radius-lg)',
      }}
    >
      <table
        style={{
          width: '100%',
          'border-collapse': 'collapse',
          'font-size': '13px',
          color: 'var(--text-secondary)',
        }}
      >
        <thead>
          <tr style={{ 'border-bottom': '1px solid var(--border)' }}>
            <For each={props.headers}>{(h) => <th style={cellHead}>{h}</th>}</For>
          </tr>
        </thead>
        <tbody>
          <For each={props.rows}>
            {(row) => (
              <tr style={{ 'border-bottom': '1px solid var(--border)' }}>
                <For each={row}>
                  {(cell, i) => (
                    <td
                      style={{
                        ...(mono.has(i()) ? cellMono : cellText),
                        // Signatures can be long; let the first column wrap
                        // unless the caller wants nowrap names.
                        'white-space': mono.has(i()) && !props.wrapFirst ? 'nowrap' : 'normal',
                      }}
                    >
                      {mono.has(i()) ? cell : <DocText text={cell} />}
                    </td>
                  )}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}

export default function ApiReference() {
  return (
    <>
      <Section id="api-methods" title="ChartHandle Methods">
        <Prose>
          The <code>ChartHandle</code> object is returned by <code>createChart(element, options)</code> and by the{' '}
          <code>onReady</code> callback on <code>&lt;Chart&gt;</code>. This table is generated from the
          library's type declarations, so it always matches the installed version.
        </Prose>
        <ApiTable
          headers={['Member', 'Description']}
          wrapFirst
          rows={api.methods.map((m) => [m.signature, m.doc])}
        />
      </Section>

      <Section id="api-events" title="Events">
        <Prose>
          Subscribe with <code>chart.on(event, handler)</code>. The returned function unsubscribes.
        </Prose>
        <ApiTable
          headers={['Event', 'Handler', 'Description']}
          monoColumns={[0, 1]}
          rows={api.events.map((e) => [e.name, e.type, e.doc])}
        />
        <CodeBlock code={`// Example: log viewport changes
const unsub = chart.on('viewport:change', (viewport) => {
  console.log(viewport.x);
});

// Later: unsubscribe
unsub();`} />
      </Section>

      <Section id="api-scatter-options" title="Scatter Series Options">
        <Prose>
          Scatter series use named fields or typed accessors for coordinates, color, size and tooltip values. Source rows and stable series IDs are included in interaction payloads.
        </Prose>
        <ApiTable
          headers={['Option', 'Type', 'Description']}
          monoColumns={[0, 1]}
          rows={api.scatter.map((s) => [s.name + (s.optional ? '?' : ''), s.type, s.doc])}
        />
        <CodeBlock code={`colorBy: {
  field: 'value3',
  type: 'category',       // 'auto' | 'category' | 'continuous' | 'diverging'
  palette: ['#4f8fea', '#58b884', '#e6a23c'],
  label: 'Model family',
  format: (value) => MODEL_FAMILIES[Math.round(value)] ?? 'Other',
}

sizeBy: {
  field: 'value4',
  domain: [0, 600],
  range: [2, 8],          // radius in CSS pixels
  scale: 'sqrt',
  label: 'Runtime',
  format: (value) => \`\${(value / 60).toFixed(1)} min\`,
}

tooltipFields: [
  { field: 'value5', label: 'Accuracy', format: (v) => \`\${(v * 100).toFixed(1)}%\` },
]`} />
      </Section>

      <Section id="api-types" title="Types">
        <Prose>
          Type exports from <code>snaplot</code>:
        </Prose>
        <ApiTable
          headers={['Type', 'Description']}
          rows={api.types.map((t) => [t.name, t.doc])}
        />
        <Prose>
          Type exports from <code>snaplot/solid</code>:
        </Prose>
        <ApiTable
          headers={['Type', 'Description']}
          rows={api.solidTypes.map((t) => [t.name, t.doc])}
        />
        <Prose>Type exports from <code>snaplot/react</code>:</Prose>
        <ApiTable headers={['Type', 'Description']} rows={api.reactTypes.map(t => [t.name, t.doc])} />
      </Section>
    </>
  );
}
