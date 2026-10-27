/**
 * The decision panel: the computed answer for the chosen criterion, the checkpoint the other
 * criterion would pick, the pinned checkpoints read straight from the logs, and both runs at
 * the epoch under the cursor (useCursor plus a <LegendTable>).
 */
import { type SyntheticEvent, useMemo, useState } from 'react';
import {
  type ChartHandle,
  LegendTable,
  type LegendTableColumn,
  useChartState,
  useCursor,
} from 'snaplot/react';
import { type Criterion, decide, type EpochRow, headline, otherPick, pct } from './answer';
import type { Logs } from './logs';
import type { Pin } from './url';

interface Props {
  logs: Logs;
  by: Criterion;
  onBy: (by: Criterion) => void;
  pins: readonly Pin[];
  onPin: (pin: Pin) => void;
  validation: ChartHandle | null;
  /** A touch screen: the hints say touch, not point. */
  coarse: boolean;
}

export function DecisionPanel({ logs, by, onBy, pins, onPin, validation, coarse }: Props) {
  const decision = useMemo(() => decide(logs.allVal, by), [logs, by]);
  const other = useMemo(() => otherPick(logs.allVal, by), [logs, by]);
  const smoothedRun = logs.runs.find((r) => r.labelSmoothing > 0);
  // How far a checkpoint's validation loss sits above its run's lowest.
  const overBest = useMemo(() => {
    const lowest = new Map(decision.runs.map((r) => [r.run, r.best.valLoss]));
    return (row: EpochRow) => {
      const rise = row.valLoss / (lowest.get(row.run) ?? row.valLoss) - 1;
      return rise < 0.00005 ? 'its best' : `+${pct(rise)}`;
    };
  }, [decision]);
  const rowAt = (run: string, epoch: number) => logs.val.get(run)?.find((r) => r.epoch === epoch);
  const colors = useChartState(validation, (state) => state.series);
  const colorOf = (run: string) => colors?.find((s) => s.id === run)?.color ?? 'transparent';

  const cursor = useCursor(validation);
  const at = cursor?.points[0]?.x;
  const epoch = typeof at === 'number' ? at : undefined;

  // Memoised: a new columns array would make the table rebuild its rows on every render.
  const columns = useMemo<LegendTableColumn[]>(
    () => [
      'swatch',
      { header: 'Run', value: (_, series) => series.label },
      {
        header: 'Val loss',
        align: 'right',
        value: (p) => (p?.row ? p.row.valLoss.toFixed(4) : ''),
      },
      { header: 'Accuracy', align: 'right', value: (p) => (p?.row ? pct(p.row.valAcc) : '') },
      {
        header: 'Over best',
        align: 'right',
        value: (p) => (p?.row ? overBest(p.row as EpochRow) : ''),
      },
    ],
    [overBest],
  );

  return (
    <aside className="r1-decision" aria-labelledby="r1-decision-title">
      <h2 id="r1-decision-title">Which checkpoint should we ship?</h2>
      <fieldset className="r1-criterion">
        <legend>Best checkpoint by</legend>
        {(
          [
            ['valLoss', 'Lowest validation loss'],
            ['valAcc', 'Highest accuracy'],
          ] as const
        ).map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name="r1-criterion"
              value={value}
              checked={by === value}
              onChange={() => onBy(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="r1-answer" role="status">
        {headline(decision).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      {other && (
        <p className="r1-other">
          {other}
          {smoothedRun &&
            ` Run ${smoothedRun.id} trains with label smoothing (${smoothedRun.labelSmoothing}), which keeps its predictions less confident: its validation loss stays higher even at epochs where it classifies more digits correctly.`}
        </p>
      )}

      <h3 id="r1-pins-title">Pinned checkpoints</h3>
      {pins.length === 0 ? (
        <p className="r1-hint">None yet. Pick a validation point on the charts, or use the form.</p>
      ) : (
        <table className="r1-table" aria-labelledby="r1-pins-title">
          <thead>
            <tr>
              <th scope="col">Run</th>
              <th scope="col">Epoch</th>
              <th scope="col">Val loss</th>
              <th scope="col">Accuracy</th>
              <th scope="col">Over best</th>
              <th scope="col">
                <span className="r1-visually-hidden">Unpin</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {pins.map((pin) => {
              const row = rowAt(pin.run, pin.epoch);
              if (!row) return null;
              return (
                <tr key={`${pin.run}-${pin.epoch}`} data-pin={`${pin.run}-${pin.epoch}`}>
                  <td>
                    <svg className="r1-swatch" viewBox="0 0 10 10" aria-hidden="true">
                      <rect width="10" height="10" rx="2" fill={colorOf(pin.run)} />
                    </svg>
                    {pin.run}
                  </td>
                  <td>{pin.epoch}</td>
                  <td>{row.valLoss.toFixed(4)}</td>
                  <td>{pct(row.valAcc)}</td>
                  <td>{overBest(row)}</td>
                  <td>
                    <button
                      type="button"
                      className="r1-unpin"
                      aria-label={`Unpin run ${pin.run}, epoch ${pin.epoch}`}
                      onClick={() => onPin(pin)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <PinForm
        logs={logs}
        onPin={onPin}
        pins={pins}
        suggest={decide(logs.allVal, by === 'valLoss' ? 'valAcc' : 'valLoss').ship}
      />

      <h3>At the cursor</h3>
      <p className={epoch === undefined ? 'r1-hint' : undefined}>
        {epoch === undefined
          ? `${coarse ? 'Touch' : 'Point at'} a chart to read both runs at one epoch.`
          : correctAt(logs, epoch)}
      </p>
      <LegendTable chart={validation} columns={columns} fallback="hide" className="r1-legend" />
    </aside>
  );
}

/** "At epoch 23, run B gets 1,743 of 1,797 digits right, 14 more than run A." */
function correctAt(logs: Logs, epoch: number): string {
  const rows = logs.runs
    .map((run) => logs.val.get(run.id)?.find((r) => r.epoch === epoch))
    .filter((r) => r !== undefined)
    .sort((a, b) => b.valCorrect - a.valCorrect);
  const [first, second] = rows;
  if (!first) return '';
  const of = `${first.valCorrect.toLocaleString('en')} of ${logs.valRows.toLocaleString('en')}`;
  const right = `At epoch ${epoch}, run ${first.run} gets ${of} digits right`;
  if (!second) return `${right}.`;
  const lead = first.valCorrect - second.valCorrect;
  return lead === 0
    ? `At epoch ${epoch}, both runs get ${of} digits right.`
    : `${right}, ${lead} more than run ${second.run}.`;
}

/** Pin a checkpoint by number: the keyboard's way to do what a click on a point does. */
/** Pin a checkpoint; it opens on the other criterion's pick, the one worth comparing. */
function PinForm({
  logs,
  onPin,
  pins,
  suggest,
}: Pick<Props, 'logs' | 'onPin' | 'pins'> & { suggest: { run: string; epoch: number } }) {
  const [run, setRun] = useState(suggest.run);
  const [text, setText] = useState(String(suggest.epoch));
  const epoch = Number(text);
  const valid = Number.isInteger(epoch) && epoch >= 1 && epoch <= logs.epochs;
  const pinned = pins.some((p) => p.run === run && p.epoch === epoch);
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (valid && !pinned) onPin({ run, epoch });
  };
  return (
    <form className="r1-pin-form" onSubmit={submit}>
      <label>
        Run{' '}
        <select value={run} onChange={(e) => setRun(e.currentTarget.value)}>
          {logs.runs.map((r) => (
            <option key={r.id}>{r.id}</option>
          ))}
        </select>
      </label>
      <label>
        Epoch{' '}
        <input
          type="number"
          min={1}
          max={logs.epochs}
          step={1}
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
        />
      </label>
      <button type="submit" disabled={!valid || pinned}>
        {pinned ? 'Pinned' : 'Pin'}
      </button>
    </form>
  );
}
