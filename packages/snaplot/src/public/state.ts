/**
 * The one public dispatcher (plan §3.2, D3, P14): every notification a chart gives goes through
 * it.
 *
 * - Events raised while a call or a gesture runs are queued and delivered once it has committed,
 *   and a state that changed several times in one action is reported once, with its final value.
 * - Each listener runs on its own: one that throws is reported asynchronously (queueMicrotask)
 *   and the others still run. Delivery iterates a snapshot, so a listener added during a
 *   dispatch runs from the next one.
 * - The cold state has a revision that every data, option or state commit bumps; subscribers
 *   hear about it at most once per animation frame. The cursor is not in it: it is the hot
 *   channel, `cursor:change`.
 */
import { nextFrame } from '../engine/render/scheduler';
import { fail, hint } from '../engine/errors';
import { equivalent } from './options';

/** The state a chart reports through `<key>:change` events (plan §4.4). */
export type ReportedKey = 'viewport' | 'selection' | 'hiddenSeries' | 'highlight' | 'following';
const REPORTED: readonly ReportedKey[] = [
  'viewport',
  'selection',
  'hiddenSeries',
  'highlight',
  'following',
];

type Listener = (value: never) => void;

/** Run `call`; if it throws, report the error asynchronously and carry on (plan P14). */
export function isolated(call: () => void): void {
  try {
    call();
  } catch (error) {
    queueMicrotask(() => {
      throw error;
    });
  }
}

export class Dispatcher<Events extends object> {
  private listeners = new Map<keyof Events, Set<Listener>>();
  private subscribers = new Set<() => void>();
  /** Core views (the legends) that follow every commit at once, not once per frame. */
  private observers = new Set<() => void>();
  private queue: Array<() => void> = [];
  private depth = 0;
  private cancelNotify: (() => void) | null = null;
  /** Bumped by every data, option or state commit. */
  revision = 0;
  /** The value last reported (or applied from options) for each reported key. */
  private reported = new Map<ReportedKey, unknown>();
  /** Keys whose state may have changed in the current action. */
  private pending = new Set<ReportedKey>();
  /** Keys applied from options in the current action: they change silently (plan D3). */
  private silent = new Set<ReportedKey>();
  /** A commit happened in the current action. */
  private committed = false;

  constructor(
    private readonly names: readonly (keyof Events)[],
    /** Reads the current value of a reported key. */
    private readonly read: (key: ReportedKey) => unknown,
    /** Delivers an event to its on<Key>Change option first. */
    private readonly option: (event: keyof Events, value: unknown) => void,
    /** The event value of a changed key, when it says more than the state (a selection's points). */
    private readonly present: (key: ReportedKey, value: unknown) => unknown = (_, value) => value,
  ) {}

  /**
   * Start reporting from the current state, without events. What the construction left
   * pending goes too: a state option whose application raised no engine event (`viewport: {}`,
   * the default `hiddenSeries`) would otherwise stay marked silent, and the first gesture that
   * changes it would settle as if applied from options, unreported (plan D3).
   */
  reset(): void {
    for (const key of REPORTED) this.reported.set(key, this.read(key));
    this.pending.clear();
    this.silent.clear();
    this.committed = false;
  }

  on<K extends keyof Events>(event: K, listener: (value: Events[K]) => void): () => void {
    if (!this.names.includes(event))
      fail(
        `"${String(event)}" is not an event. Use one of: ${this.names.join(', ')}.${hint(String(event), this.names as unknown as string[])}`,
      );
    let listeners = this.listeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(event, listeners);
    }
    listeners.add(listener as Listener);
    return () => {
      listeners.delete(listener as Listener);
    };
  }

  /** Whether anything listens to `event` through on(). */
  listened(event: keyof Events): boolean {
    return (this.listeners.get(event)?.size ?? 0) > 0;
  }

  subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  /** Follow every commit as it settles (for the core views; subscribers hear once per frame). */
  observe(listener: () => void): () => void {
    this.observers.add(listener);
    return () => {
      this.observers.delete(listener);
    };
  }

  emit<K extends keyof Events>(event: K, value: Events[K]): void {
    const deliver = () => {
      // A snapshot: listeners added now run from the next emit (plan P14).
      const listeners = [...(this.listeners.get(event) ?? [])];
      isolated(() => this.option(event, value));
      for (const listener of listeners)
        isolated(() => (listener as (value: Events[K]) => void)(value));
    };
    if (this.depth > 0) this.queue.push(deliver);
    else deliver();
  }

  /** Run `act` as one action: what it changes is reported once, after it commits. */
  batch<T>(act: () => T): T {
    this.depth++;
    try {
      return act();
    } finally {
      if (--this.depth === 0) this.settle();
    }
  }

  /** `key` may have changed. Outside an action, report it now. */
  mark(key: ReportedKey): void {
    this.pending.add(key);
    if (this.depth === 0) this.settle();
  }

  /** `key` is being applied from options: it changes without an event (plan D3). */
  quiet(key: ReportedKey): void {
    this.pending.add(key);
    this.silent.add(key);
  }

  /** Data, options or state were committed: bump the revision once the action ends. */
  commit(): void {
    this.committed = true;
    if (this.depth === 0) this.settle();
  }

  /** A gesture action starts or ends (the engine's brackets). */
  bracket(start: boolean): void {
    if (start) this.depth++;
    else if (--this.depth === 0) this.settle();
  }

  private settle(): void {
    const changed: Array<[ReportedKey, unknown]> = [];
    for (const key of REPORTED) {
      if (!this.pending.has(key)) continue;
      const value = this.read(key);
      if (equivalent(value, this.reported.get(key))) continue;
      this.reported.set(key, value);
      this.committed = true;
      if (!this.silent.has(key)) changed.push([key, this.present(key, value)]);
    }
    this.pending.clear();
    this.silent.clear();
    if (this.committed) {
      this.committed = false;
      this.revision++;
      for (const observer of [...this.observers]) isolated(observer);
      this.notify();
    }
    for (const [key, value] of changed) this.emit(`${key}:change` as keyof Events, value as never);
    const queue = this.queue;
    this.queue = [];
    for (const deliver of queue) deliver();
  }

  /** Tell subscribers, at most once per frame. */
  private notify(): void {
    if (this.cancelNotify || !this.subscribers.size) return;
    this.cancelNotify = nextFrame(() => {
      this.cancelNotify = null;
      for (const subscriber of [...this.subscribers]) isolated(subscriber);
    });
  }

  clear(): void {
    this.cancelNotify?.();
    this.cancelNotify = null;
    this.listeners.clear();
    this.subscribers.clear();
    this.observers.clear();
    this.queue = [];
  }
}
