/** @jsxImportSource solid-js */
import { For, Show } from 'solid-js';
import { type ClipReport, type Span, formatMs, timecode } from './answer';
import { runChannels } from './audio';

/**
 * A peak in dBFS to two decimals. A peak a hair under full scale rounds to zero, and toFixed
 * would print it as "-0.00" (WebKit's decoder lands there where Chromium's reads exactly 1).
 */
function peakDb(peak: number): string {
  return (Math.round(20 * Math.log10(peak) * 100) / 100 + 0).toFixed(2);
}

/** The clip-list panel: every clipped run and long silence, each a jump target. */
export function ClipList(props: {
  report: ClipReport;
  marks: { t: number; v: number }[][];
  peaks: number[];
  current: Span | null;
  onJump: (span: Span, kind: 'run' | 'silence') => void;
}) {
  const rate = () => props.report.sampleRate;
  const at = (s: Span) => timecode(s.start / rate(), true);
  const isCurrent = (s: Span) => props.current?.start === s.start;
  return (
    <section class="cliplist" aria-label="Clipped runs and silences">
      <Show when={props.report.clippedRuns.length > 0}>
        <table>
          <caption>Clipped runs, in time order</caption>
          <thead>
            <tr>
              <th scope="col">At</th>
              <th scope="col">Length</th>
              <th scope="col">Channel</th>
              <th scope="col">Peak</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.report.clippedRuns}>
              {(run, i) => (
                <tr data-run={run.start} aria-current={isCurrent(run) ? 'true' : undefined}>
                  <td>
                    <button type="button" onClick={() => props.onJump(run, 'run')}>
                      {at(run)}
                    </button>
                  </td>
                  <td>
                    {run.length} samples, {formatMs((run.length * 1000) / rate())}
                  </td>
                  <td>{runChannels(props.marks, run, rate())}</td>
                  <td>{peakDb(props.peaks[i()] ?? 1)} dBFS</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>
      <Show when={props.report.silences.length > 0}>
        <table>
          <caption>Silences longer than 2 s</caption>
          <thead>
            <tr>
              <th scope="col">From</th>
              <th scope="col">To</th>
              <th scope="col">Length</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.report.silences}>
              {(gap) => (
                <tr data-silence={gap.start} aria-current={isCurrent(gap) ? 'true' : undefined}>
                  <td>
                    <button type="button" onClick={() => props.onJump(gap, 'silence')}>
                      {at(gap)}
                    </button>
                  </td>
                  <td>{timecode((gap.start + gap.length) / rate(), true)}</td>
                  <td>{(gap.length / rate()).toFixed(1)} s</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>
    </section>
  );
}
