import { describe, expect, it } from 'vitest';
import { describeConflict } from '@/lib/event/conflicts';
import type { ScheduleConflict } from '@/lib/scheduling';
import { snapshotOf } from './snapshot-fixture';

describe('describeConflict', () => {
  const event = snapshotOf();
  const t = event.timeslots[0]!.id;
  const m = (id: string, home: string, away: string) => ({
    id,
    competitionId: 'comp-1',
    sessionId: 'sess-1',
    homeParticipantId: home,
    awayParticipantId: away,
    status: 'scheduled' as const,
    sets: [],
  });
  const withMatches = {
    ...event,
    matches: [m('a', 'team-01', 'team-02'), m('b', 'team-01', 'team-03')],
  };

  it('names teams, courts and the venue clock — never ids', () => {
    const sentence = describeConflict(
      {
        kind: 'participant-double-booked',
        severity: 'blocking',
        participantId: 'team-01',
        matchIds: ['a', 'b'],
        timeslotIds: [t, t],
      },
      withMatches,
    );
    expect(sentence).toBe(
      'Team 1 is in two places at 9:00am: Team 1 v Team 2 and Team 1 v Team 3.',
    );
  });

  it('describes every kind of conflict', () => {
    const kinds: ScheduleConflict[] = [
      {
        kind: 'court-double-booked',
        severity: 'blocking',
        courtId: 'court-1',
        matchIds: ['a', 'b'],
        timeslotIds: [t, t],
      },
      {
        kind: 'outside-court-window',
        severity: 'blocking',
        matchId: 'a',
        courtId: 'court-2',
        timeslotId: t,
      },
      { kind: 'unplaced-match', severity: 'warning', matchId: 'b' },
      {
        kind: 'insufficient-rest',
        severity: 'warning',
        participantId: 'team-01',
        matchIds: ['a', 'b'],
        restSlots: 0,
      },
    ];
    for (const conflict of kinds)
      expect(describeConflict(conflict, withMatches)).not.toMatch(/team-0|court-\d|sess-/);
  });
});
