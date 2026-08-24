/**
 * SKIPPED — specification for `seedBrackets` and `advanceBracket`.
 *
 * Encodes audit findings H8 (contradictory seeding implementations),
 * H14 (one-way advancement) and H15 (a tied playoff match deadlocked the
 * bracket silently).
 */

import type { Match, Standing } from '@courtsync/core';
import { describe, expect, it } from 'vitest';
import { playoffMatchId } from '../src/match-ids';
import { advanceBracket, seedBrackets } from '../src/seeding';

function standing(id: string, rank: number, wins: number, pd: number): Standing {
  return {
    participantId: id,
    participantName: id.toUpperCase(),
    wins,
    losses: 3 - wins,
    winPercentage: wins / 3,
    setsWon: wins * 2,
    setsLost: (3 - wins) * 2,
    setDifferential: wins * 2 - (3 - wins) * 2,
    pointsFor: 100 + pd,
    pointsAgainst: 100,
    pointDifferential: pd,
    rank,
  };
}

const twoPools = {
  competitionSlug: 'spring-open',
  sessionId: 'sess-1',
  standingsByPool: {
    'pool-a': [
      standing('a1', 1, 3, 30),
      standing('a2', 2, 2, 10),
      standing('a3', 3, 1, -10),
      standing('a4', 4, 0, -30),
    ],
    'pool-b': [
      standing('b1', 1, 3, 40),
      standing('b2', 2, 2, 5),
      standing('b3', 3, 1, -5),
      standing('b4', 4, 0, -40),
    ],
  },
  tiers: ['gold'],
};

function bracketMatch(
  id: string,
  home: string | null,
  away: string | null,
  sets: Array<[number, number]>,
): Match {
  return {
    id,
    competitionId: 'comp-1',
    sessionId: 'sess-1',
    poolId: null,
    courtId: 'court-1',
    timeslotId: 'ts-1',
    homeParticipantId: home,
    awayParticipantId: away,
    bracket: 'gold',
    status: sets.length ? 'final' : 'scheduled',
    sets: sets.map(([h, a], i) => ({
      id: `${id}-s${i + 1}`,
      matchId: id,
      setNumber: i + 1,
      homePoints: h,
      awayPoints: a,
    })),
  };
}

describe.skip('seedBrackets', () => {
  it('produces a full 8-team bracket for one tier', () => {
    const seeded = seedBrackets(twoPools);
    const slots = seeded.map((s) => s.slot).sort();
    expect(slots).toEqual(['consolation', 'final', 'q1', 'q2', 'q3', 'q4', 's1', 's2'].sort());
  });

  /** AUDIT FINDING C3 — ids come from the shared helper, always. */
  it('C3: builds every id through playoffMatchId', () => {
    const seeded = seedBrackets(twoPools);
    for (const s of seeded) {
      expect(s.matchId).toBe(playoffMatchId('spring-open', s.tier, s.slot));
    }
  });

  it('cross-seeds pool winners against the other pool lower seeds', () => {
    const seeded = seedBrackets(twoPools);
    const q1 = seeded.find((s) => s.slot === 'q1');
    // Top overall seed must not face the other pool top seed in a quarterfinal.
    expect([q1?.homeParticipantId, q1?.awayParticipantId]).not.toEqual(
      expect.arrayContaining(['a1', 'b1']),
    );
  });

  /**
   * AUDIT FINDING H9 — seeding must use actual records, not pool position
   * alone, when ordering across pools.
   */
  it('H9: ranks across pools by record, not by pool label', () => {
    const seeded = seedBrackets(twoPools);
    const q = seeded.filter((s) => s.slot.startsWith('q'));
    const withTopSeed = q.find((s) => s.homeParticipantId === 'b1' || s.awayParticipantId === 'b1');
    // b1 has the better differential, so it should draw the weakest opponent.
    expect([withTopSeed?.homeParticipantId, withTopSeed?.awayParticipantId]).toContain('a4');
  });

  /** AUDIT FINDING H8 — one implementation, one answer. */
  it('H8: is deterministic across repeated calls', () => {
    const a = seedBrackets(twoPools);
    const b = seedBrackets(twoPools);
    expect(a).toEqual(b);
  });

  it('leaves semifinal and final slots empty until quarterfinals resolve', () => {
    const seeded = seedBrackets(twoPools);
    for (const slot of ['s1', 's2', 'final'] as const) {
      const m = seeded.find((s) => s.slot === slot);
      expect(m?.homeParticipantId).toBeNull();
      expect(m?.awayParticipantId).toBeNull();
    }
  });
});

describe.skip('advanceBracket', () => {
  const slug = 'spring-open';

  it('moves quarterfinal winners into the semifinals', () => {
    const matches = [
      bracketMatch(playoffMatchId(slug, 'gold', 'q1'), 'a1', 'b4', [
        [25, 20],
        [25, 18],
      ]),
      bracketMatch(playoffMatchId(slug, 'gold', 'q2'), 'b2', 'a3', [
        [25, 22],
        [25, 20],
      ]),
      bracketMatch(playoffMatchId(slug, 'gold', 's1'), null, null, []),
    ];
    const out = advanceBracket({ competitionSlug: slug, tier: 'gold', matches });
    const s1 = out.find((m) => m.id === playoffMatchId(slug, 'gold', 's1'));
    expect([s1?.homeParticipantId, s1?.awayParticipantId].sort()).toEqual(['a1', 'b2']);
  });

  /**
   * AUDIT FINDING H14 — advancement was one-way, so a corrected quarterfinal
   * score never propagated into the semifinal that had already been filled.
   */
  it('H14: re-advances when an upstream result is corrected', () => {
    const corrected = [
      // q1 originally won by a1, now corrected to b4
      bracketMatch(playoffMatchId(slug, 'gold', 'q1'), 'a1', 'b4', [
        [20, 25],
        [18, 25],
      ]),
      bracketMatch(playoffMatchId(slug, 'gold', 'q2'), 'b2', 'a3', [
        [25, 22],
        [25, 20],
      ]),
      // semifinal already populated with the stale winner
      bracketMatch(playoffMatchId(slug, 'gold', 's1'), 'a1', 'b2', []),
    ];
    const out = advanceBracket({ competitionSlug: slug, tier: 'gold', matches: corrected });
    const s1 = out.find((m) => m.id === playoffMatchId(slug, 'gold', 's1'));
    expect([s1?.homeParticipantId, s1?.awayParticipantId].sort()).toEqual(['b2', 'b4']);
  });

  /**
   * AUDIT FINDING H15 — a tied elimination match deadlocked the bracket and
   * nothing surfaced the problem. Ties are invalid here; fail loudly.
   */
  it('H15: throws on a tied elimination match rather than deadlocking', () => {
    const tied = [
      bracketMatch(playoffMatchId(slug, 'gold', 'q1'), 'a1', 'b4', [
        [25, 20],
        [20, 25],
      ]),
      bracketMatch(playoffMatchId(slug, 'gold', 's1'), null, null, []),
    ];
    expect(() => advanceBracket({ competitionSlug: slug, tier: 'gold', matches: tied })).toThrow(
      /tie/i,
    );
  });

  it('leaves downstream slots empty while upstream matches are unfinished', () => {
    const partial = [
      bracketMatch(playoffMatchId(slug, 'gold', 'q1'), 'a1', 'b4', [
        [25, 20],
        [25, 18],
      ]),
      bracketMatch(playoffMatchId(slug, 'gold', 'q2'), 'b2', 'a3', []),
      bracketMatch(playoffMatchId(slug, 'gold', 's1'), null, null, []),
    ];
    const out = advanceBracket({ competitionSlug: slug, tier: 'gold', matches: partial });
    const s1 = out.find((m) => m.id === playoffMatchId(slug, 'gold', 's1'));
    const filled = [s1?.homeParticipantId, s1?.awayParticipantId].filter(Boolean);
    expect(filled).toHaveLength(1);
  });
});
