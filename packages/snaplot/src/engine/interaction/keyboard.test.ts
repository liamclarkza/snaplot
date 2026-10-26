import { describe, expect, it } from 'vitest';
import type { Layout, PanConfig, ZoomConfig } from '../spec';
import { ACTIONS } from './actions';
import { EventBus, type EventMap } from './bus';
import { handleChartKey, KEY_BINDINGS } from './keyboard';

const layout = {
  width: 400,
  height: 300,
  plot: { left: 50, top: 10, width: 300, height: 260 },
  axes: {},
  dpr: 1,
} as Layout;

function press(
  key: string,
  { pan, zoom, shiftKey = false }: { pan: PanConfig; zoom: ZoomConfig; shiftKey?: boolean },
) {
  const bus = new EventBus();
  const emitted: Array<[string, unknown]> = [];
  for (const action of Object.keys(ACTIONS) as Array<keyof EventMap>)
    bus.on(action, (payload) => emitted.push([action, payload]));
  const event = { key, shiftKey } as KeyboardEvent;
  const handled = handleChartKey({ event, bus, layout, pan, zoom });
  return { handled, emitted };
}

const all = { pan: { enabled: true, x: true, y: true }, zoom: { enabled: true, x: true } };

describe('the key table (keyboard.ts)', () => {
  it('pans by 40 px, 120 with shift, and only along enabled axes', () => {
    expect(press('ArrowLeft', all).emitted).toEqual([['action:pan', { dx: 40, dy: 0 }]]);
    expect(press('ArrowRight', { ...all, shiftKey: true }).emitted).toEqual([
      ['action:pan', { dx: -120, dy: 0 }],
    ]);
    expect(press('ArrowUp', all).emitted).toEqual([['action:pan', { dx: 0, dy: 40 }]]);
    expect(press('ArrowDown', all).emitted).toEqual([['action:pan', { dx: 0, dy: -40 }]]);
    const noY = { ...all, pan: { enabled: true, x: true } };
    expect(press('ArrowUp', noY)).toEqual({ handled: false, emitted: [] });
    const off = { ...all, pan: { enabled: false } };
    expect(press('ArrowLeft', off)).toEqual({ handled: false, emitted: [] });
  });

  it('zooms by 1.2 at the plot centre on the enabled axes', () => {
    const centre = { anchorX: 200, anchorY: 140 };
    expect(press('+', all).emitted).toEqual([
      ['action:zoom', { factor: 1 / 1.2, ...centre, axis: 'x' }],
    ]);
    expect(press('_', { ...all, zoom: { enabled: true, x: true, y: true } }).emitted).toEqual([
      ['action:zoom', { factor: 1.2, ...centre, axis: 'xy' }],
    ]);
    expect(press('=', { ...all, zoom: { enabled: true, x: false, y: true } }).emitted).toEqual([
      ['action:zoom', { factor: 1 / 1.2, ...centre, axis: 'y' }],
    ]);
    expect(press('-', { ...all, zoom: { enabled: false } })).toEqual({
      handled: false,
      emitted: [],
    });
  });

  it('resets on 0 and Home whatever the options, and ignores other keys', () => {
    const off = { pan: { enabled: false }, zoom: { enabled: false } };
    expect(press('0', off)).toEqual({ handled: true, emitted: [['action:reset-zoom', undefined]] });
    expect(press('Home', off).handled).toBe(true);
    for (const key of ['a', 'Enter', 'constructor', 'toString'])
      expect(press(key, all)).toEqual({ handled: false, emitted: [] });
    expect([...KEY_BINDINGS.keys()]).toEqual([
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      '+',
      '=',
      '-',
      '_',
      '0',
      'Home',
    ]);
  });
});

describe('the action table (actions.ts)', () => {
  it('has one handler per gesture action', () => {
    expect(Object.keys(ACTIONS)).toEqual([
      'action:cursor',
      'action:cursor-leave',
      'action:pan',
      'action:zoom',
      'action:box-start',
      'action:box-update',
      'action:box-end',
      'action:reset-zoom',
      'action:tap',
    ]);
    expect(Object.values(ACTIONS).every((handle) => typeof handle === 'function')).toBe(true);
  });
});
