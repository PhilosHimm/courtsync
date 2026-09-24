'use client';

import { useActionState } from 'react';
import type { FormState } from './forms';
import { FormMessage, INPUT, SubmitButton } from './forms';

/**
 * Final set scores, typed when the match ends (#22). Not point by point.
 *
 * Validation warns and never blocks: an odd score is saved and the warning is
 * shown. A change to a score already recorded is not saved until it is
 * confirmed, with what it changes and which quarterfinals it moves in front
 * of the person — the consequence that bites at 3:20, not at 3:50.
 */

interface Drift {
  matchId: string;
  tier: string;
  slot: string;
}
interface ScoreData {
  kind: 'confirm' | 'saved';
  changes?: string[];
  warnings?: Array<{ message: string }>;
  drift?: Drift[];
  stalled?: Array<{ tier: string; reason: string }>;
}

export function ScoreForm({
  action,
  hidden,
  home,
  away,
  setLabels,
  initial,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  hidden: Record<string, string>;
  home: string;
  away: string;
  setLabels: string[];
  initial: Array<{ home: number; away: number }>;
}) {
  const [state, formAction] = useActionState(action, null);
  const data = (state?.ok ? state.data : undefined) as ScoreData | undefined;
  const confirming = data?.kind === 'confirm';
  const rows = Math.max(setLabels.length, initial.length);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <table className="text-caption">
        <caption className="sr-only">
          Set scores, {home} against {away}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="pr-3 text-left">
              Set
            </th>
            <th scope="col" className="px-2 text-left">
              {home}
            </th>
            <th scope="col" className="px-2 text-left">
              {away}
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, i) => (
            <tr key={setLabels[i] ?? i}>
              <th scope="row" className="py-1 pr-3 text-left font-normal">
                {setLabels[i] ?? `Set ${i + 1}`}
              </th>
              <td className="px-2 py-1">
                <input
                  aria-label={`${home}, ${setLabels[i] ?? `set ${i + 1}`}`}
                  name="home"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  defaultValue={initial[i]?.home ?? ''}
                  className={`${INPUT} w-20`}
                />
              </td>
              <td className="px-2 py-1">
                <input
                  aria-label={`${away}, ${setLabels[i] ?? `set ${i + 1}`}`}
                  name="away"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  defaultValue={initial[i]?.away ?? ''}
                  className={`${INPUT} w-20`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-caption text-ink-muted-80">Leave a set blank if it was not played.</p>

      {confirming && (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-ink p-4">
          <p className="text-body-strong">This changes a recorded score</p>
          <ul className="list-disc pl-5 text-caption">
            {data.changes?.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          {data.drift && data.drift.length > 0 && (
            <p className="text-caption">
              <span className="text-caption-strong">It moves the bracket: </span>
              {data.drift.map((d) => `${d.tier} ${d.slot.toUpperCase()}`).join(', ')} would be drawn
              differently.
            </p>
          )}
          {data.warnings?.map((w) => (
            <p key={w.message} className="text-caption">
              {w.message}
            </p>
          ))}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="reason" className="text-caption-strong">
              Why (kept in the history)
            </label>
            <input id="reason" name="reason" className={INPUT} placeholder="Sheet misread" />
          </div>
          <input type="hidden" name="confirm" value="yes" />
        </div>
      )}

      {data?.kind === 'saved' && (
        <div role="status" className="flex flex-col gap-1 text-caption">
          <p className="text-caption-strong">Score saved.</p>
          {data.warnings?.map((w) => (
            <p key={w.message}>{w.message}</p>
          ))}
          {data.drift && data.drift.length > 0 && (
            <p>
              The pool tables now draw{' '}
              {data.drift.map((d) => `${d.tier} ${d.slot.toUpperCase()}`).join(', ')} differently
              from the bracket already set.
            </p>
          )}
          {data.stalled?.map((s) => (
            <p key={s.tier}>
              The {s.tier} bracket cannot advance: {s.reason}
            </p>
          ))}
        </div>
      )}
      {state && !state.ok && <FormMessage state={state} />}

      <div>
        <SubmitButton pending="Saving…">
          {confirming ? 'Confirm the change' : 'Save score'}
        </SubmitButton>
      </div>
    </form>
  );
}
