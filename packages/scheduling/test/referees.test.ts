/**
 * SKIPPED — specification for `assignReferees`.
 *
 * Encodes audit finding H7, which was verified by execution: in scoop's
 * 4-team pool, team `a4` never refereed a single match.
 */

import type { Match } from '@courtsync/core';
import { describe, expect, it } from 'vitest';
import type { RefereeInput } from '../src/referees';
import { assignReferees } from '../src/referees';

function match(id: string, home: string, away: string, timeslotId: string, poolId: string): Match {
  return {
    id,
    competitionId: 'comp-1',
    sessionId: 'sess-1',
    poolId,
    courtId: 'court-1',
    timeslotId,
    homeParticipantId: home,
    awayParticipantId: away,
    roundLabel: 'Pool Play',
    status: 'scheduled',
    sets: [],
  };
}

/** A 4-team pool round robin: 6 matches, 3 rounds of 2 — the H7 scenario. */
function fourTeamPool(): RefereeInput {
  const teams = ['a1', 'a2', 'a3', 'a4'];
  return {
    matches: [
      match('m1', 'a1', 'a2', 'ts-1', 'pool-a'),
      match('m2', 'a3', 'a4', 'ts-2', 'pool-a'),
      match('m3', 'a1', 'a3', 'ts-3', 'pool-a'),
      match('m4', 'a2', 'a4', 'ts-4', 'pool-a'),
      match('m5', 'a1', 'a4', 'ts-5', 'pool-a'),
      match('m6', 'a2', 'a3', 'ts-6', 'pool-a'),
    ],
    pools: [{ id: 'pool-a', name: 'A', participantIds: teams }],
    allParticipantIds: teams,
  };
}

describe.skip('assignReferees', () => {
  it('assigns a referee to every match', () => {
    const out = assignReferees(fourTeamPool());
    expect(out.unassigned).toHaveLength(0);
    for (const m of out.matches) {
      expect(m.refParticipantId).toBeTruthy();
    }
  });

  it('never assigns a referee who is playing in that match', () => {
    const out = assignReferees(fourTeamPool());
    for (const m of out.matches) {
      expect(m.refParticipantId).not.toBe(m.homeParticipantId);
      expect(m.refParticipantId).not.toBe(m.awayParticipantId);
    }
  });

  it('never assigns a referee who is playing elsewhere in the same timeslot', () => {
    const out = assignReferees(fourTeamPool());
    const playingAt = new Map<string, Set<string>>();
    for (const m of out.matches) {
      if (!m.timeslotId) continue;
      const s = playingAt.get(m.timeslotId) ?? new Set<string>();
      if (m.homeParticipantId) s.add(m.homeParticipantId);
      if (m.awayParticipantId) s.add(m.awayParticipantId);
      playingAt.set(m.timeslotId, s);
    }
    for (const m of out.matches) {
      if (!m.timeslotId || !m.refParticipantId) continue;
      expect(playingAt.get(m.timeslotId)?.has(m.refParticipantId)).toBe(false);
    }
  });

  /**
   * AUDIT FINDING H7 — the headline requirement.
   * In a 4-team pool every team must referee at least once.
   */
  it('H7: no participant in a pool referees zero times', () => {
    const out = assignReferees(fourTeamPool());
    const counts = out.refCounts['pool-a'];
    expect(counts).toBeDefined();
    for (const team of ['a1', 'a2', 'a3', 'a4']) {
      expect(counts?.[team] ?? 0, `${team} never refereed`).toBeGreaterThan(0);
    }
  });

  it('H7: balances load — max and min ref counts differ by at most one', () => {
    const out = assignReferees(fourTeamPool());
    const counts = Object.values(out.refCounts['pool-a'] ?? {});
    expect(counts.length).toBe(4);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('prefers a referee from the same pool when one is idle', () => {
    const twoPools: RefereeInput = {
      matches: [match('m1', 'a1', 'a2', 'ts-1', 'pool-a')],
      pools: [
        { id: 'pool-a', name: 'A', participantIds: ['a1', 'a2', 'a3', 'a4'] },
        { id: 'pool-b', name: 'B', participantIds: ['b1', 'b2'] },
      ],
      allParticipantIds: ['a1', 'a2', 'a3', 'a4', 'b1', 'b2'],
    };
    const out = assignReferees(twoPools);
    expect(['a3', 'a4']).toContain(out.matches[0]?.refParticipantId);
  });

  it('falls back across pools when no same-pool participant is idle', () => {
    const squeezed: RefereeInput = {
      matches: [match('m1', 'a1', 'a2', 'ts-1', 'pool-a')],
      pools: [
        { id: 'pool-a', name: 'A', participantIds: ['a1', 'a2'] },
        { id: 'pool-b', name: 'B', participantIds: ['b1', 'b2'] },
      ],
      allParticipantIds: ['a1', 'a2', 'b1', 'b2'],
    };
    const out = assignReferees(squeezed);
    expect(['b1', 'b2']).toContain(out.matches[0]?.refParticipantId);
  });

  it('flags rather than invents when nobody is available', () => {
    const impossible: RefereeInput = {
      matches: [match('m1', 'a1', 'a2', 'ts-1', 'pool-a')],
      pools: [{ id: 'pool-a', name: 'A', participantIds: ['a1', 'a2'] }],
      allParticipantIds: ['a1', 'a2'],
    };
    const out = assignReferees(impossible);
    expect(out.unassigned).toContain('m1');
    expect(out.matches[0]?.refParticipantId ?? null).toBeNull();
  });

  it('is deterministic', () => {
    const a = assignReferees(fourTeamPool());
    const b = assignReferees(fourTeamPool());
    expect(a.matches.map((m) => m.refParticipantId)).toEqual(
      b.matches.map((m) => m.refParticipantId),
    );
  });
});
