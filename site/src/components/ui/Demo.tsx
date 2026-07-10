import type { ColumnarData, ChartInstance } from 'snaplot';
import LiveEditor from '../LiveEditor';
import LazyMount from './LazyMount';

/**
 * Demo section on the Docs page, a titled block with an editable live
 * chart. Renamed from the old `Ex` helper; same interface.
 */
export default function Demo(props: {
  title: string;
  desc?: string;
  code: string;
  data: ColumnarData;
  height?: string;
  onReady?: (c: ChartInstance) => void;
}) {
  return (
    <div style={{ 'margin-bottom': 'var(--space-6)' }}>
      <h3
        style={{
          'font-size': 'var(--fs-sm)',
          'font-weight': '600',
          'margin-bottom': 'var(--space-1)',
        }}
      >
        {props.title}
      </h3>
      {props.desc && (
        <p
          style={{
            'font-size': 'var(--fs-sm)',
            color: 'var(--text-secondary)',
            'margin-bottom': '10px',
          }}
        >
          {props.desc}
        </p>
      )}
      <LazyMount estHeight={demoEstHeight(props.code, props.height)}>
        <LiveEditor
          defaultCode={props.code}
          data={props.data}
          height={props.height}
          onReady={props.onReady}
        />
      </LazyMount>
    </div>
  );
}

/**
 * Approximate rendered height of chart + editor so the lazy placeholder
 * holds roughly the right space: exactness doesn't matter, the swap
 * happens 800px before the demo is visible.
 */
function demoEstHeight(code: string, chartHeight?: string): string {
  const chart = Number.parseInt(chartHeight ?? '280', 10) || 280;
  const editorLines = code.split('\n').length;
  return `${chart + editorLines * 22 + 60}px`;
}
