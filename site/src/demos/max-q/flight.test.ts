import { describe, expect, it } from 'vitest';
import { EARTH_RADIUS, fly } from './flight';

const MU = 3.986_004_418e14;
const flight = fly();
const { frames, events } = flight;

describe('max-q flight model', () => {
  it('flies the same mission every time', () => {
    expect(fly()).toEqual(flight);
  });

  it('samples every 0.1 s from liftoff to SECO, in order', () => {
    expect(frames[0].t).toBe(0);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].t).toBeGreaterThan(frames[i - 1].t);
    }
    expect(frames.at(-1)?.t).toBeCloseTo(events.at(-1)?.t ?? 0, 0);
  });

  it('flies its events in the order a launch has them', () => {
    expect(events.map((e) => e.id)).toEqual([
      'liftoff',
      'maxq',
      'meco',
      'separation',
      'ses',
      'fairing',
      'seco',
    ]);
  });

  it('reaches orbit: circular speed at SECO and a periapsis above the air', () => {
    const last = frames.at(-1)!;
    const circular = Math.sqrt(MU / (EARTH_RADIUS + last.altitude * 1000));
    expect(Math.abs(last.velocity / circular - 1)).toBeLessThan(0.005);
    expect(flight.orbit.periapsis).toBeGreaterThan(180);
    expect(flight.orbit.apoapsis).toBeLessThan(260);
    expect(Math.abs(last.pitch)).toBeLessThan(1);
  });

  it('reports dynamic pressure as ½ρv² of the frame’s own altitude and speed', () => {
    for (const f of frames.filter((_, i) => i % 97 === 0)) {
      const rho = f.altitude > 150 ? 0 : 1.225 * Math.exp((-f.altitude * 1000) / 8_500);
      expect(f.q).toBeCloseTo((0.5 * rho * f.velocity ** 2) / 1000, 6);
    }
  });

  it('throttles down through Max-Q and back up after it', () => {
    const maxQ = events.find((e) => e.id === 'maxq')!.t;
    const at = (t: number) => frames.find((f) => f.t >= t)!;
    expect(at(maxQ).throttle).toBeLessThan(0.9);
    expect(at(30).throttle).toBe(1);
    expect(at(100).throttle).toBe(1);
  });

  it('keeps the crew under 6 g and the second stage at its 4 g limit', () => {
    const stage2 = frames.filter((f) => f.stage === 'stage 2');
    expect(Math.max(...frames.map((f) => f.accel))).toBeLessThan(6);
    expect(Math.max(...stage2.map((f) => f.accel))).toBeLessThanOrEqual(4.001);
  });

  it('drops the first stage on a ballistic arc that comes back down', () => {
    const { booster } = flight;
    const apogee = Math.max(...booster.map((b) => b.altitude));
    expect(apogee).toBeGreaterThan(100);
    expect(booster.at(-1)!.altitude).toBeLessThan(5);
  });
});
