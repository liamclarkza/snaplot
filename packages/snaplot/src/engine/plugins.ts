/**
 * The plugin host (plan D21). Each draw slot runs the built-in annotations first, then the user
 * plugins in array order: `drawBelow` after the grid, `drawAbove` after the marks, `drawOverlay`
 * after the crosshair. User plugins are reconciled by id, so an inline plugin object installs
 * once and its latest hooks draw. Each hook is isolated: one that throws is reported once and its
 * plugin is disabled. There is no veto and no data hook, so the host never reads data (arch-01).
 */
import { warnOnce } from './errors';
import type { EngineHost, Plugin } from './spec';

/** The plot rectangle a draw hook receives, in CSS pixels from the canvases' top-left corner. */
export interface PlotRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A user plugin as the host reads it (the public `ChartPlugin`). */
export interface HostedPlugin<Chart> {
  id: string;
  install?(chart: Chart): void | (() => void);
  drawBelow?(context: CanvasRenderingContext2D, chart: Chart, plot: PlotRect): void;
  drawAbove?(context: CanvasRenderingContext2D, chart: Chart, plot: PlotRect): void;
  drawOverlay?(context: CanvasRenderingContext2D, chart: Chart, plot: PlotRect): void;
}

/** The engine's three draw slots. */
export type DrawSlot = 'below' | 'above' | 'overlay';

const USER_HOOK = { below: 'drawBelow', above: 'drawAbove', overlay: 'drawOverlay' } as const;
const BUILTIN_HOOK = {
  below: 'afterDrawGrid',
  above: 'afterDrawData',
  overlay: 'afterDrawOverlay',
} as const;

interface Entry<Chart> {
  /** The latest object given for this id: its hooks are the ones that run. */
  plugin: HostedPlugin<Chart>;
  cleanup?: () => void;
  disabled: boolean;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class PluginHost<Chart> {
  private builtins: Plugin[] = [];
  private entries = new Map<string, Entry<Chart>>();
  private chart?: Chart;

  /** Add a built-in plugin (the reference lines and regions), drawn before the user's. */
  addBuiltin(plugin: Plugin, engine: EngineHost): void {
    if (this.builtins.some((other) => other.id === plugin.id)) return;
    this.builtins.push(plugin);
    plugin.install?.(engine);
  }

  /**
   * Reconcile the user plugins by id: a new id installs, a missing one is cleaned up, and an id
   * that stays keeps its installation and draws with the object given now.
   */
  reconcile(plugins: readonly HostedPlugin<Chart>[], chart: Chart): void {
    this.chart = chart;
    const next = new Map<string, Entry<Chart>>();
    const added: Entry<Chart>[] = [];
    for (const plugin of plugins) {
      const entry = this.entries.get(plugin.id);
      if (entry) {
        entry.plugin = plugin;
        next.set(plugin.id, entry);
      } else {
        const created: Entry<Chart> = { plugin, disabled: false };
        next.set(plugin.id, created);
        added.push(created);
      }
    }
    const removed = [...this.entries].filter(([id]) => !next.has(id)).map(([, entry]) => entry);
    this.entries = next;
    for (const entry of removed.reverse()) this.clean(entry);
    for (const entry of added) this.install(entry, chart);
  }

  private install(entry: Entry<Chart>, chart: Chart): void {
    const { plugin } = entry;
    if (typeof plugin.install !== 'function') return;
    try {
      const cleanup = plugin.install(chart);
      if (typeof cleanup === 'function') entry.cleanup = cleanup;
    } catch (error) {
      this.disable(entry, 'install', error);
    }
  }

  private clean(entry: Entry<Chart>): void {
    const cleanup = entry.cleanup;
    entry.cleanup = undefined;
    if (!cleanup) return;
    try {
      cleanup();
    } catch (error) {
      this.disable(entry, 'cleanup', error);
    }
  }

  private disable(entry: Entry<Chart>, hook: string, error: unknown): void {
    entry.disabled = true;
    warnOnce(
      'plugin-error',
      `plugin "${entry.plugin.id}" ${hook} threw (${message(error)}) and is disabled.`,
    );
  }

  /** Run one draw slot: the built-ins, then each user plugin in order. */
  draw(
    slot: DrawSlot,
    context: CanvasRenderingContext2D,
    engine: EngineHost,
    plot: PlotRect,
  ): void {
    const builtin = BUILTIN_HOOK[slot];
    for (const plugin of this.builtins) plugin[builtin]?.(engine, context);
    const chart = this.chart;
    if (!chart) return;
    const hook = USER_HOOK[slot];
    for (const entry of this.entries.values()) {
      const draw = entry.plugin[hook];
      if (entry.disabled || typeof draw !== 'function') continue;
      context.save();
      try {
        draw.call(entry.plugin, context, chart, { ...plot });
      } catch (error) {
        this.disable(entry, hook, error);
      } finally {
        context.restore();
      }
    }
  }

  /** Clean up every plugin, the user's in reverse order, then the built-ins. */
  destroy(engine: EngineHost): void {
    for (const entry of [...this.entries.values()].reverse()) this.clean(entry);
    this.entries.clear();
    for (const plugin of this.builtins) plugin.destroy?.(engine);
    this.builtins = [];
    this.chart = undefined;
  }
}
