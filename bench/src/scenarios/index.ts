import { Unsupported } from '../api/types';
import type { ScenarioResult } from '../metrics';
import { api } from './api';
import type { Ctx, Scenario } from './common';
import { interaction } from './interaction';
import { legacy } from './legacy';
import { scale } from './scale';
import { streaming } from './streaming';

export type { Ctx, Scenario };

export const scenarios: Scenario[] = [...legacy, ...api, ...streaming, ...interaction, ...scale];

export function findScenario(name: string): Scenario | undefined {
  return scenarios.find((s) => s.name === name);
}

function emptyResult(s: Scenario, ctx: Ctx): ScenarioResult {
  return {
    name: s.name,
    area: s.area,
    primary: s.primary,
    api: ctx.api.version,
    valid: false,
    ops: 0,
    busy: null,
    sync: null,
    wall: null,
    frame: null,
    busyTotalMs: null,
    loaf: null,
    heap: null,
    fidelity: null,
    renders: null,
    meta: {},
  };
}

/** Runs one scenario; an API that cannot express it yields `unsupported`, a throw yields `error`. */
export async function runScenario(s: Scenario, ctx: Ctx): Promise<ScenarioResult> {
  try {
    return await s.run(ctx);
  } catch (err) {
    const result = emptyResult(s, ctx);
    if (err instanceof Unsupported) result.unsupported = err.message;
    else result.error = String((err as Error)?.stack ?? err).slice(0, 2000);
    return result;
  }
}
