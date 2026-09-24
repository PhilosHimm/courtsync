import type { Metadata } from 'next';
import { ScoreForm } from '@/components/app/ScoreForm';
import { StatusText } from '@/components/app/ui';
import { Tile } from '@/components/Tile';
import { venueClockLabel } from '@/lib/core';
import { getDb } from '@/lib/db/client';
import { scoreLinkView } from '@/lib/db/scores';
import { scorekeeperAction } from './actions';

export const dynamic = 'force-dynamic';
// A capability URL: never indexed, never sent onward as a referrer.
export const metadata: Metadata = {
  title: 'Score a match — CourtSync',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/**
 * The volunteer's screen (#22): one match, the set boxes, a save button.
 * Nothing else of the event is shown — the link grants one match.
 */
export default async function ScorekeeperPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await scoreLinkView(await getDb(), token);
  if (!view) {
    return (
      <Tile surface="parchment">
        <h1 className="text-display-md">This score link does not work</h1>
        <p className="mt-2 text-body">
          It may have been replaced or revoked. Ask the organizer for a new one.
        </p>
      </Tile>
    );
  }
  return (
    <Tile surface="parchment">
      <div className="mx-auto max-w-md rounded-lg border border-hairline bg-canvas p-6">
        <p className="text-caption text-ink-muted-80">{view.eventName}</p>
        <h1 className="mt-1 text-display-md">
          {view.home} v {view.away}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-caption text-ink-muted-80">
          {view.startAt && <span>{venueClockLabel(view.startAt, view.timeZone)}</span>}
          {view.court && <span>{view.court}</span>}
          <StatusText status={view.status} />
        </p>
        <p className="mt-3 text-caption">
          {view.format.label}. Type the final score of each set when the match ends.
        </p>
        <div className="mt-6">
          <ScoreForm
            action={scorekeeperAction}
            hidden={{ token, competition: view.competitionId, match: view.matchKey }}
            home={view.home}
            away={view.away}
            setLabels={view.format.setLabels}
            initial={view.sets}
          />
        </div>
      </div>
    </Tile>
  );
}
