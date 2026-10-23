/**
 * Chart groups (createChartGroup): members share their cursor and highlight and,
 * with `viewport: true`, their horizontal viewport (plan D17). M8 replaces the
 * group model; this module holds today's.
 */
import type { ScaleRange } from '../engine/spec';
import { fail } from '../engine/errors';
import { equivalent } from './options';
import type { ChartGroup, ChartGroupOptions, ChartHandle, ChartOptions, ChartState } from './types';

/** What a group needs from each member chart. */
export interface GroupMember {
  getState(): Pick<ChartState, 'viewport' | 'highlightedSeries' | 'hiddenSeries'>;
  getOptions(): { axes?: ChartOptions['axes']; group?: ChartGroup };
  getAxis(key: string): Readonly<{ type: string; min: number; max: number }> | undefined;
  getLayout(): ReturnType<ChartHandle['getLayout']>;
  syncViewport(key: string, range: ScaleRange, reset: boolean): void;
  setCursor(x: number | Date | string | null): void;
  setHighlight(id: string | null): void;
  coordinatePadding(left: number | undefined, right: number | undefined): void;
  naturalRange(key: string): { min: number; max: number } | undefined;
  coordinateRange(key: string, range: { min: number; max: number }): void;
  groupCategories(): ReadonlyMap<string, readonly string[]>;
  detachGroup(group: ChartGroup): void;
}
interface GroupRecord {
  members: Set<GroupMember>;
  broadcasting: boolean;
  destroyed: boolean;
}
/** Live groups and their members. */
export const groups = new WeakMap<ChartGroup, GroupRecord>();

/**
 * Link charts: pass the group as each chart's `group` option. Members share their cursor and
 * highlight and, with `viewport: true`, their horizontal viewport.
 *
 * @example
 * ```ts
 * const group = createChartGroup({ viewport: true });
 * createChart(a, { ...latency, group });
 * createChart(b, { ...errors, group });
 * ```
 */
export function createChartGroup(options: ChartGroupOptions = {}): ChartGroup {
  const record: GroupRecord = { members: new Set(), broadcasting: false, destroyed: false };
  const group: ChartGroup = {
    options: Object.freeze({ cursor: true, highlight: true, ...options }),
    setCursor(value) {
      broadcast(group, (member) => member.setCursor(value));
    },
    setHighlight(id) {
      broadcast(group, (member) => member.setHighlight(id));
    },
    destroy() {
      if (record.destroyed) return;
      record.destroyed = true;
      for (const member of record.members) member.detachGroup(group);
      record.members.clear();
    },
  };
  groups.set(group, record);
  return group;
}

/** Apply `apply` to every member but `source`, once (no re-entry). */
export function broadcast(
  group: ChartGroup | undefined,
  apply: (member: GroupMember) => void,
  source?: GroupMember,
): void {
  if (!group) return;
  const record = groups.get(group);
  if (!record || record.destroyed || record.broadcasting) return;
  record.broadcasting = true;
  try {
    for (const member of record.members) if (member !== source) apply(member);
  } finally {
    record.broadcasting = false;
  }
}

/** What a chart would bring to a group: its category orders and axis types. */
export interface GroupCandidate {
  categories: ReadonlyMap<string, readonly string[]>;
  axes: Readonly<Record<string, { type?: string }>>;
}

/** Throw unless a chart with `candidate`'s axes can join `group`. */
export function validateGroup(
  group: ChartGroup | undefined,
  candidate: GroupCandidate,
  source?: GroupMember,
): void {
  if (!group) return;
  const record = groups.get(group);
  if (record?.destroyed && source?.getOptions().group === group) return;
  if (!record || record.destroyed) fail('group must be a live createChartGroup() result.');
  for (const member of record.members) {
    if (member === source) continue;
    const keys = group.options.yRange ? ['x', group.options.yAxis ?? 'y'] : ['x'];
    for (const key of keys) {
      const axis = member.getAxis(key);
      const type = candidate.categories.has(key)
        ? 'category'
        : (candidate.axes[key]?.type ?? 'linear');
      if (axis && axis.type !== type)
        fail(
          `charts in one group need the same kind of axis "${key}", not ${axis.type} and ${type}.`,
        );
      if (
        type === 'category' &&
        !equivalent(member.groupCategories().get(key), candidate.categories.get(key))
      ) {
        fail(
          `charts in one group need the same category order on axis "${key}". Set axes.${key}.categories in each chart.`,
        );
      }
    }
  }
}

/**
 * Re-coordinate a group: align plot padding (`alignPlots`), then share Y
 * (`yRange`). Runs on mount, update, visibility and resize. Horizontal
 * viewport changes pass `shareY` only: they move no Y gutter, and the
 * padding pass costs two `setOptions` per member on every wheel or drag
 * event.
 */
export function coordinate(group: ChartGroup | undefined, only?: 'shareY'): void {
  if (!group) return;
  const record = groups.get(group);
  if (!record || record.destroyed || record.broadcasting) return;
  record.broadcasting = true;
  try {
    if (only !== 'shareY' && group.options.alignPlots && record.members.size) {
      // Measure each member's own gutters, not the previous group's maximum.
      for (const member of record.members) member.coordinatePadding(undefined, undefined);
      const layouts = [...record.members].map((member) => member.getLayout());
      const left = Math.max(...layouts.map((layout) => layout.plot.left));
      const right = Math.max(
        ...layouts.map((layout) => layout.width - layout.plot.left - layout.plot.width),
      );
      for (const member of record.members) member.coordinatePadding(left, right);
    }
    if (group.options.yRange) {
      const key = group.options.yAxis ?? 'y';
      const domains = [...record.members]
        .map((member) => member.naturalRange(key))
        .filter((axis) => !!axis);
      if (domains.length) {
        const range = {
          min: Math.min(...domains.map((axis) => axis.min)),
          max: Math.max(...domains.map((axis) => axis.max)),
        };
        for (const member of record.members) member.coordinateRange(key, range);
      }
    }
  } finally {
    record.broadcasting = false;
  }
}
