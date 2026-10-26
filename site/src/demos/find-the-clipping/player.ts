/**
 * Playback with a playhead: an AudioBufferSourceNode per play, and a requestAnimationFrame loop
 * that reports the position (seconds) about 60 times a second while it plays.
 */
export interface Player {
  readonly playing: boolean;
  /** The playhead in seconds. */
  position(): number;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  destroy(): void;
}

export function createPlayer(
  buffer: AudioBuffer,
  onFrame: (seconds: number, playing: boolean) => void,
): Player {
  let context: AudioContext | undefined;
  let source: AudioBufferSourceNode | undefined;
  let offset = 0;
  let startedAt = 0;
  let frame = 0;
  const clamp = (s: number) => Math.min(buffer.duration, Math.max(0, s));
  const position = () =>
    source && context ? clamp(offset + context.currentTime - startedAt) : offset;

  const stop = () => {
    if (!source) return;
    offset = position();
    source.onended = null;
    source.stop();
    source.disconnect();
    source = undefined;
    cancelAnimationFrame(frame);
  };
  const tick = () => {
    onFrame(position(), true);
    frame = requestAnimationFrame(tick);
  };
  const player: Player = {
    get playing() {
      return source !== undefined;
    },
    position,
    play() {
      if (source) return;
      if (offset >= buffer.duration) offset = 0;
      context ??= new AudioContext();
      void context.resume();
      source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = () => {
        stop();
        offset = buffer.duration;
        onFrame(offset, false);
      };
      startedAt = context.currentTime;
      source.start(0, offset);
      tick();
    },
    pause() {
      stop();
      onFrame(offset, false);
    },
    seek(seconds) {
      const resume = source !== undefined;
      stop();
      offset = clamp(seconds);
      if (resume) player.play();
      else onFrame(offset, false);
    },
    destroy() {
      stop();
      void context?.close();
    },
  };
  return player;
}
