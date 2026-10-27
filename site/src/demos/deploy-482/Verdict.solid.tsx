/** @jsxImportSource solid-js */
import { Show } from 'solid-js';
import { headline } from './answer';
import type { DeploySummary } from './incident';
import type { Deploy } from './simulator';

/**
 * The verdict banner: the question, the computed answer for #482, the Roll back button while it
 * applies, then the recovery as the rollback's own verdict once two minutes have passed.
 */
export function Verdict(props: {
  answer: DeploySummary | undefined;
  rollback: Deploy | undefined;
  rollbackSummary: (id: string) => DeploySummary | undefined;
  onRollBack: () => void;
  utc: (time: number) => string;
}) {
  const state = () =>
    props.rollback ? 'rolled-back' : props.answer?.verdict.rollBack ? 'roll-back' : 'waiting';
  return (
    <section class="verdict" aria-labelledby="verdict-title" data-state={state()}>
      <h1 id="verdict-title">Did deploy #482 cause the p99 spike?</h1>
      <p class="answer" data-answer>
        {props.answer ? headline(props.answer.verdict) : ''}
      </p>
      <Show
        when={props.rollback}
        fallback={
          <Show when={props.answer?.verdict.rollBack}>
            <button type="button" class="rollback" onClick={() => props.onRollBack()}>
              Roll back #482
            </button>
          </Show>
        }
      >
        {(rb) => {
          const recovery = () => props.rollbackSummary(rb().id)?.verdict;
          return (
            <p class="recovery" data-recovery>
              {rb().id} rolled back #482 at {props.utc(rb().time)} UTC.{' '}
              {recovery() ? headline(recovery()!) : ''}
            </p>
          );
        }}
      </Show>
    </section>
  );
}
