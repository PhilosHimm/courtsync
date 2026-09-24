/**
 * Specification for withdrawing a team and regenerating around played
 * matches (#21).
 *
 * Both are chosen for 8:52 on event day with forty people waiting:
 *
 * - Withdrawing a team turns its unplayed matches into forfeits and leaves
 *   everything else EXACTLY where it was — nobody re-reads a schedule they
 *   already photographed. The empty slots are left empty, deliberately.
 * - Regenerating never touches a played match. Anything with a score, or
 *   marked live, stays put; that is what makes the button safe at 1pm.
 */

import { describe, expect, it } from 'vitest';
import type { Match, MatchStatus } from '@/lib/core';
import { regenerateKeepingPlayed, withdrawParticipant } from '@/lib/event/withdraw';
import { setFormatFor } from '@/lib/scheduling/match-format';

const match = (
  id: string,
  home: string | null,
  away: string | null,
  opts: Partial<Match> & { status?: MatchStatus } = {},
): Match => ({
  id,
  competitionId: 'c',
  sessionId: 's',
  poolId: 'pa',
  courtId: 'c1',
  timeslotId: `t-${id}`,
  homeParticipantId: home,
  awayParticipantId: away,
  refParticipantId: null,
  bracket: null,
  roundLabel: 'pool',
  status: 'scheduled',
  sets: [],
  ...opts,
});

const played = (id: string, home: string, away: string): Match =>
  match(id, home, away, {
    status: 'final',
    sets: [
      { id: `${id}-1`, matchId: id, setNumber: 1, homePoints: 21, awayPoints: 15 },
      { id: `${id}-2`, matchId: id, setNumber: 2, homePoints: 21, awayPoints: 17 },
    ],
  });

describe('withdrawParticipant', () => {
  const pool = setFormatFor('pool');
  const day = [
    played('m1', 'spk', 'blk'),
    match('m2', 'spk', 'dig'),
    match('m3', 'set', 'spk', { status: 'delayed' }),
    match('m4', 'blk', 'dig', { refParticipantId: 'spk' }),
    match('m5', 'dig', 'set'),
  ];

  const result = withdrawParticipant({ matches: day, participantId: 'spk', format: () => pool });

  it('turns every unplayed match of theirs into a forfeit to the opponent', () => {
    expect(result.forfeited).toEqual(['m2', 'm3']);
    const m2 = result.matches.find((m) => m.id === 'm2')!;
    const m3 = result.matches.find((m) => m.id === 'm3')!;
    expect(m2.status).toBe('forfeit');
    expect(m3.status).toBe('forfeit');
    // Recorded as real sets, to the format's target, in the opponent's favour.
    expect(m2.sets.map((s) => [s.homePoints, s.awayPoints])).toEqual([
      [0, 21],
      [0, 21],
    ]);
    expect(m3.sets.map((s) => [s.homePoints, s.awayPoints])).toEqual([
      [21, 0],
      [21, 0],
    ]);
  });

  it('never rewrites a match already played', () => {
    expect(result.matches.find((m) => m.id === 'm1')).toEqual(day[0]);
  });

  it('keeps every forfeited match on its court and in its slot', () => {
    for (const id of ['m2', 'm3']) {
      const before = day.find((m) => m.id === id)!;
      const after = result.matches.find((m) => m.id === id)!;
      expect([after.courtId, after.timeslotId]).toEqual([before.courtId, before.timeslotId]);
    }
  });

  it('clears them off the matches they were refereeing, and says so', () => {
    const m4 = result.matches.find((m) => m.id === 'm4')!;
    expect(m4.refParticipantId).toBeNull();
    expect(m4.status).toBe('scheduled');
    expect(result.refereeCleared).toEqual(['m4']);
  });

  it('leaves every other match exactly as it was', () => {
    expect(result.matches.find((m) => m.id === 'm5')).toEqual(day[4]);
    expect(result.matches.map((m) => m.id)).toEqual(day.map((m) => m.id));
  });

  it('plays a best-of-three forfeit to two sets, not three', () => {
    const playoff = setFormatFor('playoff');
    const { matches } = withdrawParticipant({
      matches: [match('q1', 'spk', 'blk', { bracket: 'gold', roundLabel: 'q1' })],
      participantId: 'spk',
      format: () => playoff,
    });
    expect(matches[0]!.sets.map((s) => [s.homePoints, s.awayPoints])).toEqual([
      [0, 25],
      [0, 25],
    ]);
  });

  it('leaves a match with no opponent yet alone, and reports it', () => {
    // A semifinal waiting on a quarter has nobody to award a forfeit to.
    const { matches, forfeited, unresolved } = withdrawParticipant({
      matches: [match('s1', 'spk', null, { bracket: 'gold', roundLabel: 's1' })],
      participantId: 'spk',
      format: () => setFormatFor('playoff'),
    });
    expect(forfeited).toEqual([]);
    expect(unresolved).toEqual(['s1']);
    expect(matches[0]!.status).toBe('scheduled');
  });

  it('does not mutate the matches it was given', () => {
    const before = JSON.stringify(day);
    withdrawParticipant({ matches: day, participantId: 'spk', format: () => pool });
    expect(JSON.stringify(day)).toBe(before);
  });
});

describe('regenerateKeepingPlayed', () => {
  const existing = [
    played('m1', 'spk', 'blk'),
    match('m2', 'spk', 'dig', { status: 'live', courtId: 'c2', timeslotId: 't2' }),
    match('m3', 'blk', 'dig', { courtId: 'c1', timeslotId: 't3' }),
  ];
  const generated = [
    match('m1', 'spk', 'blk', { courtId: 'c9', timeslotId: 't9' }),
    match('m2', 'spk', 'dig', { courtId: 'c1', timeslotId: 't1' }),
    match('m3', 'blk', 'dig', { courtId: 'c1', timeslotId: 't1' }),
    // Lands on the cell the live match is holding.
    match('m4', 'set', 'blk', { courtId: 'c2', timeslotId: 't2' }),
  ];

  const result = regenerateKeepingPlayed({ existing, generated });

  it('keeps a played match exactly as recorded, wherever regeneration wanted it', () => {
    expect(result.matches.find((m) => m.id === 'm1')).toEqual(existing[0]);
  });

  it('keeps a live match exactly where it is being played', () => {
    expect(result.matches.find((m) => m.id === 'm2')).toEqual(existing[1]);
    expect(result.kept).toEqual(['m1', 'm2']);
  });

  it('takes the new placement for anything not yet started', () => {
    const m3 = result.matches.find((m) => m.id === 'm3')!;
    expect([m3.courtId, m3.timeslotId]).toEqual(['c1', 't1']);
  });

  it('unplaces a new match that lands on a cell a kept match holds, and reports it', () => {
    const m4 = result.matches.find((m) => m.id === 'm4')!;
    expect([m4.courtId, m4.timeslotId]).toEqual([null, null]);
    expect(result.displaced).toEqual(['m4']);
  });

  it('unplaces a new match that would put a kept match’s team on two courts at once', () => {
    const r = regenerateKeepingPlayed({
      existing: [match('m2', 'spk', 'dig', { status: 'live', courtId: 'c2', timeslotId: 't2' })],
      generated: [match('m7', 'spk', 'set', { courtId: 'c1', timeslotId: 't2' })],
    });
    expect(r.displaced).toEqual(['m7']);
  });

  it('keeps a scored match that regeneration no longer produces, rather than deleting a result', () => {
    const r = regenerateKeepingPlayed({ existing: [played('old', 'a', 'b')], generated: [] });
    expect(r.matches.map((m) => m.id)).toEqual(['old']);
    expect(r.kept).toEqual(['old']);
  });

  it('does not mutate either input', () => {
    const before = JSON.stringify({ existing, generated });
    regenerateKeepingPlayed({ existing, generated });
    expect(JSON.stringify({ existing, generated })).toBe(before);
  });
});
