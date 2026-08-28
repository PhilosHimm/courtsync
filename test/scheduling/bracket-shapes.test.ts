/**
 * Specification for bracket shapes other than "two pools, eight teams, one
 * tier" — the only shape `seedBrackets` had ever been run on.
 *
 * Every assertion here encodes a decision that was previously unmade rather
 * than a bug that shipped, so the audit-finding ids are absent. What the
 * decisions protect is the same property H8 and H9 protect: one field of
 * teams produces exactly one bracket, and pool label never outranks record.
 *
 *   - An under-filled bracket gives byes to the top overall seeds, and the
 *     bye advances that seed into the semifinal. A six-team field must still
 *     reach a champion.
 *   - A quarterfinal never repeats a pool matchup when a swap exists that
 *     avoids it without moving anybody's seed.
 *   - Tiers are allocated per pool: each pool sends the same number to gold,
 *     and leftover slots go to the best remaining records.
 */

import { describe, expect, it } from 'vitest';
import type { Match, Standing } from '@/lib/core';
import { playoffMatchId } from '@/lib/scheduling/match-ids';
import { advanceBracket, seedBrackets } from '@/lib/scheduling/seeding';

/** A standing with a record, so ordering is driven by results and nothing else. */
function standing(id: string, wins: number, losses: number, pd: number): Standing {
  const played = wins + losses;
  return {
    participantId: id,
    participantName: id.toUpperCase(),
    wins,
    losses,
    winPercentage: played === 0 ? 0 : wins / played,
    setsWon: wins * 2,
    setsLost: losses * 2,
    setDifferential: wins * 2 - losses * 2,
    pointsFor: 100 + pd,
    pointsAgainst: 100,
    pointDifferential: pd,
    pointAdjustment: 0,
    rank: 0,
  };
}

/** A pool of `size` teams, best first, named `<prefix>1`..`<prefix>size`. */
function pool(prefix: string, size: number): Standing[] {
  return Array.from({ length: size }, (_, i) =>
    standing(`${prefix}${i + 1}`, size - 1 - i, i, (size - 1 - i) * 10 - i * 10),
  );
}

const quarters = ['q1', 'q2', 'q3', 'q4'] as const;

/** poolId of each participant, for the no-rematch assertions. */
function poolIndex(standingsByPool: Record<string, Standing[]>): Map<string, string> {
  const index = new Map<string, string>();
  for (const [poolId, rows] of Object.entries(standingsByPool)) {
    for (const row of rows) index.set(row.participantId, poolId);
  }
  return index;
}

describe('seedBrackets — pool counts other than two', () => {
  const threePools = {
    'pool-a': pool('a', 4),
    'pool-b': pool('b', 4),
    'pool-c': pool('c', 4),
  };

  const seedThree = () =>
    seedBrackets({
      competitionSlug: 'spring-open',
      sessionId: 'sess-1',
      standingsByPool: threePools,
      tiers: ['gold'],
    });

  it('fills all eight slots from three pools', () => {
    const seeded = seedThree();
    expect(seeded.map((s) => s.slot).sort()).toEqual(
      ['consolation', 'final', 'q1', 'q2', 'q3', 'q4', 's1', 's2'].sort(),
    );
  });

  it('never repeats a pool matchup in a quarterfinal when a swap avoids it', () => {
    const seeded = seedThree();
    const poolOf = poolIndex(threePools);
    for (const slot of quarters) {
      const match = seeded.find((s) => s.slot === slot);
      const home = match?.homeParticipantId;
      const away = match?.awayParticipantId;
      if (!home || !away) continue;
      expect(poolOf.get(home)).not.toBe(poolOf.get(away));
    }
  });

  it('keeps the top two overall seeds in opposite halves', () => {
    const seeded = seedThree();
    const halfOf = (id: string): string | undefined => {
      for (const slot of quarters) {
        const match = seeded.find((s) => s.slot === slot);
        if (match?.homeParticipantId === id || match?.awayParticipantId === id) {
          return slot === 'q1' || slot === 'q2' ? 's1' : 's2';
        }
      }
      return undefined;
    };
    // a1 and b1 tie on every measure and split on participant id, so they are
    // seeds 1 and 2. They may only meet in the final.
    expect(halfOf('a1')).toBe('s1');
    expect(halfOf('b1')).toBe('s2');
  });

  it('seeds a single pool straight down the standard bracket', () => {
    const seeded = seedBrackets({
      competitionSlug: 'spring-open',
      sessionId: 'sess-1',
      standingsByPool: { 'pool-a': pool('t', 8) },
      tiers: ['gold'],
    });
    const pairing = (slot: string) => {
      const match = seeded.find((s) => s.slot === slot);
      return [match?.homeParticipantId, match?.awayParticipantId];
    };
    // 1v8, 4v5, 3v6, 2v7 — the top seed draws the weakest qualifier.
    expect(pairing('q1')).toEqual(['t1', 't8']);
    expect(pairing('q2')).toEqual(['t4', 't5']);
    expect(pairing('q3')).toEqual(['t3', 't6']);
    expect(pairing('q4')).toEqual(['t2', 't7']);
  });

  it('is deterministic across repeated calls at every pool count', () => {
    const shapes: Array<Record<string, Standing[]>> = [
      { 'pool-a': pool('a', 4) },
      { 'pool-a': pool('a', 4), 'pool-b': pool('b', 4) },
      threePools,
      {
        'pool-a': pool('a', 4),
        'pool-b': pool('b', 4),
        'pool-c': pool('c', 4),
        'pool-d': pool('d', 4),
      },
    ];
    for (const standingsByPool of shapes) {
      const input = { competitionSlug: 's', sessionId: 'x', standingsByPool, tiers: ['gold'] };
      expect(seedBrackets(input)).toEqual(seedBrackets(input));
    }
  });
});

describe('seedBrackets — fields smaller than eight', () => {
  const sixTeams = { 'pool-a': pool('a', 3), 'pool-b': pool('b', 3) };

  const seedSix = () =>
    seedBrackets({
      competitionSlug: 'spring-open',
      sessionId: 'sess-1',
      standingsByPool: sixTeams,
      tiers: ['gold'],
    });

  it('still emits all eight slots', () => {
    expect(seedSix()).toHaveLength(8);
  });

  it('gives the byes to the top overall seeds, not to a pool winner each', () => {
    const seeded = seedSix();
    const byes = quarters
      .map((slot) => seeded.find((s) => s.slot === slot))
      .filter((m) => m?.homeParticipantId && !m?.awayParticipantId)
      .map((m) => m?.homeParticipantId);
    // a1 and b1 tie on record and split on id, so they are seeds 1 and 2.
    expect(byes.sort()).toEqual(['a1', 'b1']);
  });

  it('never leaves a quarterfinal with both sides empty', () => {
    const seeded = seedSix();
    for (const slot of quarters) {
      const match = seeded.find((s) => s.slot === slot);
      expect(match?.homeParticipantId ?? match?.awayParticipantId).not.toBeNull();
    }
  });

  it('puts a bye on the home side so the empty side is unambiguous', () => {
    const seeded = seedSix();
    for (const slot of quarters) {
      const match = seeded.find((s) => s.slot === slot);
      if (match?.homeParticipantId && match?.awayParticipantId) continue;
      expect(match?.homeParticipantId).not.toBeNull();
      expect(match?.awayParticipantId).toBeNull();
    }
  });

  it('seeds a five-team field without dropping anybody', () => {
    const seeded = seedBrackets({
      competitionSlug: 'spring-open',
      sessionId: 'sess-1',
      standingsByPool: { 'pool-a': pool('a', 3), 'pool-b': pool('b', 2) },
      tiers: ['gold'],
    });
    const placed = quarters
      .flatMap((slot) => {
        const match = seeded.find((s) => s.slot === slot);
        return [match?.homeParticipantId, match?.awayParticipantId];
      })
      .filter((id): id is string => typeof id === 'string');
    expect(placed.sort()).toEqual(['a1', 'a2', 'a3', 'b1', 'b2']);
  });
});

describe('advanceBracket — byes', () => {
  const slug = 'spring-open';

  function bracketMatch(
    slot: 'q1' | 'q2' | 'q3' | 'q4' | 's1' | 's2' | 'final',
    home: string | null,
    away: string | null,
    sets: Array<[number, number]>,
  ): Match {
    const id = playoffMatchId(slug, 'gold', slot);
    return {
      id,
      competitionId: 'comp-1',
      sessionId: 'sess-1',
      poolId: null,
      courtId: null,
      timeslotId: null,
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

  it('walks a bye into the semifinal without a result being recorded', () => {
    const out = advanceBracket({
      competitionSlug: slug,
      tier: 'gold',
      matches: [
        bracketMatch('q1', 'a1', null, []),
        bracketMatch('q2', 'b2', 'a3', [
          [25, 20],
          [25, 18],
        ]),
        bracketMatch('s1', null, null, []),
      ],
    });
    const s1 = out.find((m) => m.id === playoffMatchId(slug, 'gold', 's1'));
    expect([s1?.homeParticipantId, s1?.awayParticipantId]).toEqual(['a1', 'b2']);
  });

  it('does not treat an unresolved semifinal side as a bye into the final', () => {
    // s1 has one side filled because q2 has not been played. That is an
    // undetermined semifinal, not a walkover — nobody reaches the final.
    const out = advanceBracket({
      competitionSlug: slug,
      tier: 'gold',
      matches: [
        bracketMatch('q1', 'a1', null, []),
        bracketMatch('q2', 'b2', 'a3', []),
        bracketMatch('s1', null, null, []),
        bracketMatch('s2', null, null, []),
        bracketMatch('final', null, null, []),
      ],
    });
    const final = out.find((m) => m.id === playoffMatchId(slug, 'gold', 'final'));
    expect(final?.homeParticipantId).toBeNull();
    expect(final?.awayParticipantId).toBeNull();
  });

  it('leaves a quarterfinal with neither side filled unresolved', () => {
    const out = advanceBracket({
      competitionSlug: slug,
      tier: 'gold',
      matches: [bracketMatch('q1', null, null, []), bracketMatch('s1', null, null, [])],
    });
    const s1 = out.find((m) => m.id === playoffMatchId(slug, 'gold', 's1'));
    expect(s1?.homeParticipantId).toBeNull();
  });

  it('reaches a champion from a six-team field', () => {
    const seeded = seedBrackets({
      competitionSlug: slug,
      sessionId: 'sess-1',
      standingsByPool: { 'pool-a': pool('a', 3), 'pool-b': pool('b', 3) },
      tiers: ['gold'],
    });

    // Play every quarterfinal that has two sides, home winning each time.
    let matches: Match[] = seeded.map((s) => {
      const contested = s.slot.startsWith('q') && s.homeParticipantId && s.awayParticipantId;
      return {
        id: s.matchId,
        competitionId: 'comp-1',
        sessionId: 'sess-1',
        poolId: null,
        courtId: null,
        timeslotId: null,
        homeParticipantId: s.homeParticipantId,
        awayParticipantId: s.awayParticipantId,
        bracket: s.tier,
        status: contested ? 'final' : 'scheduled',
        sets: contested
          ? [
              {
                id: `${s.matchId}-s1`,
                matchId: s.matchId,
                setNumber: 1,
                homePoints: 25,
                awayPoints: 20,
              },
              {
                id: `${s.matchId}-s2`,
                matchId: s.matchId,
                setNumber: 2,
                homePoints: 25,
                awayPoints: 18,
              },
            ]
          : [],
      } satisfies Match;
    });

    // Advance, play the semifinals, advance again.
    matches = advanceBracket({ competitionSlug: slug, tier: 'gold', matches });
    matches = matches.map((m) => {
      const isSemi = m.id.endsWith('-s1') || m.id.endsWith('-s2');
      if (!isSemi || !m.homeParticipantId || !m.awayParticipantId) return m;
      return {
        ...m,
        status: 'final' as const,
        sets: [
          { id: `${m.id}-set1`, matchId: m.id, setNumber: 1, homePoints: 25, awayPoints: 21 },
          { id: `${m.id}-set2`, matchId: m.id, setNumber: 2, homePoints: 25, awayPoints: 19 },
        ],
      };
    });
    matches = advanceBracket({ competitionSlug: slug, tier: 'gold', matches });

    const final = matches.find((m) => m.id === playoffMatchId(slug, 'gold', 'final'));
    expect(final?.homeParticipantId).not.toBeNull();
    expect(final?.awayParticipantId).not.toBeNull();
  });
});

describe('seedBrackets — pools that do not divide the bracket', () => {
  /**
   * Cross-seeding matches each pool's nth seed against the other pool's
   * (size-1-n)th, which only places as many teams as the shorter pool can
   * cover. Eight qualifiers drawn six from one pool and two from the other
   * therefore has no cross-seeding that places everybody, and the four the
   * short pool cannot match used to fall out of the bracket entirely.
   */
  const lopsided = { 'pool-a': pool('a', 8), 'pool-b': pool('b', 2) };

  const seedLopsided = () =>
    seedBrackets({
      competitionSlug: 'spring-open',
      sessionId: 'sess-1',
      standingsByPool: lopsided,
      tiers: ['gold'],
    });

  it('places every qualifier when two pools cannot be cross-seeded', () => {
    const placed = quarters
      .flatMap((slot) => {
        const match = seedLopsided().find((s) => s.slot === slot);
        return [match?.homeParticipantId, match?.awayParticipantId];
      })
      .filter((id): id is string => typeof id === 'string');
    expect(placed).toHaveLength(8);
    expect(new Set(placed).size).toBe(8);
  });

  it('leaves a rematch standing only where no swap can remove it', () => {
    const seeded = seedLopsided();
    const poolOf = poolIndex(lopsided);
    const rematches = quarters.filter((slot) => {
      const match = seeded.find((s) => s.slot === slot);
      const home = match?.homeParticipantId;
      const away = match?.awayParticipantId;
      return !!home && !!away && poolOf.get(home) === poolOf.get(away);
    });
    // Six of the eight qualifiers come from pool A across four quarterfinals,
    // so at least two matches are all-A however they are arranged. The seeder
    // must not do worse than that floor, and must not bend the seeding to
    // pretend it can do better.
    expect(rematches).toHaveLength(2);
  });
});

describe('seedBrackets — tiers', () => {
  const twoPoolsOfEight = { 'pool-a': pool('a', 8), 'pool-b': pool('b', 8) };

  const seedTiers = (
    tiers: string[],
    standingsByPool: Record<string, Standing[]> = twoPoolsOfEight,
  ) =>
    seedBrackets({
      competitionSlug: 'spring-open',
      sessionId: 'sess-1',
      standingsByPool,
      tiers,
    });

  it('gives every tier its own full slot set', () => {
    const seeded = seedTiers(['gold', 'silver']);
    for (const tier of ['gold', 'silver']) {
      expect(seeded.filter((s) => s.tier === tier)).toHaveLength(8);
    }
  });

  it('never places a participant in two tiers', () => {
    const seeded = seedTiers(['gold', 'silver']);
    const seen = new Map<string, string>();
    for (const match of seeded) {
      for (const id of [match.homeParticipantId, match.awayParticipantId]) {
        if (!id) continue;
        const already = seen.get(id);
        if (already !== undefined) expect(already).toBe(match.tier);
        seen.set(id, match.tier);
      }
    }
  });

  it('allocates the same number from each pool to gold', () => {
    const seeded = seedTiers(['gold', 'silver']);
    const poolOf = poolIndex(twoPoolsOfEight);
    const goldIds = seeded
      .filter((s) => s.tier === 'gold')
      .flatMap((s) => [s.homeParticipantId, s.awayParticipantId])
      .filter((id): id is string => typeof id === 'string');
    const fromA = goldIds.filter((id) => poolOf.get(id) === 'pool-a').length;
    const fromB = goldIds.filter((id) => poolOf.get(id) === 'pool-b').length;
    expect(fromA).toBe(4);
    expect(fromB).toBe(4);
  });

  it('takes each pool best teams into gold, not the pool label order', () => {
    const seeded = seedTiers(['gold', 'silver']);
    const goldIds = new Set(
      seeded
        .filter((s) => s.tier === 'gold')
        .flatMap((s) => [s.homeParticipantId, s.awayParticipantId])
        .filter((id): id is string => typeof id === 'string'),
    );
    for (const id of ['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4']) {
      expect(goldIds.has(id)).toBe(true);
    }
    for (const id of ['a5', 'b5', 'a8', 'b8']) {
      expect(goldIds.has(id)).toBe(false);
    }
  });

  it('fills leftover gold slots by overall record when pools do not divide evenly', () => {
    // Three pools, eight gold slots: two guaranteed per pool, two left over.
    const threeFives = {
      'pool-a': pool('a', 5),
      'pool-b': pool('b', 5),
      'pool-c': pool('c', 5),
    };
    const seeded = seedTiers(['gold'], threeFives);
    const goldIds = new Set(
      seeded
        .flatMap((s) => [s.homeParticipantId, s.awayParticipantId])
        .filter((id): id is string => typeof id === 'string'),
    );
    // Two from each pool are guaranteed.
    for (const id of ['a1', 'a2', 'b1', 'b2', 'c1', 'c2']) {
      expect(goldIds.has(id)).toBe(true);
    }
    // The two leftover slots go to the best remaining records — the third
    // seeds — and never to a fourth seed while a third seed is unplaced.
    expect(goldIds.size).toBe(8);
    for (const id of ['a4', 'b4', 'c4', 'a5', 'b5', 'c5']) {
      expect(goldIds.has(id)).toBe(false);
    }
  });

  it('emits nothing for a tier with nobody left to fill it', () => {
    const seeded = seedTiers(['gold', 'silver'], { 'pool-a': pool('a', 4) });
    expect(seeded.filter((s) => s.tier === 'silver')).toHaveLength(0);
    expect(seeded.filter((s) => s.tier === 'gold')).toHaveLength(8);
  });

  it('is deterministic across repeated calls with several tiers', () => {
    expect(seedTiers(['gold', 'silver'])).toEqual(seedTiers(['gold', 'silver']));
  });
});

describe('seedBrackets — ties', () => {
  /**
   * The determinism the existing H8 test claims but never reaches: its fixture
   * separates every team on win percentage, so the tiebreak chain below win
   * percentage never runs. These teams are identical on record, sets and
   * points, which is the case H8 and H9 were actually about.
   */
  const tied = {
    'pool-a': [
      standing('a1', 3, 0, 30),
      standing('a2', 2, 1, 10),
      standing('a3', 1, 2, -10),
      standing('a4', 0, 3, -30),
    ],
    'pool-b': [
      standing('b1', 3, 0, 30),
      standing('b2', 2, 1, 10),
      standing('b3', 1, 2, -10),
      standing('b4', 0, 3, -30),
    ],
  };

  const seedTied = (standingsByPool: Record<string, Standing[]>) =>
    seedBrackets({
      competitionSlug: 'spring-open',
      sessionId: 'sess-1',
      standingsByPool,
      tiers: ['gold'],
    });

  it('orders a full tie by participant id rather than insertion order', () => {
    const forwards = seedTied(tied);
    const reversed = seedTied({
      'pool-a': [...tied['pool-a']].reverse(),
      'pool-b': [...tied['pool-b']].reverse(),
    });
    expect(reversed).toEqual(forwards);
  });

  it('produces the same bracket when the pools are declared in the other order', () => {
    const forwards = seedTied(tied);
    const swapped = seedTied({ 'pool-b': tied['pool-b'], 'pool-a': tied['pool-a'] });
    expect(swapped).toEqual(forwards);
  });

  it('separates the two tied pool winners into opposite halves', () => {
    const seeded = seedTied(tied);
    const halfOf = (id: string) => {
      const slot = quarters.find((s) => {
        const match = seeded.find((m) => m.slot === s);
        return match?.homeParticipantId === id || match?.awayParticipantId === id;
      });
      return slot === 'q1' || slot === 'q2' ? 's1' : 's2';
    };
    expect(halfOf('a1')).not.toBe(halfOf('b1'));
  });
});
