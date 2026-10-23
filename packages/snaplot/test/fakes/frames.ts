/**
 * A manual animation-frame queue. Nothing runs until the test asks, so a test
 * can tell "painted now" from "painted on the next frame".
 */

export interface FramesFake {
  /** Callbacks waiting for the next frame. */
  readonly pending: number;
  /** Run one frame: only the callbacks queued before it started. Returns how many ran. */
  step(): number;
  /** Run frames until the queue is empty (at most `limit`). Returns the frame count. */
  flush(limit?: number): number;
}

export function installFrames(restorers: Array<() => void>): FramesFake {
  let queue = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  let now = 0;
  const previous = {
    request: globalThis.requestAnimationFrame,
    cancel: globalThis.cancelAnimationFrame,
  };
  globalThis.requestAnimationFrame = (callback) => {
    const id = nextId++;
    queue.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => {
    queue.delete(id);
  };
  restorers.push(() => {
    globalThis.requestAnimationFrame = previous.request;
    globalThis.cancelAnimationFrame = previous.cancel;
  });

  const step = () => {
    const current = queue;
    queue = new Map();
    now += 16;
    for (const callback of current.values()) callback(now);
    return current.size;
  };
  return {
    get pending() {
      return queue.size;
    },
    step,
    flush(limit = 100) {
      let frames = 0;
      while (queue.size && frames < limit) {
        step();
        frames++;
      }
      return frames;
    },
  };
}
