import { StandingsView } from '@/components/app/StandingsView';
import { EmptyState } from '@/components/app/ui';
import { organizerEvent } from '@/lib/app/session';
import { leagueTable, poolTables, setFormatsOf } from '@/lib/event/engine';
import { setFormatFor } from '@/lib/scheduling';

export default async function StandingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event } = await organizerEvent(id);
  const split = setFormatFor('pool', setFormatsOf(event)).splitDecidedOnTotalPoints;
  const order = event.competition.tiebreakerOrder;
  if (event.competition.format === 'league') {
    return (
      <StandingsView
        title="Season table"
        standings={leagueTable(event)}
        matches={event.matches}
        tiebreakerOrder={order}
        splitSetsDecidedByTotalPoints={split}
      />
    );
  }
  if (event.pools.length === 0)
    return <EmptyState title="No pools yet">Generate the schedule to draw them.</EmptyState>;
  const tables = poolTables(event);
  return (
    <div className="flex flex-col gap-8">
      {event.pools.map((pool) => (
        <StandingsView
          key={pool.id}
          title={`Pool ${pool.name}`}
          standings={tables[pool.id] ?? []}
          matches={event.matches.filter((m) => m.poolId === pool.id)}
          tiebreakerOrder={order}
          splitSetsDecidedByTotalPoints={split}
        />
      ))}
    </div>
  );
}
