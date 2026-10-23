import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { launchOptions, PROFILES } from '../lib/browser.mjs';
import { loadGate, setScenarios } from '../lib/gate.mjs';

describe('browser launch', () => {
  test('[gap-perf-gate-02] GPU raster is the default profile: full Chromium, GPU rasterisation, OOP canvas', () => {
    const gpu = launchOptions('gpu');
    assert.equal(gpu.channel, 'chromium');
    for (const flag of [
      '--enable-gpu-rasterization',
      '--ignore-gpu-blocklist',
      '--canvas-oop-rasterization',
    ]) {
      assert.ok(gpu.args.includes(flag), flag);
    }
    if (process.platform === 'darwin') assert.ok(gpu.args.includes('--use-angle=metal'));
    // The software profile is the headless shell, kept under its own name.
    assert.equal(launchOptions('software').channel, undefined);
    assert.throws(() => launchOptions('swiftshader'), /unknown --raster/);
  });

  test('[gap-perf-gate-07] both raster profiles launch with precise memory info and gc()', () => {
    for (const raster of ['gpu', 'software']) {
      const { args } = launchOptions(raster);
      assert.ok(args.includes('--enable-precise-memory-info'), raster);
      assert.ok(args.includes('--js-flags=--expose-gc'), raster);
    }
  });

  test('the profiles keep the pre-M4 desktop and mobile emulation', () => {
    assert.deepEqual(PROFILES.desktop.viewport, { width: 1280, height: 800 });
    assert.equal(PROFILES.mobile.cpuThrottle, 4);
    assert.equal(PROFILES.mobile.deviceScaleFactor, 3);
    assert.equal(PROFILES.mobile.hasTouch, true);
  });
});

describe('gate coverage', () => {
  const gate = loadGate();

  test('[gap-competitive-05:harness] first paint, many charts and streaming headroom have budgets', () => {
    const budgeted = new Set(gate.budgets.map((b) => b.scenario));
    for (const name of [
      'firstpaint-line-1m',
      'mount-24-charts',
      'offscreen-stream-24',
      'stream-50hz-idle',
    ]) {
      assert.ok(budgeted.has(name), name);
    }
    for (const name of ['hover-sync-unsorted-200k', 'theme-churn-24', 'resize-storm-24']) {
      assert.ok(setScenarios(gate, 'M11').includes(name) || budgeted.has(name), name);
    }
  });

  test('[gap-perf-gate-08] the API-layer, React, plugin, group and ingest paths are in the default set', () => {
    const required = setScenarios(gate, 'default');
    for (const name of [
      'reingest-rows-200k-title',
      'react-rerender-200k-inline',
      'stream20hz-50k-plugin',
      'stream20hz-50k-legendtable',
      'group-append-3x20k-align',
      'ingest-cols-1m',
      'hover-sync-unsorted-200k',
    ]) {
      assert.ok(required.includes(name), name);
    }
  });
});
