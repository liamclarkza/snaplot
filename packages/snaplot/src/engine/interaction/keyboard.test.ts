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
  {
    pan,
    zoom,
    shiftKey = false,
    ctrlKey = false,
    cursorActive = false,
    selectionActive = false,
  }: {
    pan: PanConfig;
    zoom: ZoomConfig;
    shiftKey?: boolean;
    ctrlKey?: boolean;
    cursorActive?: boolean;
    selectionActive?: boolean;
  },
) {
  const bus = new EventBus();
  const emitted: Array<[string, unknown]> = [];
  for (const action of Object.keys(ACTIONS) as Array<keyof EventMap>)
    bus.on(action, (payload) => emitted.push([action, payload]));
  const event = { key, shiftKey, ctrlKey } as KeyboardEvent;
  const handled = handleChartKey({ event, bus, layout, pan, zoom, cursorActive, selectionActive });
  return { handled, emitted };
}

const all = { pan: { enabled: true, x: true, y: true }, zoom: { enabled: true, x: true } };

describe('the key table (keyboard.ts)', () => {
  it('moves the cursor point by point; Home and End once it is on the chart', () => {
    expect(press('ArrowLeft', all).emitted).toEqual([['action:step-cursor', { to: 'prev' }]]);
    expect(press('ArrowRight', all).emitted).toEqual([['action:step-cursor', { to: 'next' }]]);
    expect(press('Home', all)).toEqual({ handled: false, emitted: [] });
    expect(press('End', { ...all, cursorActive: true }).emitted).toEqual([
      ['action:step-cursor', { to: 'last' }],
    ]);
  });

  it('leaves Ctrl, ⌘ and Alt combinations to the browser', () => {
    expect(press('ArrowRight', { ...all, ctrlKey: true })).toEqual({ handled: false, emitted: [] });
    expect(press('+', { ...all, ctrlKey: true })).toEqual({ handled: false, emitted: [] });
  });

  it('pans X by 120 px with shift, Y by 40, and only along enabled axes', () => {
    expect(press('ArrowLeft', { ...all, shiftKey: true }).emitted).toEqual([
      ['action:pan', { dx: 120, dy: 0 }],
    ]);
    expect(press('ArrowRight', { ...all, shiftKey: true }).emitted).toEqual([
      ['action:pan', { dx: -120, dy: 0 }],
    ]);
    expect(press('ArrowUp', all).emitted).toEqual([['action:pan', { dx: 0, dy: 40 }]]);
    expect(press('ArrowDown', all).emitted).toEqual([['action:pan', { dx: 0, dy: -40 }]]);
    const noY = { ...all, pan: { enabled: true, x: true } };
    expect(press('ArrowUp', noY)).toEqual({ handled: false, emitted: [] });
    const off = { ...all, pan: { enabled: false }, shiftKey: true };
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

  it('resets on 0 unless zoom and pan are off; Escape clears what is shown; ignores other keys', () => {
    const off = { pan: { enabled: false }, zoom: { enabled: false } };
    expect(press('0', all)).toEqual({ handled: true, emitted: [['action:reset-zoom', undefined]] });
    expect(press('0', off).handled).toBe(false);
    expect(press('Escape', all).handled).toBe(false);
    expect(press('Escape', { ...all, selectionActive: true }).emitted).toEqual([
      ['action:escape', undefined],
    ]);
    for (const key of ['a', 'Enter', 'constructor', 'toString'])
      expect(press(key, all)).toEqual({ handled: false, emitted: [] });
    expect([...KEY_BINDINGS.keys()]).toEqual([
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End',
      'ArrowUp',
      'ArrowDown',
      '+',
      '=',
      '-',
      '_',
      '0',
      'Escape',
    ]);
  });
});

describe('the action table (actions.ts)', () => {
  it('has one handler per gesture action', () => {
    expect(Object.keys(ACTIONS)).toEqual([
      'action:cursor',
      'action:cursor-leave',
      'action:step-cursor',
      'action:escape',
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
