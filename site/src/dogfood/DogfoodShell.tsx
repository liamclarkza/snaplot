import type { JSX } from 'solid-js';

const apps = [
  { href: '#/pulseops', label: 'PulseOps', mark: 'P' },
  { href: '#/cohortlab', label: 'CohortLab', mark: 'C' },
  { href: '#/gridscope', label: 'GridScope', mark: 'G' },
];

export function DogfoodShell(props: {
  active: string;
  product: string;
  eyebrow: string;
  children: JSX.Element;
}) {
  return (
    <div class={`dogfood-app dogfood-${props.active}`}>
      <a class="skip-link" href="#dogfood-content">Skip to content</a>
      <header class="dogfood-topbar">
        <a class="dogfood-brand" href={`#/${props.active}`} aria-label={`${props.product} home`}>
          <span class="dogfood-brand-mark" aria-hidden="true">{props.product.slice(0, 1)}</span>
          <span><strong>{props.product}</strong><small>{props.eyebrow}</small></span>
        </a>
        <nav class="dogfood-switcher" aria-label="Dogfood applications">
          {apps.map((app) => (
            <a href={app.href} aria-current={props.active === app.href.slice(2) ? 'page' : undefined}>
              <span aria-hidden="true">{app.mark}</span>{app.label}
            </a>
          ))}
        </nav>
        <a class="dogfood-back" href="#/demos">Snaplot demos <span aria-hidden="true">↗</span></a>
      </header>
      <main id="dogfood-content" tabIndex={-1}>{props.children}</main>
    </div>
  );
}

export function ChartCard(props: {
  title: string;
  subtitle?: string;
  meta?: JSX.Element | string;
  class?: string;
  children: JSX.Element;
}) {
  return (
    <section class={`df-card ${props.class ?? ''}`}>
      <header class="df-card-header">
        <div><h2>{props.title}</h2>{props.subtitle && <p>{props.subtitle}</p>}</div>
        {props.meta && <div class="df-card-meta">{props.meta}</div>}
      </header>
      <div class="df-card-body">{props.children}</div>
    </section>
  );
}

export function Metric(props: { label: string; value: string; delta?: string; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <article class="df-metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      {props.delta && <small class={props.tone ? `tone-${props.tone}` : ''}>{props.delta}</small>}
    </article>
  );
}

export function EmptyState(props: { title: string; detail: string }) {
  return <div class="df-empty" role="status"><span aria-hidden="true">◇</span><strong>{props.title}</strong><p>{props.detail}</p></div>;
}

export function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div class="df-segmented" role="group" aria-label={props.label}>
      {props.options.map((option) => (
        <button type="button" classList={{ active: props.value === option.value }} aria-pressed={props.value === option.value} onClick={() => props.onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
