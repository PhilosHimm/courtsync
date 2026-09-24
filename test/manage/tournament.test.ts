/**
 * Specification for `src/lib/manage/tournament.ts`.
 *
 * The last of the three format modules to be specified, and the one that
 * runs the whole day: draw, schedule, referee, rank, seed, advance. It
 * mirrors the demo step for step, with the difference that makes it the
 * product — the results come from what the organizer typed in, so how far
 * the day has got *is* which results exist. There is no stage knob.
 *
 * What these assertions are protecting:
 *
 * - Nothing derived is stored (rule 1, H9). Pool standings and the whole
 *   bracket are recomputed on every read, which is exactly what makes a
 *   corrected quarterfinal reshape the rounds after it instead of leaving a
 *   stale champion on screen.
 * - Seeding reads records, never the entry list (H8). The organizer's typing
 *   order seeds the *draw*; the bracket is seeded by what teams did.
 * - A tied playoff scoreline never reaches `advanceBracket` (H15). Entry
 *   validation refuses one, and this module refuses it again in case the
 *   store was hand-edited.
 * - The same stored record rebuilds the identical day every time (rule 9),
 *   which is the property that lets the schedule stay unstored at all.
 *
 * Every assertion describes behaviour the module already has.
 */

import { describe, expect, it } from 'vitest';
import type { Match } from '@/lib/core';
import { BRACKET_TIERS, MAX_TEAMS_PER_POOL, MIN_TEAMS_PER_POOL } from '@/lib/core';
import {
  buildTournamentView,
  createTournament,
  nearestPoolCount,
  type TournamentSetup,
  validPoolCounts,
} from '@/lib/manage/tournament';
import type { StoredResults, StoredTournament } from '@/lib/storage';
import { STORAGE_SCHEMA_VERSION } from '@/lib/storage';

const T0 = '2026-08-20T12:00:00.000Z';

function teams(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `team-${i + 1}`,
    name: `Team ${i + 1}`,
  }));
}

function setup(overrides: Partial<TournamentSetup> = {}): TournamentSetup {
  return {
    name: 'Fall Classic',
    playDate: '2026-10-10',
    startTime: '09:00',
    gameDurationMin: 40,
    bufferMin: 10,
    courtNames: ['Court 1', 'Court 2'],
    slots: 12,
    restSlots: 0,
    poolCount: 2,
    tiers: 1,
    splitByPoints: true,
    teams: teams(8),
    ...overrides,
  };
}

function tournament(overrides: Partial<TournamentSetup> = {}): StoredTournament {
  return createTournament(setup(overrides), 'tn-0001', T0);
}

/** Record a straight-sets home win for every pool match, so the pools finish. */
function finishPools(stored: StoredTournament): StoredTournament {
  const results: StoredResults = {};
  for (const match of buildTournamentView(stored).poolMatches) {
    results[match.id] = {
      matchId: match.id,
      homeParticipantId: match.homeParticipantId!,
      awayParticipantId: match.awayParticipantId!,
      sets: [
        { home: 25, away: 20 },
        { home: 25, away: 18 },
      ],
      recordedAt: '2026-10-10T10:00:00.000Z',
    };
  }
  return { ...stored, results };
}

/** Record a result on one bracket match, home winning in straight sets. */
function winFor(stored: StoredTournament, match: Match, side: 'home' | 'away'): StoredTournament {
  const sets =
    side === 'home'
      ? [
          { home: 25, away: 20 },
          { home: 25, away: 19 },
        ]
      : [
          { home: 20, away: 25 },
          { home: 19, away: 25 },
        ];
  return {
    ...stored,
    results: {
      ...stored.results,
      [match.id]: {
        matchId: match.id,
        homeParticipantId: match.homeParticipantId!,
        awayParticipantId: match.awayParticipantId!,
        sets,
        recordedAt: '2026-10-10T14:00:00.000Z',
      },
    },
  };
}

describe('validPoolCounts', () => {
  it('accepts only counts that keep every pool within the engine’s limits', () => {
    // Eight teams: one pool of 8, or two of 4. Three pools would be 3/3/2 and
    // a pool of 2 is below the minimum.
    expect(validPoolCounts(8)).toEqual([1, 2]);
  });

  it('rejects a field too small for a single legal pool', () => {
    expect(validPoolCounts(MIN_TEAMS_PER_POOL - 1)).toEqual([]);
  });

  it('rejects a field too large for one pool, offering the splits instead', () => {
    const counts = validPoolCounts(MAX_TEAMS_PER_POOL + 1);

    expect(counts).not.toContain(1);
    expect(counts.length).toBeGreaterThan(0);
  });

  it('every count it offers divides the field into legal pools', () => {
    for (let fieldSize = MIN_TEAMS_PER_POOL; fieldSize <= 24; fieldSize++) {
      for (const count of validPoolCounts(fieldSize)) {
        expect(Math.ceil(fieldSize / count)).toBeLessThanOrEqual(MAX_TEAMS_PER_POOL);
        expect(Math.floor(fieldSize / count)).toBeGreaterThanOrEqual(MIN_TEAMS_PER_POOL);
      }
    }
  });
});

describe('nearestPoolCount', () => {
  it('keeps a legal request as it is', () => {
    expect(nearestPoolCount(8, 2)).toBe(2);
  });

  it('moves an illegal request to the closest legal count', () => {
    // Three pools of eight teams is illegal; two is the nearest.
    expect(nearestPoolCount(8, 3)).toBe(2);
    expect(nearestPoolCount(8, 9)).toBe(2);
  });

  it('breaks a tie towards the smaller count', () => {
    // Fewer, fuller pools over more, thinner ones.
    expect(nearestPoolCount(12, 2)).toBe(2);
    expect(validPoolCounts(12)).toContain(3);
  });

  it('falls back to one pool when no count is legal', () => {
    expect(nearestPoolCount(2, 4)).toBe(1);
  });
});

describe('createTournament', () => {
  it('stamps the schema version and the caller-supplied id and clock', () => {
    const stored = createTournament(setup(), 'tn-0001', T0);

    expect(stored.id).toBe('tn-0001');
    expect(stored.schemaVersion).toBe(STORAGE_SCHEMA_VERSION);
    expect(stored.createdAt).toBe(T0);
    expect(stored.updatedAt).toBe(T0);
    expect(stored.results).toEqual({});
  });

  it('takes the id and the timestamp from the caller rather than a clock', () => {
    expect(createTournament(setup(), 'tn-0001', T0)).toEqual(
      createTournament(setup(), 'tn-0001', T0),
    );
  });

  it('does not mutate the setup it was given (rule 10)', () => {
    const input = setup();
    const before = structuredClone(input);
    createTournament(input, 'tn-0001', T0);

    expect(input).toEqual(before);
  });
});

describe('buildTournamentView — the day', () => {
  it('derives the slug from the record id, not the name', () => {
    const renamed: StoredTournament = { ...tournament(), name: 'Renamed Cup' };

    expect(buildTournamentView(tournament()).slug).toBe(buildTournamentView(renamed).slug);
  });

  it('ends the day a full grid after it starts', () => {
    // 12 slots of 40 + 10 = 600 minutes from 09:00.
    const view = buildTournamentView(tournament({ slots: 12, gameDurationMin: 40, bufferMin: 10 }));

    expect(view.session.startTime).toBe('09:00');
    expect(view.session.endTime).toBe('19:00');
    expect(view.timeslots).toHaveLength(12);
  });

  it('names courts, falling back for a blank name', () => {
    const view = buildTournamentView(tournament({ courtNames: ['Show Court', '  '] }));

    expect(view.courts.map((c) => c.name)).toEqual(['Show Court', 'Court 2']);
  });

  it('seeds the draw from the order the organizer typed the teams in', () => {
    const view = buildTournamentView(tournament());

    expect(view.participants.map((p) => p.seed)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(view.participants.every((p) => p.kind === 'team')).toBe(true);
  });

  it('coerces an illegal pool count to the nearest legal one', () => {
    const view = buildTournamentView(tournament({ poolCount: 3, teams: teams(8) }));

    expect(view.pools).toHaveLength(2);
    expect(view.problem).toBeNull();
  });

  it('puts every team in exactly one pool', () => {
    const view = buildTournamentView(tournament({ teams: teams(8), poolCount: 2 }));
    const drawn = view.pools.flatMap((p) => p.participantIds);

    expect(drawn).toHaveLength(8);
    expect(new Set(drawn).size).toBe(8);
  });
});

describe('buildTournamentView — refusals', () => {
  it('refuses a field too small to make a pool, and says how many more are needed', () => {
    const view = buildTournamentView(tournament({ teams: teams(1) }));

    expect(view.problem).toBe(
      `A tournament needs at least ${MIN_TEAMS_PER_POOL} teams — add ${
        MIN_TEAMS_PER_POOL - 1
      } more in setup.`,
    );
    expect(view.poolMatches).toEqual([]);
    expect(view.brackets).toEqual([]);
  });

  it('refuses a day with no courts', () => {
    const view = buildTournamentView(tournament({ courtNames: [] }));

    expect(view.problem).toBe('Add at least one court in setup.');
  });

  it('still returns the skeleton when it refuses, so setup can render', () => {
    const view = buildTournamentView(tournament({ teams: teams(2) }));

    expect(view.slug).toBeTruthy();
    expect(view.timeslots).toHaveLength(12);
    expect(view.participants).toHaveLength(2);
    expect(view.nameOf).toEqual({ 'team-1': 'Team 1', 'team-2': 'Team 2' });
  });

  it('a buildable day has no problem', () => {
    expect(buildTournamentView(tournament()).problem).toBeNull();
  });
});

describe('buildTournamentView — pool play', () => {
  it('schedules a round-robin inside each pool', () => {
    // Two pools of four: six matches each.
    const view = buildTournamentView(tournament({ teams: teams(8), poolCount: 2 }));

    expect(view.poolMatches).toHaveLength(12);
    for (const pool of view.pools) {
      expect(view.poolMatches.filter((m) => m.poolId === pool.id)).toHaveLength(6);
    }
  });

  it('reports matches the grid had no room for rather than dropping them', () => {
    // One court and two slots against twelve matches: the day does not fit.
    // The matches still exist; the organizer needs to see that, not lose them.
    const view = buildTournamentView(tournament({ slots: 2, courtNames: ['Court 1'] }));

    expect(view.problem).toBeNull();
    expect(view.poolMatches).toHaveLength(12);
    expect(view.unassignedMatchIds.length).toBeGreaterThan(0);
  });

  it('never gives a match a referee who is playing in it', () => {
    const view = buildTournamentView(tournament());

    for (const match of view.poolMatches) {
      if (!match.refParticipantId) continue;
      expect(match.refParticipantId).not.toBe(match.homeParticipantId);
      expect(match.refParticipantId).not.toBe(match.awayParticipantId);
    }
  });

  it('counts played matches and gates completion on all of them', () => {
    const empty = buildTournamentView(tournament());
    expect(empty.playedCount).toBe(0);
    expect(empty.poolsComplete).toBe(false);

    const done = buildTournamentView(finishPools(tournament()));
    expect(done.playedCount).toBe(done.poolMatches.length);
    expect(done.poolsComplete).toBe(true);
  });

  it('computes a table per pool rather than storing one (rule 1)', () => {
    const view = buildTournamentView(finishPools(tournament()));

    expect(Object.keys(view.standingsByPool).sort()).toEqual(view.pools.map((p) => p.id).sort());
    for (const pool of view.pools) {
      const table = view.standingsByPool[pool.id]!;
      expect(table).toHaveLength(pool.participantIds.length);
      expect(table.map((row) => row.rank)).toEqual(
        Array.from({ length: table.length }, (_, i) => i + 1),
      );
    }
  });

  it('ranks a pool on its own matches only', () => {
    const view = buildTournamentView(finishPools(tournament()));

    for (const pool of view.pools) {
      const ids = new Set(pool.participantIds);
      for (const row of view.standingsByPool[pool.id]!) {
        expect(ids.has(row.participantId)).toBe(true);
      }
    }
  });
});

describe('buildTournamentView — the bracket', () => {
  it('draws nothing until every pool match has a result', () => {
    expect(buildTournamentView(tournament()).brackets).toEqual([]);

    const partial = tournament();
    const first = buildTournamentView(partial).poolMatches[0]!;
    const oneResult = winFor(partial, first, 'home');

    expect(buildTournamentView(oneResult).poolsComplete).toBe(false);
    expect(buildTournamentView(oneResult).brackets).toEqual([]);
  });

  it('seeds from pool records, not from the entry list (H8)', () => {
    // Same teams in the same typing order, different results. If seeding read
    // the entry list the two brackets would open identically; because it
    // reads records, they do not. H8 was a bracket seeded off the roster
    // while the table said something else.
    const base = tournament();
    const homeWins = finishPools(base);

    const awayWins: StoredTournament = {
      ...base,
      results: Object.fromEntries(
        buildTournamentView(base).poolMatches.map((match) => [
          match.id,
          {
            matchId: match.id,
            homeParticipantId: match.homeParticipantId!,
            awayParticipantId: match.awayParticipantId!,
            sets: [
              { home: 20, away: 25 },
              { home: 18, away: 25 },
            ],
            recordedAt: '2026-10-10T10:00:00.000Z',
          },
        ]),
      ),
    };

    const pairingsOf = (stored: StoredTournament) =>
      buildTournamentView(stored)
        .brackets[0]!.matches.filter((m) => m.roundLabel!.startsWith('q'))
        .map((m) => `${m.homeParticipantId}v${m.awayParticipantId}`);

    expect(pairingsOf(homeWins)).toHaveLength(4);
    expect(pairingsOf(homeWins)).not.toEqual(pairingsOf(awayWins));
  });

  it('draws all eight slots of a tier', () => {
    const view = buildTournamentView(finishPools(tournament()));

    expect(view.brackets[0]!.matches).toHaveLength(8);
    expect(view.brackets[0]!.matches.map((m) => m.roundLabel)).toEqual([
      'q1',
      'q2',
      'q3',
      'q4',
      's1',
      's2',
      'final',
      'consolation',
    ]);
  });

  it('clamps the tier count to what the engine offers', () => {
    const many = buildTournamentView(finishPools(tournament({ tiers: 99 })));
    const none = buildTournamentView(finishPools(tournament({ tiers: 0 })));

    expect(many.brackets.length).toBeLessThanOrEqual(BRACKET_TIERS.length);
    expect(none.brackets.length).toBeGreaterThanOrEqual(1);
  });

  it('skips a tier the field cannot fill rather than drawing it empty', () => {
    // Eight teams fill gold and nothing else; asking for three tiers must not
    // produce two brackets full of blank slots.
    const view = buildTournamentView(finishPools(tournament({ teams: teams(8), tiers: 3 })));

    expect(view.brackets.map((b) => b.tier)).toEqual(['gold']);
    for (const bracket of view.brackets) {
      expect(bracket.matches.length).toBeGreaterThan(0);
    }
  });

  it('has no champion until the final is played', () => {
    const view = buildTournamentView(finishPools(tournament()));

    expect(view.brackets[0]!.champion).toBeNull();
  });

  it('names the champion once the final is decided', () => {
    let stored = finishPools(tournament());
    // Walk the bracket down: quarters, then semis, then the final.
    for (const round of [['q1', 'q2', 'q3', 'q4'], ['s1', 's2'], ['final']]) {
      const bracket = buildTournamentView(stored).brackets[0]!;
      for (const slot of round) {
        const match = bracket.matches.find((m) => m.roundLabel === slot);
        if (match?.homeParticipantId && match.awayParticipantId) {
          stored = winFor(stored, match, 'home');
        }
      }
    }

    const view = buildTournamentView(stored);
    const final = view.brackets[0]!.matches.find((m) => m.roundLabel === 'final')!;

    expect(final.status).toBe('final');
    expect(view.brackets[0]!.champion).not.toBeNull();
    expect(view.brackets[0]!.champion!.id).toBe(final.homeParticipantId);
  });

  it('reshapes the rounds after a corrected quarterfinal', () => {
    // The whole reason the bracket is recomputed rather than stored: fixing a
    // score the organizer typed wrong has to move whoever advanced from it.
    let stored = finishPools(tournament());
    const quarters = buildTournamentView(stored).brackets[0]!.matches.filter((m) =>
      m.roundLabel!.startsWith('q'),
    );
    for (const q of quarters) stored = winFor(stored, q, 'home');

    const advancedHome = buildTournamentView(stored)
      .brackets[0]!.matches.filter((m) => m.roundLabel!.startsWith('s'))
      .flatMap((m) => [m.homeParticipantId, m.awayParticipantId]);

    // Correct the first quarterfinal the other way round.
    const corrected = winFor(stored, quarters[0]!, 'away');
    const advancedAfter = buildTournamentView(corrected)
      .brackets[0]!.matches.filter((m) => m.roundLabel!.startsWith('s'))
      .flatMap((m) => [m.homeParticipantId, m.awayParticipantId]);

    expect(advancedAfter).not.toEqual(advancedHome);
    expect(advancedAfter).toContain(quarters[0]!.awayParticipantId);
    expect(advancedAfter).not.toContain(quarters[0]!.homeParticipantId);
  });

  it('ignores a tied playoff scoreline instead of advancing on it (H15)', () => {
    // Entry validation already refuses this. The guard here is for a store
    // that was hand-edited — a level elimination match has no winner to
    // advance, and `advanceBracket` must never be asked to find one.
    let stored = finishPools(tournament());
    const quarter = buildTournamentView(stored).brackets[0]!.matches.find(
      (m) => m.roundLabel === 'q1',
    )!;
    stored = {
      ...stored,
      results: {
        ...stored.results,
        [quarter.id]: {
          matchId: quarter.id,
          homeParticipantId: quarter.homeParticipantId!,
          awayParticipantId: quarter.awayParticipantId!,
          sets: [
            { home: 25, away: 20 },
            { home: 18, away: 25 },
          ],
          recordedAt: '2026-10-10T14:00:00.000Z',
        },
      },
    };

    const view = buildTournamentView(stored);
    const q1 = view.brackets[0]!.matches.find((m) => m.roundLabel === 'q1')!;
    const semis = view.brackets[0]!.matches.filter((m) => m.roundLabel!.startsWith('s'));

    expect(q1.status).not.toBe('final');
    const advanced = semis.flatMap((m) => [m.homeParticipantId, m.awayParticipantId]);
    expect(advanced).not.toContain(q1.homeParticipantId);
    expect(advanced).not.toContain(q1.awayParticipantId);
  });
});

describe('buildTournamentView — purity', () => {
  it('is deterministic: the same stored day rebuilds identically (rule 9)', () => {
    const stored = finishPools(tournament());
    expect(buildTournamentView(stored)).toEqual(buildTournamentView(stored));
  });

  it('does not mutate the stored day it reads (rule 10)', () => {
    const stored = finishPools(tournament());
    const before = structuredClone(stored);
    buildTournamentView(stored);

    expect(stored).toEqual(before);
  });

  it('hands back the stored record it was given', () => {
    const stored = tournament();
    expect(buildTournamentView(stored).stored).toBe(stored);
  });
});
