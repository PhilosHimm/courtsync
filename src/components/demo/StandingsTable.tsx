import type { Standing } from '@/lib/core';

/**
 * A standings table, computed on every render from the matches above it.
 *
 * There is no standings table in the schema and there is no standings state
 * in this component. `computeStandings` runs on read, every time — which is
 * why flipping a result upstairs is reflected here without anything being
 * invalidated, and why audit finding H9 (denormalized win/loss columns
 * drifting away from the matches they summarized) cannot recur.
 *
 * The columns are the tiebreakers, in the order they are applied: win
 * percentage, then head-to-head, then set differential, then point
 * differential. Head-to-head has no column because it is not a number a team
 * carries around — it only exists between two tied teams.
 *
 * The adjustment column appears only when a penalty has actually been ruled.
 * A team penalized five points has a differential that no longer matches its
 * scoresheet, and the difference has to be visible or the table is asking to
 * be trusted rather than checked. Where the table is empty of penalties the
 * column would be a row of zeros teaching nobody anything, so it is not
 * rendered — and that also keeps the common case identical to what shipped
 * before penalties existed.
 *
 * Whether the public read-only view shows this column is a separate question
 * and is not settled here: penalties are the organizer's ruling, and this app
 * has no organizer/public split to hang that distinction on yet.
 */
export function StandingsTable({ standings }: { standings: readonly Standing[] }) {
  if (standings.length === 0) {
    return <p className="text-caption text-ink-muted-80">Nothing played yet.</p>;
  }

  const anyAdjusted = standings.some((row) => row.pointAdjustment !== 0);

  return (
    // min-w-0 because this sits inside flex and grid parents, whose children
    // default to `min-width: auto` and would size to the table rather than
    // letting it scroll.
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-left">
        <thead>
          <tr className="border-hairline border-b">
            <th scope="col" className="py-2 pr-3 text-micro-legal text-ink-muted-80 font-normal">
              #
            </th>
            <th scope="col" className="py-2 pr-3 text-micro-legal text-ink-muted-80 font-normal">
              Team
            </th>
            <th scope="col" className="py-2 pr-3 text-micro-legal text-ink-muted-80 font-normal">
              W–L
            </th>
            <th scope="col" className="py-2 pr-3 text-micro-legal text-ink-muted-80 font-normal">
              Sets
            </th>
            {anyAdjusted && (
              <th scope="col" className="py-2 pr-3 text-micro-legal text-ink-muted-80 font-normal">
                Adj
              </th>
            )}
            <th scope="col" className="py-2 text-micro-legal text-ink-muted-80 font-normal">
              Pt diff
            </th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row) => (
            <tr key={row.participantId} className="border-divider-soft border-b last:border-0">
              <td className="py-2 pr-3 text-caption text-ink-muted-80">{row.rank}</td>
              <td className="py-2 pr-3 text-caption-strong text-ink">{row.participantName}</td>
              <td className="py-2 pr-3 text-caption text-ink">
                {row.wins}–{row.losses}
              </td>
              <td className="py-2 pr-3 text-caption text-ink-muted-80">
                {row.setsWon}–{row.setsLost}
              </td>
              {anyAdjusted && (
                <td className="py-2 pr-3 text-caption text-ink-muted-80">
                  {row.pointAdjustment === 0 ? (
                    '—'
                  ) : (
                    <span className="text-primary">
                      {row.pointAdjustment > 0 ? '+' : ''}
                      {row.pointAdjustment}
                    </span>
                  )}
                </td>
              )}
              <td className="py-2 text-caption text-ink-muted-80">
                {row.pointDifferential > 0 ? '+' : ''}
                {row.pointDifferential}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
