import { ScrollRegion } from '@/components/ScrollRegion';
import type { Match, Standing, Tiebreaker } from '@/lib/core';
import { explainStandings } from '@/lib/scheduling';

/**
 * A standings table that says why (#16): every row carries the one-line
 * reason it sits above the row below, from the tiebreaker that actually
 * settled the pair — in the organizer's own order. Screen-reader sensible:
 * a real table with a caption, and the reason as its own column rather than a
 * hover.
 */
export function StandingsView({
  title,
  standings,
  matches,
  tiebreakerOrder,
  splitSetsDecidedByTotalPoints,
}: {
  title: string;
  standings: readonly Standing[];
  matches: readonly Match[];
  tiebreakerOrder?: readonly Tiebreaker[] | undefined;
  splitSetsDecidedByTotalPoints: boolean;
}) {
  const reasons = new Map(
    explainStandings({
      standings,
      matches,
      splitSetsDecidedByTotalPoints,
      ...(tiebreakerOrder ? { tiebreakerOrder } : {}),
    }).map((e) => [e.participantId, e.summary]),
  );
  const played = standings.some((s) => s.wins + s.losses > 0);
  return (
    <ScrollRegion
      label={title}
      className="min-w-0 overflow-x-auto rounded-lg border border-hairline"
    >
      <table className="w-full min-w-[36rem] text-left text-caption">
        <caption className="px-3 py-2 text-left text-caption-strong">{title}</caption>
        <thead className="bg-parchment">
          <tr>
            <th scope="col" className="px-3 py-2">
              #
            </th>
            <th scope="col" className="px-3 py-2">
              Team
            </th>
            <th scope="col" className="px-3 py-2">
              W–L
            </th>
            <th scope="col" className="px-3 py-2">
              Sets
            </th>
            <th scope="col" className="px-3 py-2">
              Points
            </th>
            <th scope="col" className="px-3 py-2">
              Why here
            </th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row) => (
            <tr key={row.participantId} className="border-t border-hairline align-top">
              <td className="px-3 py-2">{row.rank}</td>
              <th scope="row" className="px-3 py-2 text-left font-normal">
                {row.participantName}
              </th>
              <td className="px-3 py-2">
                {row.wins}–{row.losses}
              </td>
              <td className="px-3 py-2">
                {row.setsWon}–{row.setsLost}
              </td>
              <td className="px-3 py-2">
                {row.pointDifferential > 0 ? `+${row.pointDifferential}` : row.pointDifferential}
              </td>
              <td className="px-3 py-2 text-ink-muted-80">
                {played ? reasons.get(row.participantId) : 'Nothing played yet.'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}
