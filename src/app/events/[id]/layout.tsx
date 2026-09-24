import type { Metadata } from 'next';
import { EventTabs } from '@/components/app/EventTabs';
import { organizerEvent } from '@/lib/app/session';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { event } = await organizerEvent(id);
  return { title: `${event.competition.name} — CourtSync`, robots: { index: false } };
}

const FORMAT = { tournament: 'Tournament', league: 'League', dropin: 'Drop-in' } as const;
const STATUS = {
  draft: 'Draft — only organizers can see it',
  published: 'Published',
  archived: 'Archived',
} as const;

export default async function EventLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const { event } = await organizerEvent(id);
  const c = event.competition;
  const base = `/events/${id}`;
  const tabs = [
    { href: base, label: 'Overview' },
    { href: `${base}/setup`, label: 'Setup' },
    ...(c.format === 'dropin'
      ? [{ href: `${base}/door`, label: 'Door' }]
      : [
          { href: `${base}/schedule`, label: 'Schedule' },
          { href: `${base}/scores`, label: 'Scores' },
          { href: `${base}/standings`, label: 'Standings' },
        ]),
    ...(c.format === 'tournament' ? [{ href: `${base}/bracket`, label: 'Bracket' }] : []),
    ...(c.format === 'league' ? [{ href: `${base}/weeks`, label: 'Weeks' }] : []),
    { href: `${base}/notices`, label: 'Notices' },
    { href: `${base}/print`, label: 'Print' },
    { href: `${base}/settings`, label: 'Settings' },
  ];
  return (
    <>
      <div className="border-b border-hairline bg-parchment">
        <div className="mx-auto max-w-[1100px] px-6 pt-8 pb-3">
          <p className="text-caption text-ink-muted-80">
            {FORMAT[c.format]} · {STATUS[c.status ?? 'draft']}
          </p>
          <h1 className="mt-1 text-display-md">{c.name}</h1>
          <div className="mt-4">
            <EventTabs items={tabs} />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[1100px] px-6 py-10">{children}</div>
    </>
  );
}
