/**
 * SKIPPED — specification for `drawPools`.
 *
 * `Participant.seed` existed in the type and in the migration from the start
 * and nothing ever read it. Standings drive bracket seeding — that is H9, and
 * it does not change — but a seed is also the organizer's pre-tournament
 * ranking, and its job is the pool draw: keep the strong teams apart before
 * anybody has played. This is the function that reads it, and the first thing
 * to read MIN_TEAMS_PER_POOL, MAX_TEAMS_PER_POOL and PREFERRED_POOL_SIZES.
 *
 * Decisions this encodes, from docs/DECISIONS.md:
 *
 *   - The organizer decides the pool count. This validates it against the
 *     3-8 bounds and refuses loudly rather than quietly re-splitting a field.
 *   - Distribution is a snake: 1->A, 2->B, 3->C, 4->C, 5->B, 6->A. The top
 *     seeds land in different pools without anybody doing arithmetic.
 *   - A partially seeded field is the normal case. Seeded teams take the top
 *     positions in seed order; the rest follow by name, which is predictable
 *     without knowing when anyone registered.
 */

import { describe, expect, it } from 'vitest';
import type { Participant } from '@/lib/core';
import { MAX_TEAMS_PER_POOL, MIN_TEAMS_PER_POOL } from '@/lib/core';
import { drawPools, suggestPoolCount } from '@/lib/scheduling/pool-draw';

/** A team. `seed` is left unset unless given, which is the common case. */
function team(name: string, seed?: number): Participant {
  return {
    id: `team-${name.toLowerCase()}`,
    competitionId: 'comp-1',
    kind: 'team',
    name,
    ...(seed === undefined ? {} : { seed }),
    registeredAt: '2026-01-01T00:00:00Z',
  };
}

/** `count` pools named A, B, C... */
function emptyPools(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const name = String.fromCharCode(65 + i);
    return { id: `pool-${name.toLowerCase()}`, name };
  });
}

/** Teams seeded 1..n, named T1..Tn. */
function seededField(n: number): Participant[] {
  return Array.from({ length: n }, (_, i) => team(`T${i + 1}`, i + 1));
}

/** Which pool each team landed in, by team name. */
function placement(drawn: ReturnType<typeof drawPools>, all: Participant[]): Map<string, string> {
  const nameOf = new Map(all.map((p) => [p.id, p.name]));
  const where = new Map<string, string>();
  for (const pool of drawn) {
    for (const id of pool.participantIds) {
      const name = nameOf.get(id);
      if (name) where.set(name, pool.name);
    }
  }
  return where;
}

describe('drawPools', () => {
  it('returns one pool per pool it was given, in the same order', () => {
    const drawn = drawPools({ participants: seededField(12), pools: emptyPools(3) });
    expect(drawn.map((p) => p.name)).toEqual(['A', 'B', 'C']);
    expect(drawn.map((p) => p.id)).toEqual(['pool-a', 'pool-b', 'pool-c']);
  });

  it('places every participant exactly once', () => {
    const participants = seededField(12);
    const drawn = drawPools({ participants, pools: emptyPools(3) });
    const placed = drawn.flatMap((p) => p.participantIds);
    expect(placed).toHaveLength(12);
    expect(new Set(placed).size).toBe(12);
  });

  it('snakes the seeds across the pools and back', () => {
    const participants = seededField(12);
    const where = placement(drawPools({ participants, pools: emptyPools(3) }), participants);
    // 1->A 2->B 3->C, then back: 4->C 5->B 6->A, and so on.
    expect(where.get('T1')).toBe('A');
    expect(where.get('T2')).toBe('B');
    expect(where.get('T3')).toBe('C');
    expect(where.get('T4')).toBe('C');
    expect(where.get('T5')).toBe('B');
    expect(where.get('T6')).toBe('A');
    expect(where.get('T7')).toBe('A');
    expect(where.get('T12')).toBe('A');
  });

  it('never puts two of the top seeds in one pool', () => {
    const participants = seededField(16);
    const where = placement(drawPools({ participants, pools: emptyPools(4) }), participants);
    const topFour = ['T1', 'T2', 'T3', 'T4'].map((name) => where.get(name));
    expect(new Set(topFour).size).toBe(4);
  });

  it('gives every pool the same seed total when the field divides evenly', () => {
    const participants = seededField(12);
    const drawn = drawPools({ participants, pools: emptyPools(3) });
    const seedOf = new Map(participants.map((p) => [p.id, p.seed ?? 0]));
    const totals = drawn.map((pool) =>
      pool.participantIds.reduce((sum, id) => sum + (seedOf.get(id) ?? 0), 0),
    );
    // The property a snake exists for: 26, 26, 26.
    expect(new Set(totals).size).toBe(1);
  });

  it('splits an uneven field into pools differing by at most one', () => {
    const drawn = drawPools({ participants: seededField(14), pools: emptyPools(3) });
    const sizes = drawn.map((p) => p.participantIds.length).sort();
    expect(sizes).toEqual([4, 5, 5]);
  });

  it('orders each pool best seed first', () => {
    const participants = seededField(12);
    const drawn = drawPools({ participants, pools: emptyPools(3) });
    const seedOf = new Map(participants.map((p) => [p.id, p.seed ?? 0]));
    for (const pool of drawn) {
      const seeds = pool.participantIds.map((id) => seedOf.get(id) ?? 0);
      expect(seeds).toEqual([...seeds].sort((a, b) => a - b));
    }
  });

  describe('a partially seeded field', () => {
    // The normal case: the organizer ranks the teams they know and leaves
    // the rest blank.
    const participants = [
      team('Zephyr'),
      team('Block Party', 2),
      team('Anchor'),
      team('Spikeadelic', 1),
      team('Mango'),
      team('Dig It', 3),
    ];

    it('takes the seeded teams first, in seed order', () => {
      const where = placement(drawPools({ participants, pools: emptyPools(2) }), participants);
      expect(where.get('Spikeadelic')).toBe('A');
      expect(where.get('Block Party')).toBe('B');
      expect(where.get('Dig It')).toBe('B');
    });

    it('orders the unseeded teams by name, not by registration or input order', () => {
      const where = placement(drawPools({ participants, pools: emptyPools(2) }), participants);
      // Seeds 1-3 fill positions 1-3; Anchor, Mango, Zephyr take 4, 5, 6.
      expect(where.get('Anchor')).toBe('A');
      expect(where.get('Mango')).toBe('A');
      expect(where.get('Zephyr')).toBe('B');
    });

    it('is unaffected by the order the participants arrive in', () => {
      const forwards = drawPools({ participants, pools: emptyPools(2) });
      const backwards = drawPools({
        participants: [...participants].reverse(),
        pools: emptyPools(2),
      });
      expect(backwards).toEqual(forwards);
    });

    it('breaks a duplicated seed on name so the draw stays reproducible', () => {
      const tied = [
        team('Beta', 1),
        team('Alpha', 1),
        team('Delta', 2),
        team('Gamma', 2),
        team('Foxtrot', 3),
        team('Echo', 3),
      ];
      const drawn = drawPools({ participants: tied, pools: emptyPools(2) });
      const where = placement(drawn, tied);
      expect(where.get('Alpha')).toBe('A');
      expect(where.get('Beta')).toBe('B');
    });
  });

  describe('refuses a draw it cannot make', () => {
    it('rejects pools smaller than MIN_TEAMS_PER_POOL', () => {
      expect(() => drawPools({ participants: seededField(8), pools: emptyPools(4) })).toThrow(
        new RegExp(String(MIN_TEAMS_PER_POOL)),
      );
    });

    it('rejects pools larger than MAX_TEAMS_PER_POOL', () => {
      expect(() => drawPools({ participants: seededField(18), pools: emptyPools(2) })).toThrow(
        new RegExp(String(MAX_TEAMS_PER_POOL)),
      );
    });

    it('names the pool count and the field size so the organizer can fix it', () => {
      expect(() => drawPools({ participants: seededField(8), pools: emptyPools(4) })).toThrow(
        /8 participants.*4 pools|4 pools.*8 participants/,
      );
    });

    it('refuses a participant entered twice', () => {
      const twice = [...seededField(6), team('T1', 1)];
      expect(() => drawPools({ participants: twice, pools: emptyPools(2) })).toThrow(
        /more than once/i,
      );
    });

    it('refuses to draw into no pools at all', () => {
      expect(() => drawPools({ participants: seededField(6), pools: [] })).toThrow(/at least one/i);
    });
  });

  describe('edges', () => {
    it('returns empty pools for an empty field rather than throwing', () => {
      const drawn = drawPools({ participants: [], pools: emptyPools(2) });
      expect(drawn.map((p) => p.participantIds)).toEqual([[], []]);
    });

    it('puts everyone in one pool when that is what was asked for', () => {
      const drawn = drawPools({ participants: seededField(6), pools: emptyPools(1) });
      expect(drawn[0]?.participantIds).toHaveLength(6);
    });

    it('feeds straight into generatePoolPlay', async () => {
      const { generatePoolPlay } = await import('@/lib/scheduling/pool-play');
      const drawn = drawPools({ participants: seededField(12), pools: emptyPools(3) });
      const { matches } = generatePoolPlay({
        competitionSlug: 'spring-open',
        sessionId: 'sess-1',
        pools: drawn,
        courtIds: ['court-1', 'court-2'],
        timeslotIds: Array.from({ length: 12 }, (_, i) => `ts-${i + 1}`),
      });
      // Three pools of four: 6 matches each.
      expect(matches).toHaveLength(18);
    });

    it('is deterministic', () => {
      const participants = seededField(14);
      const input = { participants, pools: emptyPools(3) };
      expect(drawPools(input)).toEqual(drawPools(input));
    });

    it('does not mutate its input', () => {
      const participants = seededField(12);
      const input = { participants, pools: emptyPools(3) };
      const before = structuredClone(input);
      drawPools(input);
      expect(input).toEqual(before);
    });
  });

  describe('suggestPoolCount', () => {
    it('prefers pools of four over pools of six', () => {
      // PREFERRED_POOL_SIZES is [4, 5, 6]: twelve teams divides both ways.
      expect(suggestPoolCount(12)).toBe(3);
    });

    it('does not split a clean pair of fives into fours and threes', () => {
      // Three pools would give 4, 3, 3 — a size that is legal but unpreferred.
      expect(suggestPoolCount(10)).toBe(2);
    });

    it('handles a field that does not divide evenly', () => {
      expect(suggestPoolCount(14)).toBe(3); // 5, 5, 4
      expect(suggestPoolCount(16)).toBe(4); // 4, 4, 4, 4
    });

    it('falls back to the fewest legal pools when none is preferred', () => {
      expect(suggestPoolCount(7)).toBe(1); // one pool of seven
    });

    it('suggests nothing for a field too small to make a pool', () => {
      expect(suggestPoolCount(2)).toBeUndefined();
      expect(suggestPoolCount(0)).toBeUndefined();
    });

    it('always suggests a count drawPools will accept', () => {
      for (let n = 3; n <= 40; n++) {
        const count = suggestPoolCount(n);
        if (count === undefined) continue;
        expect(() =>
          drawPools({ participants: seededField(n), pools: emptyPools(count) }),
        ).not.toThrow();
      }
    });
  });
});
