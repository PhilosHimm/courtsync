/**
 * Specification for `src/lib/manage/league.ts`.
 *
 * A league is the format where the same grid is rebuilt fifty-two times. The
 * convener enters a result on week three, edits the team list on week four,
 * and every week's fixtures are regenerated underneath the scores already
 * recorded — so the properties that matter here are the ones that keep a
 * season stable across those rebuilds.
 *
 * Three of them carry audit findings:
 *
 * - The table is `computeStandings` over the fixtures, never a stored column
 *   (rule 1, H9). There is no season table to drift.
 * - The slug that mints every match id comes from the immutable record id,
 *   never the league's name (rule 3, C3). Renaming a league must not orphan
 *   its results.
 * - Each week gets its own independent timeslot grid, which is what lets a
 *   season be a series of sessions rather than one long day.
 *
 * Every assertion below describes behaviour the module already has.
 */

import { describe, expect, it } from 'vitest';
import { buildLeagueView, createLeague, type LeagueSetup } from '@/lib/manage/league';
import type { StoredLeague, StoredResult } from '@/lib/storage';
import { STORAGE_SCHEMA_VERSION } from '@/lib/storage';

function setup(overrides: Partial<LeagueSetup> = {}): LeagueSetup {
  return {
    name: 'Tuesday Night Six',
    startDate: '2026-09-01',
    startTime: '19:00',
    weeks: 4,
    gameDurationMin: 45,
    bufferMin: 15,
    courtNames: ['Court 1', 'Court 2'],
    slotsPerWeek: 2,
    legs: 1,
    splitByPoints: true,
    teams: [
      { id: 'team-a', name: 'Aces' },
      { id: 'team-b', name: 'Blockers' },
      { id: 'team-c', name: 'Cutters' },
      { id: 'team-d', name: 'Diggers' },
    ],
    ...overrides,
  };
}

function league(overrides: Partial<LeagueSetup> = {}): StoredLeague {
  return createLeague(setup(overrides), 'lg-0001', '2026-08-20T12:00:00.000Z');
}

function resultFor(
  matchId: string,
  home: string,
  away: string,
  sets: Array<[number, number]>,
): StoredResult {
  return {
    matchId,
    homeParticipantId: home,
    awayParticipantId: away,
    sets: sets.map(([h, a]) => ({ home: h, away: a })),
    recordedAt: '2026-09-01T20:00:00.000Z',
  };
}

describe('createLeague', () => {
  it('stamps the schema version and the caller-supplied id and clock', () => {
    const stored = createLeague(setup(), 'lg-0001', '2026-08-20T12:00:00.000Z');

    expect(stored.id).toBe('lg-0001');
    expect(stored.schemaVersion).toBe(STORAGE_SCHEMA_VERSION);
    expect(stored.createdAt).toBe('2026-08-20T12:00:00.000Z');
    expect(stored.updatedAt).toBe('2026-08-20T12:00:00.000Z');
  });

  it('takes the id and the timestamp from the caller rather than a clock', () => {
    // Asserted rather than assumed: a `Date.now()` or a generated id in here
    // would make two calls with the same setup disagree, and rule 9 forbids
    // exactly that. The caller owns both.
    const a = createLeague(setup(), 'lg-0001', '2026-08-20T12:00:00.000Z');
    const b = createLeague(setup(), 'lg-0001', '2026-08-20T12:00:00.000Z');

    expect(a).toEqual(b);
  });

  it('starts with no results', () => {
    expect(createLeague(setup(), 'lg-0001', '2026-08-20T12:00:00.000Z').results).toEqual({});
  });

  it('carries the setup through unchanged', () => {
    const input = setup({ weeks: 10, legs: 2, venueName: 'Eastside Gym' });
    const stored = createLeague(input, 'lg-0001', '2026-08-20T12:00:00.000Z');

    expect(stored.weeks).toBe(10);
    expect(stored.legs).toBe(2);
    expect(stored.venueName).toBe('Eastside Gym');
    expect(stored.teams).toEqual(input.teams);
  });

  it('does not mutate the setup it was given (rule 10)', () => {
    const input = setup();
    const before = structuredClone(input);
    createLeague(input, 'lg-0001', '2026-08-20T12:00:00.000Z');

    expect(input).toEqual(before);
  });
});

describe('buildLeagueView — the season skeleton', () => {
  it('derives the slug from the record id, not the name', () => {
    // C3. Match ids are minted from this slug, so a rename that changed it
    // would detach every result the convener has entered.
    const renamed: StoredLeague = { ...league(), name: 'Totally Different Name' };

    expect(buildLeagueView(league()).slug).toBe(buildLeagueView(renamed).slug);
  });

  it('renaming a league keeps its fixtures and their recorded results', () => {
    const base = league();
    const first = buildLeagueView(base).fixtures[0]!;
    const stored: StoredLeague = {
      ...base,
      name: 'Renamed Mid-Season',
      results: {
        [first.id]: resultFor(first.id, first.homeParticipantId!, first.awayParticipantId!, [
          [25, 20],
          [25, 18],
        ]),
      },
    };

    const view = buildLeagueView(stored);
    expect(view.fixtures[0]!.id).toBe(first.id);
    expect(view.fixtures[0]!.status).toBe('final');
    expect(view.playedCount).toBe(1);
  });

  it('builds one session per week, seven days apart, sequenced from one', () => {
    const view = buildLeagueView(league({ weeks: 3, startDate: '2026-09-29' }));

    expect(view.sessions).toHaveLength(3);
    expect(view.sessions.map((s) => s.playDate)).toEqual([
      '2026-09-29',
      '2026-10-06',
      '2026-10-13',
    ]);
    expect(view.sessions.map((s) => s.sequence)).toEqual([1, 2, 3]);
    expect(view.sessions.map((s) => s.name)).toEqual(['Week 1', 'Week 2', 'Week 3']);
  });

  it('ends each week a full grid after it starts', () => {
    // 2 slots of 45 + 15 = 120 minutes from 19:00.
    const view = buildLeagueView(league({ slotsPerWeek: 2, gameDurationMin: 45, bufferMin: 15 }));

    expect(view.sessions[0]!.startTime).toBe('19:00');
    expect(view.sessions[0]!.endTime).toBe('21:00');
  });

  it('gives every week its own independent timeslot grid', () => {
    // The domain model hangs timeslots off a session precisely so week two's
    // grid is not week one's. Same shape, different ids, each on its own date.
    const view = buildLeagueView(league({ weeks: 2, slotsPerWeek: 2 }));
    const [wk1, wk2] = view.sessions.map((s) => view.timeslotsBySession[s.id]!);

    expect(wk1).toHaveLength(2);
    expect(wk2).toHaveLength(2);
    expect(new Set([...wk1!, ...wk2!].map((t) => t.id)).size).toBe(4);
    expect(wk1![0]!.startAt.startsWith('2026-09-01')).toBe(true);
    expect(wk2![0]!.startAt.startsWith('2026-09-08')).toBe(true);
  });

  it('names courts, falling back for a blank name', () => {
    const view = buildLeagueView(league({ courtNames: ['Main', '  ', 'Far End'] }));

    expect(view.courts.map((c) => c.name)).toEqual(['Main', 'Court 2', 'Far End']);
    expect(view.courts.every((c) => c.isActive)).toBe(true);
  });

  it('turns teams into seeded participants in list order', () => {
    // List order is seeding order; the storage types say so and the view has
    // to honour it or the convener's ordering means nothing.
    const view = buildLeagueView(league());

    expect(view.participants.map((p) => p.seed)).toEqual([1, 2, 3, 4]);
    expect(view.participants.map((p) => p.id)).toEqual(['team-a', 'team-b', 'team-c', 'team-d']);
    expect(view.participants.every((p) => p.kind === 'team')).toBe(true);
  });

  it('exposes a name lookup keyed by participant id', () => {
    expect(buildLeagueView(league()).nameOf).toEqual({
      'team-a': 'Aces',
      'team-b': 'Blockers',
      'team-c': 'Cutters',
      'team-d': 'Diggers',
    });
  });
});

describe('buildLeagueView — refusals', () => {
  it('refuses a season with fewer than two teams, and says what to do', () => {
    const view = buildLeagueView(league({ teams: [{ id: 'team-a', name: 'Aces' }] }));

    expect(view.problem).toBe('A league needs at least two teams — add more in setup.');
    expect(view.fixtures).toEqual([]);
    expect(view.standings).toEqual([]);
  });

  it('refuses a season with no weeks', () => {
    const view = buildLeagueView(league({ weeks: 0 }));

    expect(view.problem).toBe('A season needs at least one week.');
    expect(view.fixtures).toEqual([]);
  });

  it('still returns the skeleton when it refuses, so the setup screen can render', () => {
    // A refusal is a message beside a half-built season, not an exception. The
    // convener is mid-setup and needs to see what they have entered so far.
    const view = buildLeagueView(league({ teams: [{ id: 'team-a', name: 'Aces' }] }));

    expect(view.slug).toBeTruthy();
    expect(view.sessions).toHaveLength(4);
    expect(view.courts).toHaveLength(2);
    expect(view.participants).toHaveLength(1);
    expect(view.nameOf).toEqual({ 'team-a': 'Aces' });
  });

  it('a buildable season has no problem', () => {
    expect(buildLeagueView(league()).problem).toBeNull();
  });
});

describe('buildLeagueView — fixtures', () => {
  it('plays a single round-robin across the weeks', () => {
    // Four teams: three rounds of two fixtures each.
    const view = buildLeagueView(league({ weeks: 3, legs: 1 }));

    expect(view.fixtures).toHaveLength(6);
    const byWeek = view.sessions.map(
      (s) => view.fixtures.filter((m) => m.sessionId === s.id).length,
    );
    expect(byWeek).toEqual([2, 2, 2]);
  });

  it('a second leg reverses home and away', () => {
    const single = buildLeagueView(league({ weeks: 3, legs: 1 })).fixtures;
    const double = buildLeagueView(league({ weeks: 6, legs: 2 })).fixtures;

    expect(double).toHaveLength(12);
    const first = single[0]!;
    const returnLeg = double
      .slice(6)
      .find(
        (m) =>
          m.homeParticipantId === first.awayParticipantId &&
          m.awayParticipantId === first.homeParticipantId,
      );
    expect(returnLeg).toBeDefined();
  });

  it('treats a fractional or zero leg count as one leg', () => {
    const one = buildLeagueView(league({ weeks: 3, legs: 1 })).fixtures.length;

    expect(buildLeagueView(league({ weeks: 3, legs: 0 })).fixtures).toHaveLength(one);
    expect(buildLeagueView(league({ weeks: 3, legs: 1.9 })).fixtures).toHaveLength(one);
  });

  it('puts every fixture in one table — a league has no pools', () => {
    for (const fixture of buildLeagueView(league()).fixtures) {
      expect(fixture.poolId).toBeNull();
    }
  });

  it('reports fixtures the weekly grid had no room for as unscheduled', () => {
    // One court and one slot a week against three rounds of two fixtures:
    // half the season does not fit. That is a capacity answer for the
    // convener to act on, not an error — the fixtures still exist.
    const view = buildLeagueView(league({ weeks: 3, slotsPerWeek: 1, courtNames: ['Court 1'] }));

    expect(view.problem).toBeNull();
    expect(view.fixtures).toHaveLength(6);
    expect(view.unscheduled.length).toBeGreaterThan(0);
    expect(view.unscheduled.every((m) => m.timeslotId === null)).toBe(true);
  });

  it('assigns a court and a time together or neither', () => {
    // A fixture holding a court but no time is not placed, it is confusing.
    for (const fixture of buildLeagueView(league({ weeks: 3, slotsPerWeek: 1 })).fixtures) {
      expect(fixture.courtId === null).toBe(fixture.timeslotId === null);
    }
  });

  it('nothing is unscheduled when the grid has room', () => {
    const view = buildLeagueView(league({ weeks: 3, slotsPerWeek: 1, courtNames: ['A', 'B'] }));

    expect(view.unscheduled).toEqual([]);
  });
});

describe('buildLeagueView — results and the table', () => {
  it('counts only finalised fixtures as played', () => {
    const base = league();
    const fixtures = buildLeagueView(base).fixtures;
    const first = fixtures[0]!;

    expect(buildLeagueView(base).playedCount).toBe(0);

    const stored: StoredLeague = {
      ...base,
      results: {
        [first.id]: resultFor(first.id, first.homeParticipantId!, first.awayParticipantId!, [
          [25, 20],
          [25, 22],
        ]),
      },
    };
    expect(buildLeagueView(stored).playedCount).toBe(1);
  });

  it('computes the table from the fixtures rather than storing it (rule 1)', () => {
    const base = league();
    const first = buildLeagueView(base).fixtures[0]!;
    const home = first.homeParticipantId!;

    const before = buildLeagueView(base).standings;
    expect(before.every((row) => row.wins === 0 && row.losses === 0)).toBe(true);

    const stored: StoredLeague = {
      ...base,
      results: {
        [first.id]: resultFor(first.id, home, first.awayParticipantId!, [
          [25, 20],
          [25, 18],
        ]),
      },
    };
    const after = buildLeagueView(stored).standings;

    expect(after.find((row) => row.participantId === home)!.wins).toBe(1);
    // Nothing was written back: the same stored record still computes the
    // same table, and the record itself carries no standings.
    expect(buildLeagueView(stored).standings).toEqual(after);
    expect(stored).not.toHaveProperty('standings');
  });

  it('honours the convener’s choice on splitting a 1–1 on total points', () => {
    const base = league();
    const first = buildLeagueView(base).fixtures[0]!;
    const home = first.homeParticipantId!;
    const away = first.awayParticipantId!;
    // A 1–1 split where away scored more points overall.
    const results = {
      [first.id]: resultFor(first.id, home, away, [
        [25, 20],
        [18, 25],
      ]),
    };

    const onPoints = buildLeagueView({ ...base, results, splitByPoints: true }).standings;
    const off = buildLeagueView({ ...base, results, splitByPoints: false }).standings;

    expect(onPoints.find((r) => r.participantId === away)!.wins).toBe(1);
    expect(off.find((r) => r.participantId === away)!.wins).toBe(0);
  });

  it('ignores a result whose pairing no longer matches the fixture (M5)', () => {
    // Dropping a team regenerates the season, and a match id can come back
    // holding a different pairing. Reattaching the old score would invent a
    // result nobody played.
    const base = league();
    const first = buildLeagueView(base).fixtures[0]!;
    const stale = resultFor(first.id, 'team-a', 'team-z', [
      [25, 10],
      [25, 10],
    ]);

    const view = buildLeagueView({ ...base, results: { [first.id]: stale } });

    expect(view.fixtures[0]!.status).not.toBe('final');
    expect(view.playedCount).toBe(0);
  });
});

describe('buildLeagueView — purity', () => {
  it('is deterministic: the same stored season builds an identical view (rule 9)', () => {
    const stored = league();
    expect(buildLeagueView(stored)).toEqual(buildLeagueView(stored));
  });

  it('does not mutate the stored season it reads (rule 10)', () => {
    const stored = league();
    const before = structuredClone(stored);
    buildLeagueView(stored);

    expect(stored).toEqual(before);
  });

  it('hands back the stored record it was given', () => {
    const stored = league();
    expect(buildLeagueView(stored).stored).toBe(stored);
  });
});
