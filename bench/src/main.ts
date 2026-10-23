// The bench page. `instrument` must stay the first import (see instrument.ts).
import './instrument';
import { loadApi } from './api';
import type { BenchApi } from './api/types';
import { preciseHeap, type ScenarioResult } from './metrics';
import { findScenario, runScenario, scenarios } from './scenarios';

export interface BenchInfo {
  api: string;
  /** WebGL renderer: "ANGLE … Metal …" on GPU raster, "SwiftShader" on software raster. */
  renderer: string;
  crossOriginIsolated: boolean;
  preciseHeap: boolean;
  userAgent: string;
  devicePixelRatio: number;
  scenarios: { name: string; area: string; primary: string }[];
}

interface BenchPage {
  ready: boolean;
  info(): BenchInfo;
  list(): string[];
  run(name: string): Promise<ScenarioResult>;
}

declare global {
  interface Window {
    __snaplotBench: BenchPage;
  }
}

const stage = document.getElementById('stage') as HTMLElement;
const controls = document.getElementById('controls') as HTMLElement;
const out = document.getElementById('out') as HTMLElement;

const params = new URLSearchParams(location.search);
let api: BenchApi | null = null;
const getApi = () => {
  api ??= loadApi(params.get('api'));
  return api;
};

function webglRenderer(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return 'none';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  } catch {
    return 'unknown';
  }
}

async function runOne(name: string): Promise<ScenarioResult> {
  const scenario = findScenario(name);
  if (!scenario) throw new Error(`unknown scenario: ${name}`);
  stage.innerHTML = '';
  stage.removeAttribute('style');
  window.scrollTo(0, 0);
  const result = await runScenario(scenario, { stage, api: getApi() });
  stage.innerHTML = '';
  return result;
}

window.__snaplotBench = {
  ready: true,
  info: () => ({
    api: getApi().version,
    renderer: webglRenderer(),
    crossOriginIsolated: window.crossOriginIsolated === true,
    preciseHeap: preciseHeap(),
    userAgent: navigator.userAgent,
    devicePixelRatio: window.devicePixelRatio,
    scenarios: scenarios.map((s) => ({ name: s.name, area: s.area, primary: s.primary })),
  }),
  list: () => scenarios.map((s) => s.name),
  run: runOne,
};

// Manual controls for DevTools profiling sessions (`npm run dev -w bench`).
for (const s of scenarios) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = s.name;
  btn.addEventListener('click', async () => {
    out.textContent = 'running…';
    const r = await runOne(s.name);
    out.textContent = JSON.stringify(r, null, 2);
  });
  controls.appendChild(btn);
}
