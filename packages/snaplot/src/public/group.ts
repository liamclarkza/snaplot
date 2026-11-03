/**
 * Chart groups (plan D17). Members share their cursor, their highlight, their horizontal
 * viewport (only the axes a peer has; each chart keeps its own Y unless `yRange`) and their plot
 * edges (`alignPlots`, through plot insets applied only when a gutter changes), and a series id
 * gets the same palette colour in every member. A chart joins with the `group` option and leaves
 * with `update({ group: undefined })` or `destroy()`; an empty group is garbage.
 */
import { fail, suggest, unknownSeries, warnOnce } from '../engine/errors';
import type { ScaleRange } from '../engine/spec';
import { equivalent } from './options';
import type { ChartGroup, ChartGroupOptions } from './types';

/** What a group needs from each member chart. */
export interface GroupMember {
  /** The kind of an axis (`'category'` for category axes), or undefined without it. */
  axisKind(key: string): string | undefined;
  /** Follow a peer's horizontal axis: pin it at `range`, or `null` for a reset. */
  syncViewport(key: string, range: ScaleRange | null): void;
  /** The data X of a cursor value; throws on one the member's X axis cannot read. */
  cursorX(x: number | Date | string | null): number | null;
  syncCursor(x: number | Date | string | null): void;
  syncHighlight(id: string | null): void;
  seriesIds(): readonly string[];
  /** The side gutters the member needs on its own. */
  naturalGutters(): { left: number; right: number };
  /** Apply the group's side gutters, or (undefined) the member's own. */
  setPlotInsets(insets: { left: number; right: number } | undefined): void;
  naturalRange(key: string): ScaleRange | undefined;
  coordinateRange(key: string, range: ScaleRange): void;
  groupCategories(): ReadonlyMap<string, readonly string[]>;
  /** The member leaves `group`: back to its own gutters, Y range and colours. */
  detachGroup(group: ChartGroup): void;
}

interface GroupRecord {
  options: Readonly<Required<ChartGroupOptions>>;
  members: Set<GroupMember>;
  broadcasting: boolean;
  /** The palette slot of each series id, in order of first appearance. */
  colours: Map<string, number>;
}

const GROUP_KEYS = ['cursor', 'highlight', 'viewport', 'alignPlots', 'yRange'];
const GROUP_HINTS: Record<string, string> = {
  yAxis: 'Removed in 0.13: yRange shares the "y" axis.',
  defaults: 'Removed in 0.13: spread shared options into each chart instead.',
};
const DEFAULTS: Required<ChartGroupOptions> = {
  cursor: true,
  highlight: true,
  viewport: true,
  alignPlots: true,
  yRange: false,
};

/** Live groups and their members. */
const groups = new WeakMap<ChartGroup, GroupRecord>();

/** The resolved options of a group, or undefined for one that is not a group. */
export function groupOptions(
  group: ChartGroup | undefined,
): Readonly<Required<ChartGroupOptions>> | undefined {
  return group ? groups.get(group)?.options : undefined;
}

/** Add `member` to `group`, or remove it (`join` false). */
export function membership(
  group: ChartGroup | undefined,
  member: GroupMember,
  join: boolean,
): void {
  const record = group && groups.get(group);
  if (!record) return;
  if (join) record.members.add(member);
  else record.members.delete(member);
}

/** The palette slot of series `id` in `group`: the same in every member (frameworks-21). */
export function paletteIndex(group: ChartGroup | undefined, id: string): number | undefined {
  const record = group && groups.get(group);
  if (!record) return undefined;
  let index = record.colours.get(id);
  if (index === undefined) {
    index = record.colours.size;
    record.colours.set(id, index);
  }
  return index;
}

/**
 * Link charts: pass the group as each chart's `group` option. Members share their cursor,
 * highlight and horizontal viewport, and align their plot edges; Y stays each chart's own unless
 * `yRange`.
 *
 * @example
 * ```ts
 * const group = createChartGroup();
 * createChart(a, { ...latency, group });
 * createChart(b, { ...errors, group });
 * ```
 */
export function createChartGroup(options: ChartGroupOptions = {}): ChartGroup {
  const known: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options ?? {})) {
    if (value === undefined) continue;
    if (GROUP_KEYS.includes(key)) {
      if (typeof value !== 'boolean')
        fail(`createChartGroup() option ${key} must be true or false, not ${String(value)}.`);
      known[key] = value;
      continue;
    }
    const hint =
      GROUP_HINTS[key] ??
      (suggest(key, GROUP_KEYS) ? `Did you mean "${suggest(key, GROUP_KEYS)}"?` : '');
    warnOnce(
      'unknown-option',
      `"${key}" is not a createChartGroup() option and is ignored.${hint ? ` ${hint}` : ''}`,
    );
  }
  const record: GroupRecord = {
    options: Object.freeze({ ...DEFAULTS, ...known }),
    members: new Set(),
    broadcasting: false,
    colours: new Map(),
  };
  const group: ChartGroup = {
    // Members share their X kind and categories (validateGroup), so one member checks a cursor
    // value. A highlight may name a series only some members have; one none has throws
    // (dataapi-22).
    setCursor(value) {
      for (const member of record.members) {
        member.cursorX(value);
        break;
      }
      broadcast(group, (member) => member.syncCursor(value));
    },
    setHighlight(id) {
      const ids = [...record.members].flatMap((member) => member.seriesIds());
      if (id !== null && ids.length && !ids.includes(id)) unknownSeries('setHighlight()', id, ids);
      broadcast(group, (member) => member.syncHighlight(id));
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
  const record = group && groups.get(group);
  if (!record || record.broadcasting) return;
  record.broadcasting = true;
  try {
    for (const member of [...record.members]) if (member !== source) apply(member);
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
  if (!record) fail('group must be a createChartGroup() result.');
  for (const member of record.members) {
    if (member === source) continue;
    const keys = record.options.yRange ? ['x', 'y'] : ['x'];
    for (const key of keys) {
      const kind = member.axisKind(key);
      const type = candidate.categories.has(key)
        ? 'category'
        : (candidate.axes[key]?.type ?? 'linear');
      if (kind && kind !== type)
        fail(`charts in one group need the same kind of axis "${key}", not ${kind} and ${type}.`);
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
 * Re-coordinate a group: align the plot edges (`alignPlots`) to the widest gutters, then share
 * Y (`yRange`). Runs on mount, update, append, resize and leave. A horizontal viewport change
 * passes `shareY` only: it moves no gutter.
 */
export function coordinate(group: ChartGroup | undefined, only?: 'shareY'): void {
  const record = group && groups.get(group);
  if (!record || record.broadcasting || !record.members.size) return;
  record.broadcasting = true;
  try {
    const members = [...record.members];
    if (only !== 'shareY' && record.options.alignPlots) {
      // Each member's own gutters, not the group's last maximum; members skip unchanged insets.
      const gutters = members.map((member) => member.naturalGutters());
      const insets = {
        left: Math.max(...gutters.map((gutter) => gutter.left)),
        right: Math.max(...gutters.map((gutter) => gutter.right)),
      };
      for (const member of members) member.setPlotInsets(insets);
    }
    if (record.options.yRange) {
      const domains = members.map((member) => member.naturalRange('y')).filter((r) => !!r);
      if (domains.length) {
        const range = {
          min: Math.min(...domains.map((r) => r.min)),
          max: Math.max(...domains.map((r) => r.max)),
        };
        for (const member of members) member.coordinateRange('y', range);
      }
    }
  } finally {
    record.broadcasting = false;
  }
}
