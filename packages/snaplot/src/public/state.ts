/**
 * The one public dispatcher (plan §3.2, D3): every notification a chart gives goes through it.
 * Events raised while a call or a gesture runs are queued and delivered once it has committed,
 * and a state that changed several times in one action is reported once, with its final value.
 */
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

export class Dispatcher<Events extends object> {
  private listeners = new Map<keyof Events, Set<Listener>>();
  private queue: Array<() => void> = [];
  private depth = 0;
  /** The value last reported (or applied from options) for each reported key. */
  private reported = new Map<ReportedKey, unknown>();
  /** Keys whose state may have changed in the current action. */
  private pending = new Set<ReportedKey>();
  /** Keys applied from options in the current action: they change silently (plan D3). */
  private silent = new Set<ReportedKey>();

  constructor(
    private readonly names: readonly (keyof Events)[],
    /** Reads the current value of a reported key. */
    private readonly read: (key: ReportedKey) => unknown,
    /** Delivers an event to its on<Key>Change option first. */
    private readonly option: (event: keyof Events, value: unknown) => void,
    /** Runs after an action that changed state committed. */
    private readonly settled: () => void,
  ) {}

  /** Start reporting from the current state, without events. */
  reset(): void {
    for (const key of REPORTED) this.reported.set(key, this.read(key));
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
    return () => listeners.delete(listener as Listener);
  }

  /** Whether anything listens to `event`, through on() or its option. */
  listened(event: keyof Events): boolean {
    return (this.listeners.get(event)?.size ?? 0) > 0;
  }

  emit<K extends keyof Events>(event: K, value: Events[K]): void {
    const deliver = () => {
      this.option(event, value);
      for (const listener of this.listeners.get(event) ?? [])
        (listener as (v: unknown) => void)(value);
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
      if (!this.silent.has(key)) changed.push([key, value]);
    }
    this.pending.clear();
    this.silent.clear();
    this.settled();
    for (const [key, value] of changed) this.emit(`${key}:change` as keyof Events, value as never);
    const queue = this.queue;
    this.queue = [];
    for (const deliver of queue) deliver();
  }

  clear(): void {
    this.listeners.clear();
    this.queue = [];
  }
}
