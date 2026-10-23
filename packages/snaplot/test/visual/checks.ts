/**
 * The geometry checks (plan M3a scope 4), as pure functions over a `GeometryReport`. They are
 * platform-independent: they read DOM label boxes and data-layer ink, never pixels against a
 * baseline, so they gate on every platform.
 */
import type { GeometryCheck } from './fixtures/types';
import type { GeometryReport, PageLabel, PageRect } from './page-api';

export const CHECKS: Record<GeometryCheck, string> = {
  overlap: 'no two label boxes overlap',
  repeat: 'no two adjacent labels on an axis share text',
  minLabels: 'every axis of 120 px or more shows at least 2 labels',
  paints: 'every finite datum paints at least 1 pixel',
  inside: 'every label stays inside the chart box',
};

export const CHECK_ORDER = Object.keys(CHECKS) as GeometryCheck[];

/** Sub-pixel slack for layout rounding. */
const SLACK = 0.5;
/** The plot length from which an axis must show two labels. */
export const MIN_AXIS_PX = 120;

const fmt = (n: number) => Math.round(n * 10) / 10;

function intersection(a: PageRect, b: PageRect): { w: number; h: number } {
  return {
    w: Math.min(a.right, b.right) - Math.max(a.left, b.left),
    h: Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top),
  };
}

function overlap(report: GeometryReport): string[] {
  const out: string[] = [];
  const { labels } = report;
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i]!;
      const b = labels[j]!;
      const { w, h } = intersection(a.rect, b.rect);
      if (w > SLACK && h > SLACK) out.push(`"${a.text}" × "${b.text}" (${fmt(w)} × ${fmt(h)} px)`);
    }
  }
  return out;
}

const isTick = (label: PageLabel) => label.kind !== 'title';

function ticksByAxis(report: GeometryReport): Map<string, PageLabel[]> {
  const byAxis = new Map<string, PageLabel[]>();
  for (const label of report.labels) {
    if (!isTick(label) || label.axis === null) continue;
    const list = byAxis.get(label.axis) ?? [];
    list.push(label);
    byAxis.set(label.axis, list);
  }
  return byAxis;
}

function repeat(report: GeometryReport): string[] {
  const out: string[] = [];
  for (const [axis, list] of ticksByAxis(report)) {
    const horizontal = report.axes.find((a) => a.key === axis)?.horizontal ?? axis.startsWith('x');
    const centre = (l: PageLabel) =>
      horizontal ? (l.rect.left + l.rect.right) / 2 : (l.rect.top + l.rect.bottom) / 2;
    const sorted = [...list].sort((a, b) => centre(a) - centre(b));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.text === sorted[i - 1]!.text) out.push(`${axis}: "${sorted[i]!.text}" twice`);
    }
  }
  return out;
}

function minLabels(report: GeometryReport): string[] {
  const byAxis = ticksByAxis(report);
  return report.axes
    .filter((axis) => axis.extent >= MIN_AXIS_PX)
    .filter((axis) => (byAxis.get(axis.key)?.length ?? 0) < 2)
    .map(
      (axis) =>
        `${axis.key} (${axis.position}, ${fmt(axis.extent)} px): ${byAxis.get(axis.key)?.length ?? 0} label(s)` +
        ` [${(byAxis.get(axis.key) ?? []).map((l) => l.text).join(', ')}]`,
    );
}

function paints(report: GeometryReport): string[] {
  if (report.probes.length === 0) {
    return [`no datum was probed (${report.unprobed.join('; ') || 'no finite data'})`];
  }
  const missing = report.probes.filter((p) => !p.inked);
  const shown = missing
    .slice(0, 8)
    .map((p) => `${p.series} (${fmt(p.x)}, ${fmt(p.y)}) at ${fmt(p.px)},${fmt(p.py)} px`);
  if (missing.length > shown.length) shown.push(`… ${missing.length - shown.length} more`);
  return missing.length > 0
    ? [`${missing.length}/${report.probes.length} unpainted`, ...shown]
    : [];
}

function inside(report: GeometryReport): string[] {
  const { host } = report;
  return report.labels
    .filter(
      (l) =>
        l.rect.left < host.left - SLACK ||
        l.rect.top < host.top - SLACK ||
        l.rect.right > host.right + SLACK ||
        l.rect.bottom > host.bottom + SLACK,
    )
    .map((l) => {
      const over = [
        host.left - l.rect.left,
        host.top - l.rect.top,
        l.rect.right - host.right,
        l.rect.bottom - host.bottom,
      ];
      return `"${l.text}" overflows by ${fmt(Math.max(...over))} px`;
    });
}

const RUNNERS: Record<GeometryCheck, (report: GeometryReport) => string[]> = {
  overlap,
  repeat,
  minLabels,
  paints,
  inside,
};

/** Human-readable violations of one check; empty when the check passes. */
export function violations(report: GeometryReport, check: GeometryCheck): string[] {
  return RUNNERS[check](report);
}
