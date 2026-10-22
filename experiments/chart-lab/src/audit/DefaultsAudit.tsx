import { useMemo, useState } from 'react';
import { ChartjsChart } from '../adapters/ChartjsChart';
import { EchartsChart } from '../adapters/EchartsChart';
import { RechartsChart } from '../adapters/RechartsChart';
import { SnaplotAdapter } from '../adapters/SnaplotAdapter';
import type { ChartAdapterProps, LibraryId } from '../types';
import { auditCases, auditSpec, type AuditCase } from './fixtures';
import { NativeChart } from './NativeCharts';
import './audit.css';

const libraries = [['snaplot', 'Snaplot'], ['chartjs', 'Chart.js'], ['recharts', 'Recharts'], ['echarts', 'ECharts']] as const;
const tuned: Record<LibraryId, (props: ChartAdapterProps) => React.ReactNode> = { snaplot: SnaplotAdapter, chartjs: ChartjsChart, recharts: RechartsChart, echarts: EchartsChart };
const hidden: string[] = [];

export default function DefaultsAudit() {
  const [fixture, setFixture] = useState<AuditCase>('baseline');
  const [width, setWidth] = useState(320);
  const [height, setHeight] = useState(220);
  const [mode, setMode] = useState('native');
  const spec = useMemo(() => auditSpec(fixture), [fixture]);
  return <main className="defaults-audit">
    <header><a href="/">← Dashboard lab</a><span>SNAPLOT / DEFAULTS AUDIT</span><h1>How much fixing does a chart need?</h1><p>Choose difficult content. Start with native defaults. Compare with the tuned dashboard adapters.</p></header>
    <section className="audit-controls" aria-label="Defaults audit controls">
      <label>Challenge<select aria-label="Audit challenge" value={fixture} onChange={(e) => setFixture(e.target.value as AuditCase)}>{auditCases.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Card width<select aria-label="Audit width" value={width} onChange={(e) => setWidth(Number(e.target.value))}>{[280, 320, 480, 720].map((v) => <option key={v} value={v}>{v}px</option>)}</select></label>
      <label>Chart height<select aria-label="Audit height" value={height} onChange={(e) => setHeight(Number(e.target.value))}>{[160, 220, 320].map((v) => <option key={v} value={v}>{v}px</option>)}</select></label>
      <label>Implementation<select aria-label="Audit implementation" value={mode} onChange={(e) => setMode(e.target.value)}><option value="native">Native defaults</option><option value="tuned">Tuned dashboard adapter</option></select></label>
    </section>
    <p className="audit-method">Native mode supplies the data, scale bindings, requested labels and necessary container lifecycle only. No custom margins, padding, tick counts, label rotation, colors, legends or empty overlays. Animation is disabled in all libraries. Numeric category encoding is shared, so this case does not compare native category-axis APIs.</p>
    <div className="audit-grid">{libraries.map(([id, label]) => {
      const Adapter = tuned[id];
      return <article key={id} className="audit-card" style={{ width }} data-library={id}>
        <h2>{label}<small>{mode === 'native' ? 'Native defaults' : 'Tuned adapter'}</small></h2>
        <div className="audit-chart" style={{ height }} data-chart={fixture}>
          {mode === 'native' ? <NativeChart library={id} spec={spec} /> : <Adapter spec={spec} theme="light" hidden={hidden} />}
        </div>
      </article>;
    })}</div>
    <section className="audit-checklist"><h2>Review the correction work</h2><ul><li>Are any titles or ticks clipped, overlapping or missing?</li><li>How much of the card remains usable plot area?</li><li>Can the chart adapt when only text or container size changes?</li><li>Which appearance settings, data conversions and companion controls had to be added?</li><li>What did you expect to work that instead requires a special API or application code?</li></ul><p>The tuned mode records a correction cost; it is not evidence that defaults succeeded. A library should deliberately wrap, abbreviate, omit or expose overflow when all content cannot fit, rather than silently draw illegible labels.</p></section>
  </main>;
}
