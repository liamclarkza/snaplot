import './demos-hub.css';

const demos = [
  {
    href: '#/pulseops',
    eyebrow: 'Live operations',
    name: 'PulseOps',
    description: 'A streaming infrastructure dashboard with synchronized telemetry, SLO bands, thresholds, histograms, and a cursor-linked legend table.',
    theme: 'pulse',
    number: '01',
    features: ['Streaming', 'Sync groups', 'Dark theme'],
  },
  {
    href: '#/cohortlab',
    eyebrow: 'Experiment intelligence',
    name: 'CohortLab',
    description: 'An analytical workspace for exploring 24,000 model runs through encoded scatter plots, density rendering, selection, and linked comparisons.',
    theme: 'cohort',
    number: '02',
    features: ['Scatter', 'Density', 'Box selection'],
  },
  {
    href: '#/gridscope',
    eyebrow: 'Home energy',
    name: 'GridScope',
    description: 'A warm, responsive energy planner combining forecasts, confidence bands, synchronized timelines, touch interactions, and brush summaries.',
    theme: 'grid',
    number: '03',
    features: ['Forecast bands', 'Touch', 'Responsive'],
  },
] as const;

export default function Demos() {
  return (
    <div class="demos-hub">
      <section class="demos-hub-hero">
        <div class="demos-hub-orbit" aria-hidden="true"><i /><i /><i /></div>
        <p class="demos-hub-kicker">Built entirely with Snaplot</p>
        <h1>Three applications.<br />One plotting library.</h1>
        <p class="demos-hub-intro">Explore three complete SolidJS applications that exercise Snaplot’s rendering, interactions, responsive layouts, and developer experience.</p>
        <button class="demos-hub-jump" type="button" onClick={() => document.getElementById('demo-applications')?.scrollIntoView({ behavior: 'smooth' })}>Explore the applications <span aria-hidden="true">↓</span></button>
      </section>

      <section class="demos-hub-apps" id="demo-applications" aria-labelledby="demo-applications-title">
        <header class="demos-section-heading">
          <div><p>Demo applications</p><h2 id="demo-applications-title">Explore Snaplot in complete interfaces.</h2></div>
          <p>Each demo has its own data model, visual language, interactions, and responsive behavior. They share only SolidJS and Snaplot.</p>
        </header>

        <div class="demos-hub-grid">
          {demos.map((demo) => <DemoCard demo={demo} />)}
        </div>
      </section>

      <section class="demos-coverage" aria-labelledby="demos-coverage-title">
        <div class="demos-coverage-copy">
          <p>One library, broad coverage</p>
          <h2 id="demos-coverage-title">Everything from live signals to dense analytical clouds.</h2>
        </div>
        <div class="demos-coverage-list">
          <Coverage value="7" label="Chart types" detail="Line, area, band, scatter, density, bar, histogram" />
          <Coverage value="24k" label="Largest dataset" detail="Interactive points with colour and size encoding" />
          <Coverage value="3" label="Viewports tested" detail="Desktop, tablet, and mobile layouts" />
          <Coverage value="0" label="Other chart libraries" detail="Every primary visualization is Snaplot" />
        </div>
      </section>

      <section class="demos-hub-cta">
        <div><p>Documentation</p><h2>Build your first chart with Snaplot.</h2></div>
        <a href="#/docs">Read the documentation <span aria-hidden="true">↗</span></a>
      </section>
    </div>
  );
}

function DemoCard(props: { demo: typeof demos[number] }) {
  return (
    <article class={`demos-product-card demos-product-${props.demo.theme}`}>
      <a href={props.demo.href} aria-label={`Open ${props.demo.name} demo`}>
        <div class="demos-product-preview" aria-hidden="true">
          <div class="preview-chrome"><span /><span /><span /><b>{props.demo.name}</b></div>
          <Preview theme={props.demo.theme} />
        </div>
        <div class="demos-product-copy">
          <div class="demos-product-number">{props.demo.number}</div>
          <div>
            <p>{props.demo.eyebrow}</p>
            <h3>{props.demo.name}<span aria-hidden="true">↗</span></h3>
            <p class="demos-product-description">{props.demo.description}</p>
            <div class="demos-product-tags">{props.demo.features.map((feature) => <span>{feature}</span>)}</div>
          </div>
        </div>
      </a>
    </article>
  );
}

function Preview(props: { theme: typeof demos[number]['theme'] }) {
  if (props.theme === 'cohort') {
    return <div class="preview-cohort"><div class="preview-sidebar"><i /><i /><i /><i /></div><div class="preview-scatter">{Array.from({ length: 32 }, (_, i) => <i style={{ '--x': `${15 + (i * 37) % 76}%`, '--y': `${12 + (i * 53) % 72}%`, '--s': `${3 + (i % 4)}px` }} />)}</div><div class="preview-score"><i /><i /><i /></div></div>;
  }
  if (props.theme === 'grid') {
    return <div class="preview-grid"><div class="preview-sun">☀</div><svg aria-label="Decorative energy chart preview" role="img" viewBox="0 0 500 190" preserveAspectRatio="none"><path class="grid-area" d="M0,176 C55,174 75,158 105,136 C155,100 180,36 245,24 C310,35 332,104 382,140 C420,165 455,174 500,176 L500,190 L0,190 Z" /><path class="grid-use" d="M0,151 C50,147 73,155 105,118 C135,90 155,148 205,151 C265,154 300,147 340,119 C380,92 406,142 500,148" /></svg><div class="preview-grid-metrics"><i /><i /><i /></div></div>;
  }
  return <div class="preview-pulse"><div class="preview-pulse-metrics"><i /><i /><i /><i /></div><svg aria-label="Decorative telemetry chart preview" role="img" viewBox="0 0 500 190" preserveAspectRatio="none"><path class="pulse-area" d="M0,154 C45,139 64,145 96,132 C132,116 165,139 206,122 C248,106 272,128 304,98 C336,68 356,22 386,62 C417,106 447,82 500,76 L500,190 L0,190 Z" /><path class="pulse-line" d="M0,148 C45,128 64,139 96,125 C132,109 165,133 206,116 C248,99 272,122 304,91 C336,61 356,15 386,55 C417,99 447,75 500,69" /></svg><div class="preview-threshold" /></div>;
}

function Coverage(props: { value: string; label: string; detail: string }) {
  return <article><strong>{props.value}</strong><div><h3>{props.label}</h3><p>{props.detail}</p></div></article>;
}
