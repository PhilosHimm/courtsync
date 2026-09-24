import { ActionButton } from '@/components/app/ActionButton';
import { BracketView } from '@/components/app/BracketView';
import { EmptyState, Notice } from '@/components/app/ui';
import { organizerEvent } from '@/lib/app/session';
import type { BracketStage } from '@/lib/event/bracket-stages';
import { bracketStages } from '@/lib/event/bracket-stages';
import { driftAfter, namesOf, playoffMatchesOf, poolPlayComplete } from '@/lib/event/engine';
import { seedAction } from '../actions';

export default async function BracketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ stage?: string; view?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const { event } = await organizerEvent(id);
  const playoff = playoffMatchesOf(event);
  const started = playoff.some((m) => m.sets.length > 0 || m.status === 'live');
  const drift = playoff.length > 0 ? driftAfter(event, event.matches) : [];
  const base = `/events/${id}/bracket`;
  const names = namesOf(event);

  return (
    <div className="flex flex-col gap-8">
      {playoff.length === 0 ? (
        poolPlayComplete(event) ? (
          <div className="flex flex-col gap-3">
            <p className="text-body">
              Pool play is complete. Seed the playoffs from the tables — seeding reads the records,
              never a pool letter.
            </p>
            <ActionButton
              action={seedAction}
              fields={{ id }}
              label="Seed the playoffs"
              variant="primary"
              pending="Seeding…"
            />
          </div>
        ) : (
          <EmptyState title="The bracket comes after pool play">
            It can be seeded once every pool match has a result.
          </EmptyState>
        )
      ) : (
        <>
          {drift.length > 0 && (
            <Notice tone="warning">
              A corrected pool score means today’s tables draw{' '}
              {drift.map((d) => `${d.tier} ${d.slot.toUpperCase()}`).join(', ')} differently from
              the bracket on the wall.{' '}
              {started
                ? 'The playoffs have started, so the bracket stays as drawn.'
                : 'Reseed to follow the tables.'}
            </Notice>
          )}
          {!started && (
            <ActionButton
              action={seedAction}
              fields={{ id }}
              label="Reseed from the tables"
              pending="Seeding…"
            />
          )}
          {[...new Set(playoff.map((m) => m.bracket ?? ''))].map((tier) => (
            <BracketView
              key={tier}
              tier={tier}
              stages={bracketStages({
                competitionSlug: event.competition.slug,
                tier,
                matches: playoff,
                names,
              })}
              current={q.stage as BracketStage['key'] | undefined}
              hrefFor={(stage) => `${base}?stage=${stage}`}
              mode={q.view === 'list' ? 'list' : 'stages'}
              listHref={`${base}?view=list`}
              stagesHref={base}
            />
          ))}
        </>
      )}
    </div>
  );
}
