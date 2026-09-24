import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState, PageHeading } from '@/components/app/ui';
import { Tile } from '@/components/Tile';
import { getDb } from '@/lib/db/client';
import { listPublicEvents } from '@/lib/db/public';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Events — CourtSync',
  description: 'Published volleyball tournaments, leagues and drop-ins run on CourtSync.',
};

export default async function PublicIndex() {
  const events = await listPublicEvents(await getDb());
  return (
    <Tile surface="canvas">
      <PageHeading
        title="Events"
        lead="Tournaments, leagues and drop-ins that organizers have published."
      />
      <ul className="mt-8 flex flex-col gap-2">
        {events.length === 0 ? (
          <li>
            <EmptyState title="Nothing published yet" />
          </li>
        ) : (
          events.map((e) => (
            <li key={e.id}>
              <Link
                href={`/e/${e.id}`}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-hairline px-4 py-3"
              >
                <span className="text-body-strong text-primary">{e.name}</span>
                <span className="text-caption text-ink-muted-80">
                  {
                    { tournament: 'Tournament', league: 'League', dropin: 'Drop-in' }[
                      e.format as 'tournament'
                    ]
                  }
                  {e.firstPlayDate ? ` · ${e.firstPlayDate}` : ''}
                </span>
              </Link>
            </li>
          ))
        )}
      </ul>
    </Tile>
  );
}
