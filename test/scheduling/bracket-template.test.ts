/**
 * Specification for organizer-declared bracket templates, and for
 * `bracketDrift`.
 *
 * `seedBrackets` computes the draw from records, and that is not changing —
 * H9 is a manually entered rank overriding a record that was actually
 * played, and it produced a different bracket on every re-seed. What an
 * organizer legitimately owns is the SHAPE: which finishing position meets
 * which. Red Velvet runs Q1 = A-3rd v B-2nd, Q2 = A-2nd v B-3rd,
 * Q3 = A-1st v B-4th, Q4 = B-1st v A-4th, and no amount of automatic
 * cross-seeding will produce that pattern because it is a decision about the
 * format rather than about the teams.
 *
 * The distinction the whole feature rests on: a template says "third in pool
 * A plays second in pool B". It never says which team that is. Who finished
 * third is still computed, still from the matches, still on every read.
 *
 * `bracketDrift` is the other half. Pool scores get corrected after the
 * bracket has gone up on the wall, and the organizer needs to be told the
 * draw has moved rather than discovering it when two teams turn up at the
 * same court.
 */

import { describe, expect, it } from 'vitest';
import type { Standing } from '@/lib/core';
import { playoffMatchId } from '@/lib/scheduling/match-ids';
import type { BracketTemplate, SeedingInput } from '@/lib/scheduling/seeding';
import { bracketDrift, seedBrackets } from '@/lib/scheduling/seeding';

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
    pointAdjustment: 0,
    rank,
  };
}

const poolA = [
  standing('a1', 1, 3, 30),
  standing('a2', 2, 2, 10),
  standing('a3', 3, 1, -10),
  standing('a4', 4, 0, -30),
];

const poolB = [
  standing('b1', 1, 3, 40),
  standing('b2', 2, 2, 5),
  standing('b3', 3, 1, -5),
  standing('b4', 4, 0, -40),
];

/** The Red Velvet draw, written as the sheet writes it. */
const RED_VELVET: BracketTemplate = {
  name: 'Red Velvet',
  quarters: [
    [
      { pool: 1, seed: 3 },
      { pool: 2, seed: 2 },
    ],
    [
      { pool: 1, seed: 2 },
      { pool: 2, seed: 3 },
    ],
    [
      { pool: 1, seed: 1 },
      { pool: 2, seed: 4 },
    ],
    [
      { pool: 2, seed: 1 },
      { pool: 1, seed: 4 },
    ],
  ],
};

const base: SeedingInput = {
  competitionSlug: 'red-velvet',
  sessionId: 'sess-1',
  standingsByPool: { 'pool-a': poolA, 'pool-b': poolB },
  tiers: ['gold'],
};

const templated = (template: BracketTemplate = RED_VELVET): SeedingInput => ({
  ...base,
  poolOrder: ['pool-a', 'pool-b'],
  templates: { gold: template },
});

const quarters = (input: SeedingInput) =>
  seedBrackets(input)
    .filter((m) => m.slot.startsWith('q'))
    .map((m) => [m.slot, m.homeParticipantId, m.awayParticipantId] as const);

describe('seedBrackets with a bracket template', () => {
  it('places every quarterfinal exactly where the template says', () => {
    expect(quarters(templated())).toEqual([
      ['q1', 'a3', 'b2'],
      ['q2', 'a2', 'b3'],
      ['q3', 'a1', 'b4'],
      ['q4', 'b1', 'a4'],
    ]);
  });

  it('still emits the downstream slots empty', () => {
    // Unchanged from the automatic path. A semifinal is not knowable until
    // the quarterfinals feeding it resolve, and `advanceBracket` fills it.
    const seeded = seedBrackets(templated());
    for (const slot of ['s1', 's2', 'final', 'consolation'] as const) {
      const match = seeded.find((m) => m.slot === slot);
      expect(match?.homeParticipantId).toBeNull();
      expect(match?.awayParticipantId).toBeNull();
    }
  });

  it('mints ids through the canonical helper, same as the automatic path', () => {
    const seeded = seedBrackets(templated());
    expect(seeded.find((m) => m.slot === 'q1')?.matchId).toBe(
      playoffMatchId('red-velvet', 'gold', 'q1'),
    );
  });

  it('reads finishing position off the standings, never off a stored rank', () => {
    // The template asks for "third in pool A". If pool A's results change so
    // that a different team is third, the template puts THAT team in q1 — no
    // edit to the template, no manual re-entry. This is the property that
    // keeps a declared shape on the right side of H9.
    const reordered = [
      standing('a4', 1, 3, 30),
      standing('a1', 2, 2, 10),
      standing('a2', 3, 1, -10),
      standing('a3', 4, 0, -30),
    ];
    const result = quarters({
      ...templated(),
      standingsByPool: { 'pool-a': reordered, 'pool-b': poolB },
    });
    expect(result[0]).toEqual(['q1', 'a2', 'b2']);
    expect(result[2]).toEqual(['q3', 'a4', 'b4']);
  });

  it('takes the pool table in the order it was given, head-to-head included', () => {
    // `computeStandings` applies head-to-head before the differentials, so a
    // team can finish above another it is behind on points. "Second in pool
    // A" means the second row of the table the organizer is looking at, and
    // re-deriving the order here would quietly disagree with it.
    const headToHead = [
      standing('a2', 1, 2, -5),
      standing('a1', 2, 2, 40),
      standing('a3', 3, 1, -10),
      standing('a4', 4, 0, -30),
    ];
    const result = quarters({
      ...templated(),
      standingsByPool: { 'pool-a': headToHead, 'pool-b': poolB },
    });
    expect(result[2]).toEqual(['q3', 'a2', 'b4']);
  });

  it('does not second-guess the shape the organizer declared', () => {
    // Automatic seeding avoids same-pool quarterfinals by swapping pairings.
    // A declared template is not improved on: a swap the organizer did not
    // ask for is a second seeder disagreeing with the first, which is H8.
    const samePool: BracketTemplate = {
      quarters: [
        [
          { pool: 1, seed: 1 },
          { pool: 1, seed: 2 },
        ],
        [
          { pool: 1, seed: 3 },
          { pool: 1, seed: 4 },
        ],
        [
          { pool: 2, seed: 1 },
          { pool: 2, seed: 2 },
        ],
        [
          { pool: 2, seed: 3 },
          { pool: 2, seed: 4 },
        ],
      ],
    };
    expect(quarters(templated(samePool))).toEqual([
      ['q1', 'a1', 'a2'],
      ['q2', 'a3', 'a4'],
      ['q3', 'b1', 'b2'],
      ['q4', 'b3', 'b4'],
    ]);
  });

  it('is deterministic', () => {
    expect(seedBrackets(templated())).toEqual(seedBrackets(templated()));
  });

  it('does not mutate the input', () => {
    const input = templated();
    const before = JSON.parse(JSON.stringify(input));
    seedBrackets(input);
    expect(JSON.parse(JSON.stringify(input))).toEqual(before);
  });

  it('leaves the automatic path exactly as it was when no template is given', () => {
    expect(seedBrackets(base)).toEqual(seedBrackets({ ...base, poolOrder: ['pool-a', 'pool-b'] }));
  });

  it('templates a second tier independently', () => {
    const twelve = {
      ...base,
      tiers: ['gold', 'silver'],
      poolOrder: ['pool-a', 'pool-b'],
      standingsByPool: {
        'pool-a': [...poolA, standing('a5', 5, 0, -50), standing('a6', 6, 0, -60)],
        'pool-b': [...poolB, standing('b5', 5, 0, -55), standing('b6', 6, 0, -65)],
      },
      templates: {
        gold: RED_VELVET,
        silver: {
          quarters: [
            [
              { pool: 1, seed: 5 },
              { pool: 2, seed: 6 },
            ],
            [
              { pool: 1, seed: 6 },
              { pool: 2, seed: 5 },
            ],
          ],
        },
      },
    } satisfies SeedingInput;

    const seeded = seedBrackets(twelve);
    const silver = seeded.filter((m) => m.tier === 'silver' && m.slot.startsWith('q'));
    expect(silver.map((m) => [m.slot, m.homeParticipantId, m.awayParticipantId])).toEqual([
      ['q1', 'a5', 'b6'],
      ['q2', 'a6', 'b5'],
      // A template shorter than four quarterfinals leaves the rest empty
      // rather than inventing pairings for a field that has run out.
      ['q3', null, null],
      ['q4', null, null],
    ]);
  });
});

describe('seedBrackets refuses a template it cannot honour', () => {
  it('when a tier in the draw has no template but another does', () => {
    // Half-declared is the dangerous state: the templated tier and the
    // automatic tier would each allocate from the whole field and could put
    // one team in two brackets. Either the organizer describes the draw or
    // the engine does.
    expect(() => seedBrackets({ ...templated(), tiers: ['gold', 'silver'] })).toThrow(/silver/i);
  });

  it('when the pool order is missing', () => {
    // A template says "pool 1". Without a declared order that resolves off
    // object key order, which is not something a bracket should depend on.
    expect(() => seedBrackets({ ...base, templates: { gold: RED_VELVET } })).toThrow(/poolOrder/);
  });

  it('when the pool order names a pool with no standings', () => {
    expect(() => seedBrackets({ ...templated(), poolOrder: ['pool-a', 'pool-c'] })).toThrow(
      /pool-c/,
    );
  });

  it('when it references a pool position that does not exist', () => {
    const outOfRange: BracketTemplate = {
      quarters: [
        [
          { pool: 3, seed: 1 },
          { pool: 1, seed: 1 },
        ],
      ],
    };
    expect(() => seedBrackets(templated(outOfRange))).toThrow(/pool 3/i);
  });

  it('when it references a finishing position the pool does not have', () => {
    const tooDeep: BracketTemplate = {
      quarters: [
        [
          { pool: 1, seed: 9 },
          { pool: 2, seed: 1 },
        ],
      ],
    };
    // Silently leaving this side empty would hand somebody a bye the
    // organizer never drew.
    expect(() => seedBrackets(templated(tooDeep))).toThrow(/9/);
  });

  it('when the same team is drawn into two quarterfinals', () => {
    const twice: BracketTemplate = {
      quarters: [
        [
          { pool: 1, seed: 1 },
          { pool: 2, seed: 1 },
        ],
        [
          { pool: 1, seed: 1 },
          { pool: 2, seed: 2 },
        ],
      ],
    };
    expect(() => seedBrackets(templated(twice))).toThrow(/a1/);
  });

  it('when a team is drawn into two different tiers', () => {
    expect(() =>
      seedBrackets({
        ...base,
        tiers: ['gold', 'silver'],
        poolOrder: ['pool-a', 'pool-b'],
        templates: { gold: RED_VELVET, silver: RED_VELVET },
      }),
    ).toThrow(/two tiers|both/i);
  });

  it('when a template declares more quarterfinals than a bracket has', () => {
    const five: BracketTemplate = {
      quarters: [
        ...RED_VELVET.quarters,
        [
          { pool: 1, seed: 1 },
          { pool: 2, seed: 1 },
        ],
      ],
    };
    expect(() => seedBrackets(templated(five))).toThrow(/four|4/i);
  });

  it('when a template has no quarterfinals at all', () => {
    expect(() => seedBrackets(templated({ quarters: [] }))).toThrow(/at least one/i);
  });
});

describe('bracketDrift', () => {
  /**
   * Pool scores get corrected after the bracket has gone up on the wall. The
   * organizer is allowed to do that — refusing the edit would be worse — but
   * they have to be told the draw underneath it has moved.
   */
  it('reports nothing when the standings still produce the same draw', () => {
    const seeded = seedBrackets(templated());
    expect(bracketDrift({ seeded, current: templated() })).toEqual([]);
  });

  it('reports the slots a corrected pool result moved', () => {
    const seeded = seedBrackets(templated());

    // a2 and a3 swap places in pool A.
    const corrected: SeedingInput = {
      ...templated(),
      standingsByPool: {
        'pool-a': [
          standing('a1', 1, 3, 30),
          standing('a3', 2, 2, 10),
          standing('a2', 3, 1, -10),
          standing('a4', 4, 0, -30),
        ],
        'pool-b': poolB,
      },
    };

    const drift = bracketDrift({ seeded, current: corrected });
    expect(drift.map((d) => d.slot)).toEqual(['q1', 'q2']);
    expect(drift[0]).toMatchObject({
      tier: 'gold',
      slot: 'q1',
      seededHome: 'a3',
      currentHome: 'a2',
      seededAway: 'b2',
      currentAway: 'b2',
    });
    expect(drift[0]?.matchId).toBe(playoffMatchId('red-velvet', 'gold', 'q1'));
  });

  it('reports a pairing that only swapped sides', () => {
    // Same two teams, different home side. That is a different match card,
    // a different court assignment and a different scoresheet, so it is
    // drift rather than a cosmetic difference.
    const flipped: BracketTemplate = {
      quarters: [
        [
          { pool: 2, seed: 2 },
          { pool: 1, seed: 3 },
        ],
        ...RED_VELVET.quarters.slice(1),
      ],
    };
    const drift = bracketDrift({
      seeded: seedBrackets(templated()),
      current: templated(flipped),
    });
    expect(drift.map((d) => d.slot)).toEqual(['q1']);
  });

  it('works on the automatic path as well as the templated one', () => {
    const seeded = seedBrackets(base);
    const corrected: SeedingInput = {
      ...base,
      standingsByPool: {
        'pool-a': poolA,
        'pool-b': [
          standing('b4', 1, 3, 90),
          standing('b1', 2, 3, 40),
          standing('b2', 3, 2, 5),
          standing('b3', 4, 1, -5),
        ],
      },
    };
    expect(bracketDrift({ seeded, current: corrected }).length).toBeGreaterThan(0);
  });

  it('never reports a downstream slot as drifted', () => {
    // s1, s2, final and consolation are always seeded empty and filled by
    // `advanceBracket`. Reporting them would make every correction look like
    // it moved the final.
    const drift = bracketDrift({
      seeded: seedBrackets(templated()),
      current: templated({
        quarters: [...RED_VELVET.quarters].reverse(),
      }),
    });
    for (const slot of drift) expect(slot.slot.startsWith('q')).toBe(true);
  });

  it('reports a tier that has stopped being drawn at all', () => {
    const seeded = seedBrackets(base);
    const drift = bracketDrift({
      seeded,
      current: { ...base, standingsByPool: {} },
    });
    expect(drift.length).toBeGreaterThan(0);
    for (const slot of drift) {
      expect(slot.currentHome).toBeNull();
      expect(slot.currentAway).toBeNull();
    }
  });

  it('is deterministic and does not mutate its input', () => {
    const seeded = seedBrackets(templated());
    const current = templated();
    const before = JSON.parse(JSON.stringify({ seeded, current }));
    const once = bracketDrift({ seeded, current });
    const twice = bracketDrift({ seeded, current });
    expect(twice).toEqual(once);
    expect(JSON.parse(JSON.stringify({ seeded, current }))).toEqual(before);
  });
});
