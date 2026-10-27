/** @jsxImportSource solid-js */
/**
 * "Where does this recording clip?" (plan §10.2, S1): a waveform editor for a podcast editor's
 * pre-publish check. The overview selects a stretch, the lanes show it to the sample, the clip
 * list answers the question, and Space plays it with a playhead.
 */
import { Chart, type ChartHandle, createChartGroup } from 'snaplot/solid';
import { For, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { type ClipReport, type Span, rmsDb, scan, timecode } from './answer';
import { type Audio, clipMarks, decode, waveformColumns } from './audio';
import { ClipList } from './ClipList.solid';
import { type Track, lane, overview, spectrumChart, tc } from './charts';
import { spectrum } from './fft';
import { type Player, createPlayer } from './player';

const BUNDLED = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}data/find-the-clipping/recording.mp3`;
// The date's hyphens do not break, so a phone never splits it across lines.
const BUNDLED_TITLE = 'Space-to-ground comm: PDAM prep conversation (12\u201102\u201121)';
const CHANNELS = ['Left', 'Right'];

interface Loaded {
  audio: Audio;
  title: string;
  report: ClipReport;
  track: Track;
  peaks: number[];
}

function analyse(audio: Audio, title: string): Loaded {
  const { channels, sampleRate } = audio;
  const report = scan(channels, sampleRate);
  const rms = channels.map((ch) => {
    const r = rmsDb([ch], sampleRate);
    return { columns: { t: r.time, db: r.db } };
  });
  const peaks = report.clippedRuns.map((run) => {
    let peak = 0;
    for (const ch of channels) {
      for (let i = run.start; i < run.start + run.length; i++)
        peak = Math.max(peak, Math.abs(ch[i]));
    }
    return peak;
  });
  const track: Track = {
    wave: waveformColumns(audio),
    rms,
    marks: clipMarks(channels, report.clippedRuns, sampleRate),
    silences: report.silences,
    sampleRate,
    duration: audio.buffer.duration,
  };
  return { audio, title, report, track, peaks };
}

/** Handles for the end-to-end spec and the thumbnail script (site/tests/examples). */
const exposed: Record<string, ChartHandle> = {};
Object.assign(globalThis, { snaplotDemo: { slug: 'find-the-clipping', charts: exposed } });

export default function Editor() {
  const group = createChartGroup({ viewport: false });
  const [loaded, setLoaded] = createSignal<Loaded>();
  const [status, setStatus] = createSignal('Decoding the recording…');
  const [view, setView] = createSignal<[number, number]>([0, 1]);
  const [position, setPosition] = createSignal(0);
  const [playing, setPlaying] = createSignal(false);
  const [current, setCurrent] = createSignal<Span | null>(null);
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  let player: Player | undefined;

  const show = (from: number, to: number) => {
    const duration = loaded()?.track.duration ?? 1;
    setView([Math.max(0, from), Math.min(duration, to)]);
  };
  /** While playing, page the lanes forward when the playhead leaves them. */
  const onFrame = (seconds: number, on: boolean) => {
    setPosition(seconds);
    setPlaying(on);
    group.setCursor(seconds);
    const [from, to] = view();
    if (on && (seconds > to || seconds < from)) show(seconds, seconds + (to - from));
  };

  async function open(bytes: ArrayBuffer, name: string, title: string) {
    setStatus(`Decoding ${name}…`);
    try {
      const audio = await decode(bytes, name);
      performance.mark('find-the-clipping:decoded');
      const next = analyse(audio, title);
      player?.destroy();
      player = createPlayer(audio.buffer, onFrame);
      // Open on the longest clipped run, two seconds wide, with the playhead just before it.
      const longest = next.report.longest;
      const centre = longest ? longest.start / audio.sampleRate : 0;
      const duration = next.track.duration;
      setView(longest ? [Math.max(0, centre - 1), Math.min(duration, centre + 1)] : [0, duration]);
      setCurrent(longest);
      setLoaded(next);
      player.seek(longest ? Math.max(0, centre - 0.5) : 0);
      setStatus('');
      requestAnimationFrame(() => {
        performance.mark('find-the-clipping:painted');
        performance.measure(
          'find-the-clipping:first-paint',
          'find-the-clipping:decoded',
          'find-the-clipping:painted',
        );
        document.documentElement.dataset.demoReady = 'true';
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  const toggle = () => (player?.playing ? player.pause() : player?.play());
  const seek = (seconds: number) => player?.seek(seconds);
  const jump = (span: Span, kind: 'run' | 'silence') => {
    const l = loaded();
    if (!l) return;
    const rate = l.audio.sampleRate;
    const from = span.start / rate;
    const to = (span.start + span.length) / rate;
    setCurrent(span);
    if (kind === 'run') show(from - 0.004, to + 0.004);
    else show(from - 0.25, to + 0.25);
    seek(Math.max(0, from - (kind === 'run' ? 0.5 : 0)));
  };

  const onKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === ' ') {
      e.preventDefault();
      toggle();
    } else if (
      (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
      !target.closest('[role="application"]')
    ) {
      e.preventDefault();
      seek(position() + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 0.1 : 1));
    }
  };
  const onDragOver = (e: DragEvent) => e.preventDefault();
  /** A file dropped anywhere on the page opens like the Open button's. */
  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (file) await open(await file.arrayBuffer(), file.name, file.name);
  };
  const onPick = async (e: Event & { currentTarget: HTMLInputElement }) => {
    const file = e.currentTarget.files?.[0];
    if (file) await open(await file.arrayBuffer(), file.name, file.name);
  };

  onMount(async () => {
    document.addEventListener('keydown', onKey);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('drop', onDrop);
    const response = await fetch(BUNDLED);
    if (!response.ok) setStatus(`Could not load the recording (HTTP ${response.status}).`);
    else await open(await response.arrayBuffer(), 'recording.mp3', BUNDLED_TITLE);
  });
  onCleanup(() => {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('dragover', onDragOver);
    document.removeEventListener('drop', onDrop);
    player?.destroy();
  });

  const spectrumData = createMemo(() => {
    const l = loaded();
    if (!l) return undefined;
    const rate = l.audio.sampleRate;
    const [from, to] = view();
    const s = spectrum(l.audio.channels, rate, Math.round(from * rate), Math.round(to * rate));
    return { data: { columns: { f: s.freq, db: s.db } }, size: s.size, segments: s.segments };
  });

  return (
    <div class="editor">
      <header class="toolbar">
        <h1 class="file">{loaded()?.title ?? 'recording.mp3'}</h1>
        <div class="transport" role="toolbar" aria-label="Transport">
          <button
            type="button"
            class="play"
            onClick={toggle}
            disabled={!loaded()}
            aria-pressed={playing()}
          >
            {playing() ? 'Pause' : 'Play'} <kbd>Space</kbd>
          </button>
          <button type="button" onClick={() => seek(position() - 1)} disabled={!loaded()}>
            −1 s <kbd>←</kbd>
          </button>
          <button type="button" onClick={() => seek(position() + 1)} disabled={!loaded()}>
            +1 s <kbd>→</kbd>
          </button>
          <span class="clock num" role="timer" aria-label="Playhead">
            {timecode(position(), true)}
          </span>
        </div>
        <Show when={loaded()}>
          {(l) => (
            <p class="format num">
              {(l().audio.sampleRate / 1000).toLocaleString('en')} kHz ·{' '}
              {l().audio.channels.length === 2 ? 'stereo' : 'mono'}
              {l().audio.resampled ? ' (resampled)' : ''} · {timecode(l().track.duration, true)}
            </p>
          )}
        </Show>
        <label class="open">
          Open a file
          <input type="file" accept="audio/*" onChange={onPick} />
        </label>
      </header>
      <p class="status" role="status">
        {status()}
      </p>
      <Show when={loaded()} keyed>
        {(l) => (
          <>
            <section class="overview" aria-label="Whole recording">
              <div class="plot">
                <Chart
                  {...overview(l.track, group)}
                  class="host"
                  data-chart="overview"
                  ariaLabel={`Whole recording with ${l.report.clippedRuns.length} clipped runs marked`}
                  selection={{ x: view() }}
                  onSelectionChange={(s) =>
                    s ? show(+s.x[0], +s.x[1]) : show(0, l.track.duration)
                  }
                  ref={(c) => c && (exposed.overview = c)}
                />
              </div>
              <p class="hint">
                {touch
                  ? 'Double-tap and drag across the overview to inspect a stretch; pinch a channel to zoom.'
                  : 'Drag across the overview to inspect a stretch. In a channel, drag to zoom in, Shift-drag to move, double-click to see it all.'}
              </p>
            </section>
            <For each={l.audio.channels}>
              {(_, c) => (
                <section class="lane" aria-label={`${CHANNELS[c()] ?? 'Mono'} channel`}>
                  <span class="lane-name">
                    {l.audio.channels.length === 1 ? 'Mono' : CHANNELS[c()]}
                  </span>
                  <div class="plot">
                    <Chart
                      {...lane(l.track, c(), group)}
                      class="host"
                      data-chart={`lane${c()}`}
                      ariaLabel={`${CHANNELS[c()] ?? 'Mono'} channel, ${tc(view()[0])} to ${tc(view()[1])}`}
                      viewport={{ x: view() }}
                      onViewportChange={(v) =>
                        v.x ? show(+v.x[0], +v.x[1]) : show(0, l.track.duration)
                      }
                      ref={(chart) => chart && (exposed[`lane${c()}`] = chart)}
                    />
                  </div>
                </section>
              )}
            </For>
            <div class="analysis">
              <ClipList
                report={l.report}
                marks={l.track.marks}
                peaks={l.peaks}
                current={current()}
                onJump={jump}
              />
              <section class="spectrum" aria-labelledby="spectrum-title">
                <h2 id="spectrum-title">Spectrum in view</h2>
                <p class="caption num">
                  {tc(view()[0])}–{tc(view()[1])}, {spectrumData()?.segments} ×{' '}
                  {spectrumData()?.size} samples
                </p>
                <div class="plot">
                  <Chart
                    {...spectrumChart(l.audio.sampleRate)}
                    data={spectrumData()?.data}
                    class="host"
                    data-chart="spectrum"
                    ariaLabel="Level by frequency of the stretch in view"
                    ref={(c) => c && (exposed.spectrum = c)}
                  />
                </div>
              </section>
            </div>
          </>
        )}
      </Show>
    </div>
  );
}
