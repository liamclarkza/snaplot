import type { ScenarioResult } from './metrics';
import { findScenario, scenarios } from './scenarios';

interface BenchApi {
  list(): string[];
  run(name: string): Promise<ScenarioResult>;
  runAll(filter?: string): Promise<ScenarioResult[]>;
}

declare global {
  interface Window {
    __snaplotBench: BenchApi;
  }
}

const stage = document.getElementById('stage') as HTMLElement;
const controls = document.getElementById('controls') as HTMLElement;
const out = document.getElementById('out') as HTMLElement;

function log(text: string): void {
  out.textContent += text + '\n';
}

async function runOne(name: string): Promise<ScenarioResult> {
  const scenario = findScenario(name);
  if (!scenario) throw new Error(`unknown scenario: ${name}`);
  stage.innerHTML = '';
  const result = await scenario.run({ stage });
  stage.innerHTML = '';
  return result;
}

window.__snaplotBench = {
  list: () => scenarios.map((s) => s.name),
  run: runOne,
  runAll: async (filter?: string) => {
    const results: ScenarioResult[] = [];
    for (const s of scenarios) {
      if (filter && !s.name.includes(filter)) continue;
      log(`running ${s.name}...`);
      const r = await runOne(s.name);
      log(
        `  median ${r.frame.medianMs}ms  p95 ${r.frame.p95Ms}ms  ` +
          `data ${r.layers.data.meanMs}ms  valid ${r.valid}`,
      );
      results.push(r);
    }
    return results;
  },
};

// Manual controls for interactive DevTools profiling sessions.
for (const s of scenarios) {
  const btn = document.createElement('button');
  btn.textContent = s.name;
  btn.addEventListener('click', async () => {
    out.textContent = '';
    const r = await runOne(s.name);
    out.textContent = JSON.stringify(r, null, 2);
  });
  controls.appendChild(btn);
}
const all = document.createElement('button');
all.textContent = 'run all';
all.style.fontWeight = 'bold';
all.addEventListener('click', async () => {
  out.textContent = '';
  const results = await window.__snaplotBench.runAll();
  log('\n' + JSON.stringify(results, null, 2));
});
controls.appendChild(all);
