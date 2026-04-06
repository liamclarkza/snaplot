import type { JSX } from 'solid-js';
import type { ChartConfig } from 'snaplot';
import CodeBlock from './CodeBlock';

/**
 * Serializes a ChartConfig to a readable TypeScript-like string for display.
 * Handles the common cases (primitives, arrays, nested objects).
 * Functions and special objects are shown as placeholder comments.
 */
function configToString(config: ChartConfig, varName = 'config'): string {
  const indent = (s: string, n: number) => s.split('\n').map(l => ' '.repeat(n) + l).join('\n');

  function serialize(val: unknown, depth: number): string {
    if (val === null || val === undefined) return String(val);
    if (typeof val === 'function') return '/* custom function */';
    if (typeof val === 'string') return `'${val}'`;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    if (Array.isArray(val)) {
      if (val.length === 0) return '[]';
      const items = val.map(v => serialize(v, depth + 1));
      if (items.join(', ').length < 60 && !items.some(i => i.includes('\n'))) {
        return `[${items.join(', ')}]`;
      }
      return `[\n${items.map(i => indent(i, (depth + 1) * 2) + ',').join('\n')}\n${' '.repeat(depth * 2)}]`;
    }
    if (typeof val === 'object') {
      const entries = Object.entries(val as Record<string, unknown>).filter(
        ([_, v]) => v !== undefined
      );
      if (entries.length === 0) return '{}';
      const lines = entries.map(([k, v]) => {
        const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : `'${k}'`;
        return `${' '.repeat((depth + 1) * 2)}${key}: ${serialize(v, depth + 1)},`;
      });
      return `{\n${lines.join('\n')}\n${' '.repeat(depth * 2)}}`;
    }
    return String(val);
  }

  return `const ${varName}: ChartConfig = ${serialize(config, 0)};`;
}

/**
 * Shows a live chart above its auto-generated config code.
 * Config is defined once — used for both the live chart and the code display.
 */
export default function LiveExample(props: {
  title: string;
  description?: string;
  config: ChartConfig;
  /** Extra code to show before the config (imports, data generation, etc.) */
  preamble?: string;
  height?: string;
  children: JSX.Element;
}) {
  const code = () => {
    const parts: string[] = [];
    if (props.preamble) parts.push(props.preamble);
    parts.push(configToString(props.config));
    return parts.join('\n\n');
  };

  return (
    <div style={{ 'margin-bottom': '40px' }}>
      {props.title && (
        <h3 style={{
          'font-size': '15px',
          'font-weight': '600',
          'margin-bottom': '6px',
          color: 'var(--text)',
        }}>
          {props.title}
        </h3>
      )}
      {props.description && (
        <p style={{
          'font-size': '13px',
          color: 'var(--text-secondary)',
          'margin-bottom': '12px',
          'line-height': '1.5',
        }}>
          {props.description}
        </p>
      )}
      <div style={{
        border: '1px solid var(--border)',
        'border-radius': 'var(--radius-lg)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: props.height ?? '280px',
          background: 'var(--bg-surface)',
        }}>
          {props.children}
        </div>
        <div style={{ 'border-top': '1px solid var(--border)' }}>
          <CodeBlock code={code()} />
        </div>
      </div>
    </div>
  );
}
