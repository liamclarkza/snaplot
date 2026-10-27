/**
 * Touch pan momentum: after a fast pan release, the chart keeps panning along the release velocity
 * with an exponential decay, one `action:pan` per animation frame, until the velocity fades or a
 * new gesture cancels it.
 */
import { nextFrame, prefersReducedMotion } from '../render/scheduler';
import type { EventBus } from './bus';

export class PanMomentum {
  /** Cancels the next momentum frame. */
  private frame: (() => void) | null = null;

  constructor(private readonly eventBus: EventBus) {}

  /** Start from a release velocity in CSS px per ms, on `axis` (an axis drag) or the plot. */
  start(velocityX: number, velocityY: number, axis: string | undefined): void {
    // Reduced motion stops a pan where the finger lifts (plan D19).
    if (prefersReducedMotion()) return;

    // Threshold of 0.1 px/ms ≈ 100 px/s, below this it's just a static release.
    const vMag = Math.hypot(velocityX, velocityY);
    if (vMag < 0.1) return;

    // Cap peak velocity so a jittery last sample can't launch the chart.
    const MAX_V = 2.5; // px/ms ≈ 2500 px/s
    let vx = velocityX;
    let vy = velocityY;
    if (vMag > MAX_V) {
      const s = MAX_V / vMag;
      vx *= s;
      vy *= s;
    }

    let lastT = performance.now();
    const step = () => {
      const now = performance.now();
      const dt = Math.min(32, now - lastT); // clamp frame to avoid teleporting after tab blur
      lastT = now;

      const dx = vx * dt;
      const dy = vy * dt;
      this.eventBus.emit('action:pan', { dx, dy, axis });

      // Exponential decay, halves roughly every ~130ms.
      const decay = Math.exp(-dt / 180);
      vx *= decay;
      vy *= decay;

      if (Math.hypot(vx, vy) < 0.02) {
        this.frame = null;
        return;
      }
      this.frame = nextFrame(step);
    };
    this.frame = nextFrame(step);
  }

  cancel(): void {
    this.frame?.();
    this.frame = null;
  }
}
