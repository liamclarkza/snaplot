import { Component, Suspense, lazy, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { SnaplotAdapter } from './adapters/SnaplotAdapter';
import { buildCharts, scenarios } from './scenarios';
import type { ChartAdapterProps, DataState, LibraryId, ScenarioId, ThemeMode } from './types';

const ChartjsChart = lazy(() => import('./adapters/ChartjsChart').then((m) => ({ default: m.ChartjsChart })));
const RechartsChart = lazy(() => import('./adapters/RechartsChart').then((m) => ({ default: m.RechartsChart })));
const EchartsChart = lazy(() => import('./adapters/EchartsChart').then((m) => ({ default: m.EchartsChart })));
const libraries: { id: LibraryId; name: string; renderer: string }[] = [
  { id: 'snaplot', name: 'Snaplot', renderer: 'Canvas · React' },
  { id: 'chartjs', name: 'Chart.js', renderer: 'Canvas · imperative adapter' },
  { id: 'recharts', name: 'Recharts', renderer: 'SVG · native React' },
  { id: 'echarts', name: 'ECharts', renderer: 'Canvas · imperative adapter' },
];

class ChartBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state: { message: string | null } = { message: null };
  static getDerivedStateFromError(error: Error) { return { message: error.message }; }
  render() {
    return this.state.message ? <div className="chart-error" role="alert">Chart error: {this.state.message}</div> : this.props.children;
  }
}

function Renderer({ library, ...props }: ChartAdapterProps & { library: LibraryId }) {
  switch (library) {
    case 'chartjs': return <ChartjsChart {...props} />;
    case 'recharts': return <RechartsChart {...props} />;
    case 'echarts': return <EchartsChart {...props} />;
    default: return <SnaplotAdapter {...props} />;
  }
}

function ChartCard({ spec, library, theme, hidden, toggle, epoch }: ChartAdapterProps & { library: LibraryId; toggle: (id: string) => void; epoch: number }) {
  return <article className="chart-card" data-chart={spec.id} data-library={library}>
    <header className="chart-heading"><div><h3>{spec.title}</h3><p>{spec.subtitle}</p></div><span className="row-count">{spec.rows.length.toLocaleString('en-US')} rows</span></header>
    <div className="series-legend" role="group" aria-label={`${spec.title} series`}>
      {spec.series.map((series) => <button type="button" key={series.id} aria-pressed={!hidden.includes(series.id)} onClick={() => toggle(series.id)}><span style={{ background: series.color }} />{series.label}</button>)}
    </div>
    <div className="chart-viewport">
      <ChartBoundary key={`${spec.id}-${library}-${epoch}`}>
        <Suspense fallback={<div className="chart-empty">Loading renderer…</div>}>
          <Renderer library={library} spec={spec} theme={theme} hidden={hidden} />
        </Suspense>
      </ChartBoundary>
      {spec.rows.length === 0 && <div className="chart-empty">No observations in this window<span>Switch data state to restore the fixture.</span></div>}
    </div>
  </article>;
}

export function App() {
  const [initial] = useState(() => new URLSearchParams(window.location.search));
  const [scenarioId, setScenarioId] = useState<ScenarioId>(() => scenarios.find((s) => s.id === initial.get('scenario'))?.id ?? 'uav');
  const [library, setLibrary] = useState<LibraryId>(() => libraries.find((l) => l.id === initial.get('library'))?.id ?? 'snaplot');
  const [compare, setCompare] = useState(initial.get('compare') === '1');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [dataState, setDataState] = useState<DataState>('ready');
  const [count, setCount] = useState(180);
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [focused, setFocused] = useState(false);
  const [compact, setCompact] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [epoch, setEpoch] = useState(0);
  const [hidden, setHidden] = useState<string[]>([]);
  const scenario = scenarios.find((s) => s.id === scenarioId)!;
  const charts = useMemo(() => buildCharts(scenarioId, count, tick, dataState, focused), [scenarioId, count, tick, dataState, focused]);
  useEffect(() => {
    const search = new URLSearchParams({ scenario: scenarioId, library });
    if (compare) search.set('compare', '1');
    window.history.replaceState(null, '', `?${search}`);
  }, [scenarioId, library, compare]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setTick((t) => t + 1), 500);
    return () => window.clearInterval(timer);
  }, [playing]);
  function chooseScenario(id: ScenarioId) {
    setScenarioId(id); setTick(0); setHidden([]); setEpoch((n) => n + 1);
  }
  function toggleSeries(id: string) { setHidden((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]); }
  const activeLibraries = compare ? libraries : libraries.filter((l) => l.id === library);
  return <div className={`app scenario-${scenarioId} ${sidebar ? '' : 'sidebar-collapsed'}`} data-theme={theme} style={{ '--accent': scenario.accent } as CSSProperties}>
    <a className="skip-link" href="#workspace">Skip to charts</a>
    <aside className="sidebar">
      <a href="?scenario=uav&library=snaplot" className="brand"><span className="brand-mark">s/</span><span>snaplot<span className="brand-sub">FIELD TRIALS</span></span></a>
      <p className="nav-label">THE CHALLENGES <span>05</span></p>
      <nav aria-label="Demo scenarios">{scenarios.map((item) => <button type="button" key={item.id} className={item.id === scenarioId ? 'active' : ''} onClick={() => chooseScenario(item.id)} aria-current={item.id === scenarioId ? 'page' : undefined}><span className="nav-number">{item.number}</span><span>{item.name}</span><span className="nav-arrow">↗</span></button>)}</nav>
      <div className="sidebar-note"><span className="status-dot" /> EXPERIMENT 001<p>Five contexts.<br />Four libraries.<br />The same hard questions.</p><small>Local source · synthetic data<br />React StrictMode enabled</small></div>
      <div className="sidebar-footer">DESIGN × DEVELOPER EXPERIENCE<span>v0.1 / COMPARISON LAB</span></div>
    </aside>
    <main id="workspace">
      <header className="topbar"><div><button type="button" className="icon-button" onClick={() => setSidebar(!sidebar)} aria-label="Toggle sidebar">☰</button><span className="product-name">{scenario.product}</span></div><div><span className="synthetic-badge">SYNTHETIC DATA</span><button type="button" className="text-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? 'Light theme' : 'Dark theme'}</button></div></header>
      <div className="workspace-content">
        <section className="intro"><div><p className="eyebrow">{scenario.eyebrow}</p><h1>{scenario.title}</h1><p className="description">{scenario.description}</p></div><div className="trial-stamp"><span>{scenario.number}<span>/05</span></span><small>{scenario.operator}</small></div></section>
        <section className="comparison-toolbar" aria-label="Comparison controls"><div className="library-tabs" role="group" aria-label="Chart library">{libraries.map((item) => <button type="button" key={item.id} className={!compare && library === item.id ? 'selected' : ''} aria-pressed={!compare && library === item.id} onClick={() => { setLibrary(item.id); setCompare(false); }}>{item.name}</button>)}</div><button type="button" className={`compare-button ${compare ? 'selected' : ''}`} aria-pressed={compare} onClick={() => setCompare(!compare)}>Compare all <span>↗</span></button></section>
        <section className="metrics" aria-label="Scenario snapshot">{scenario.metrics.map((metric) => <article key={metric.label}><p>{metric.label}</p><strong>{metric.value}</strong><small>{metric.detail}</small></article>)}</section>
        <div className="snapshot-note">Scenario snapshot above · chart replay tick <output aria-label="Replay tick">{tick}</output> below</div>
        <section className="stress-toolbar" aria-label="Chart stress controls">
          <div className="replay-controls"><button type="button" className="replay-button" onClick={() => setPlaying(!playing)}>{playing ? 'Ⅱ Pause replay' : '▶ Play replay'}</button><button type="button" className="text-button" onClick={() => setTick((n) => n + 1)}>Step +1</button></div>
          <label>Data<select aria-label="Data state" value={dataState} onChange={(e) => setDataState(e.target.value as DataState)}><option value="ready">Complete</option><option value="gaps">Missing samples</option><option value="empty">Empty</option></select></label>
          <label>Density<select aria-label="Data density" value={count} onChange={(e) => setCount(Number(e.target.value))}><option value={180}>180 samples</option><option value={2000}>2,000 samples</option></select></label>
          <label>Window<select aria-label="Data window" value={focused ? 'focus' : 'full'} onChange={(e) => setFocused(e.target.value === 'focus')}><option value="full">Full range</option><option value="focus">Final third</option></select></label>
          <button type="button" className="text-button" aria-pressed={compact} onClick={() => setCompact(!compact)}>Compact cards</button>
          <button type="button" className="text-button" onClick={() => setEpoch((n) => n + 1)}>Remount charts</button>
        </section>
        <div className={`renderers ${compare ? 'comparison-grid' : ''} ${compact ? 'compact' : ''}`}>
          {activeLibraries.map((item) => <section className="renderer-section" key={item.id} aria-label={`${item.name} dashboard`}>
            <div className="renderer-heading"><h2>{item.name}<span>{item.renderer}</span></h2><span className="live-status"><span className={playing ? 'status-dot' : 'paused-dot'} />{playing ? 'REPLAY / 2 Hz' : 'PAUSED'}</span></div>
            <div className="charts">{charts.map((chart) => <ChartCard key={`${scenarioId}-${chart.id}`} spec={chart} library={item.id} theme={theme} hidden={hidden} toggle={toggleSeries} epoch={epoch} />)}</div>
          </section>)}
        </div>
        <section className="context-grid"><article className="context-card"><header><h2>Operations notebook</h2><span>FIXTURE SNAPSHOT</span></header><div className="table-scroll"><table><thead><tr>{scenario.table.headings.map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{scenario.table.rows.map((row) => <tr key={row[0]}>{row.map((cell, i) => <td key={scenario.table.headings[i]}>{cell}</td>)}</tr>)}</tbody></table></div></article><article className="context-card challenge-card"><header><h2>What this should expose</h2><span>REVIEW BRIEF</span></header><ol>{scenario.challenges.map((challenge) => <li key={challenge}>{challenge}</li>)}</ol></article></section>
        <footer className="workspace-footer"><span>Same fixtures. Same container sizes. Native library rendering. <a href="/?audit=defaults">Open defaults audit →</a></span><span>Shared controls ≠ native feature parity · no performance ranking implied.</span></footer>
      </div>
    </main>
  </div>;
}
