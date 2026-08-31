/**
 * Specification for `src/lib/manage/results.ts`.
 *
 * The manage layer landed without tests, and this file is the part of it
 * where a bug costs an organizer their day rather than a render: it gates
 * what may be entered, decides which stored score still belongs to which
 * game, and says who won.
 *
 * Reconciliation is the sharp edge. The schedule is derived from setup on
 * every read and only results are stored, so editing the field regenerates
 * the grid underneath scores that already exist. A score reattached to a
 * different pairing is worse than a score dropped — it is a result nobody
 * played, and M5 is the audit finding for exactly that.
 *
 * These assertions describe the behaviour the module already has. Where one
 * documents something the code does not promise in words, the comment says
 * so, because the next person to edit this needs to know which is which.
 */

import { describe, expect, it } from 'vitest';
import type { Match } from '@/lib/core';
import {
  applyResult,
  buildResult,
  reconcileResults,
  resultApplies,
  resultProblem,
  winnerSide,
} from '@/lib/manage/results';
import type { StoredResult, StoredResults } from '@/lib/storage';

function match(id: string, home: string | null, away: string | null): Match {
  return {
    id,
    competitionId: 'comp-1',
    sessionId: 'sess-1',
    poolId: 'pool-a',
    courtId: 'court-1',
    timeslotId: 'ts-1',
    homeParticipantId: home,
    awayParticipantId: away,
    refParticipantId: null,
    bracket: null,
    roundLabel: 'Pool Play',
    status: 'scheduled',
    sets: [],
  };
}

const sets = (...pairs: Array<[number, number]>) => pairs.map(([home, away]) => ({ home, away }));

function stored(
  id: string,
  home: string,
  away: string,
  pairs: Array<[number, number]>,
): StoredResult {
  return {
    matchId: id,
    homeParticipantId: home,
    awayParticipantId: away,
    sets: sets(...pairs),
    recordedAt: '2026-09-19T10:00:00Z',
  };
}

describe('resultProblem', () => {
  it('accepts an ordinary two-set pool result', () => {
    expect(resultProblem(sets([25, 20], [25, 18]), 'pool')).toBeNull();
  });

  it('accepts a playoff decided in two, and in three', () => {
    expect(resultProblem(sets([25, 20], [25, 18]), 'playoff')).toBeNull();
    expect(resultProblem(sets([25, 20], [18, 25], [15, 12]), 'playoff')).toBeNull();
  });

  it('refuses an empty scoresheet', () => {
    expect(resultProblem([], 'pool')).toMatch(/at least one set/i);
  });

  it('holds each format to its own number of sets', () => {
    expect(resultProblem(sets([25, 20], [25, 18], [15, 12]), 'pool')).toMatch(/two sets/i);
    expect(resultProblem(sets([25, 20], [18, 25], [15, 12], [15, 12]), 'playoff')).toMatch(
      /best of three/i,
    );
  });

  it('refuses scores that are not whole, non-negative numbers', () => {
    expect(resultProblem(sets([25.5, 20]), 'pool')).toMatch(/whole numbers/i);
    expect(resultProblem(sets([-1, 20]), 'pool')).toMatch(/negative/i);
    expect(resultProblem([{ home: Number.NaN, away: 20 }], 'pool')).toMatch(/whole numbers/i);
  });

  it('refuses a level set — a set has a winner', () => {
    expect(resultProblem(sets([25, 25]), 'pool')).toMatch(/level/i);
    expect(resultProblem(sets([0, 0]), 'pool')).toMatch(/level/i);
  });

  it('names the set that is wrong, so the organizer knows which box to fix', () => {
    expect(resultProblem(sets([25, 20], [22, 22]), 'pool')).toContain('Set 2');
  });

  it('refuses an elimination match that ends level in sets', () => {
    // advanceBracket refuses to advance a tied elimination match (H15).
    // Refusing it at entry is the same rule enforced where it can still be
    // fixed, rather than at render when the bracket has already stalled.
    expect(resultProblem(sets([25, 20], [18, 25]), 'playoff')).toMatch(/decided in sets/i);
  });

  it('refuses a best-of-three nobody has taken two sets in', () => {
    expect(resultProblem(sets([25, 20]), 'playoff')).toMatch(/two sets/i);
  });

  it('does not apply the elimination rule to pool play', () => {
    // A 1-1 pool match is a real outcome: computeStandings settles it on
    // total points. Rejecting it here would make the format unenterable.
    expect(resultProblem(sets([25, 20], [18, 25]), 'pool')).toBeNull();
  });
});

describe('buildResult', () => {
  it('records the pairing alongside the sets', () => {
    const result = buildResult(match('m1', 'p1', 'p2'), sets([25, 20]), '2026-09-19T10:00:00Z');
    expect(result).toEqual({
      matchId: 'm1',
      homeParticipantId: 'p1',
      awayParticipantId: 'p2',
      sets: [{ home: 25, away: 20 }],
      recordedAt: '2026-09-19T10:00:00Z',
    });
  });

  it('takes the timestamp from the caller and never from a clock', () => {
    // Rule 9. A stored competition has to rebuild identically every time,
    // and a Date.now() in here would make two reads disagree.
    const first = buildResult(match('m1', 'p1', 'p2'), sets([25, 20]), '2026-01-01T00:00:00Z');
    const second = buildResult(match('m1', 'p1', 'p2'), sets([25, 20]), '2026-01-01T00:00:00Z');
    expect(first).toEqual(second);
  });

  it('copies the sets rather than aliasing the caller’s array', () => {
    const input = sets([25, 20]);
    const result = buildResult(match('m1', 'p1', 'p2'), input, '2026-09-19T10:00:00Z');
    input[0]!.home = 99;
    expect(result.sets[0]?.home).toBe(25);
  });

  it('refuses a match with no participants', () => {
    // A bracket slot waiting on an unplayed quarterfinal has null sides.
    // Recording a score against one would invent a result.
    expect(() => buildResult(match('semi-1', null, null), sets([25, 20]), 'now')).toThrow(/semi-1/);
    expect(() => buildResult(match('m1', 'p1', null), sets([25, 20]), 'now')).toThrow();
  });
});

describe('resultApplies', () => {
  it('is true only when both sides still match', () => {
    const result = stored('m1', 'p1', 'p2', [[25, 20]]);
    expect(resultApplies(result, match('m1', 'p1', 'p2'))).toBe(true);
    expect(resultApplies(result, match('m1', 'p3', 'p2'))).toBe(false);
    expect(resultApplies(result, match('m1', 'p1', 'p3'))).toBe(false);
  });

  it('is false when the pairing reversed', () => {
    // Same two teams, opposite ends. The stored 25-20 would read as a win
    // for the other side — the score is not neutral about which is which.
    const result = stored('m1', 'p1', 'p2', [[25, 20]]);
    expect(resultApplies(result, match('m1', 'p2', 'p1'))).toBe(false);
  });
});

describe('applyResult', () => {
  it('marks the match final and mints set rows from the stored score', () => {
    const results: StoredResults = {
      m1: stored('m1', 'p1', 'p2', [
        [25, 20],
        [25, 18],
      ]),
    };
    const applied = applyResult(match('m1', 'p1', 'p2'), results);

    expect(applied.status).toBe('final');
    expect(applied.sets).toHaveLength(2);
    expect(applied.sets[1]).toEqual({
      id: 'm1-set-2',
      matchId: 'm1',
      setNumber: 2,
      homePoints: 25,
      awayPoints: 18,
    });
  });

  it('leaves a match with no stored result untouched', () => {
    const original = match('m1', 'p1', 'p2');
    expect(applyResult(original, {})).toBe(original);
  });

  it('ignores a result whose pairing no longer matches', () => {
    const results: StoredResults = { m1: stored('m1', 'p1', 'p2', [[25, 20]]) };
    const rebuilt = match('m1', 'p3', 'p4');
    const applied = applyResult(rebuilt, results);
    expect(applied.status).toBe('scheduled');
    expect(applied.sets).toEqual([]);
  });

  it('never mutates the match it was given (rule 10)', () => {
    const original = match('m1', 'p1', 'p2');
    const before = structuredClone(original);
    applyResult(original, { m1: stored('m1', 'p1', 'p2', [[25, 20]]) });
    expect(original).toEqual(before);
  });
});

describe('winnerSide', () => {
  const played = (pairs: Array<[number, number]>): Match =>
    applyResult(match('m1', 'p1', 'p2'), { m1: stored('m1', 'p1', 'p2', pairs) });

  it('reads sets when sets decide it', () => {
    expect(
      winnerSide(
        played([
          [25, 20],
          [25, 18],
        ]),
        true,
      ),
    ).toBe('home');
    expect(
      winnerSide(
        played([
          [20, 25],
          [18, 25],
        ]),
        true,
      ),
    ).toBe('away');
  });

  it('settles a 1-1 split on total points when the format says to', () => {
    // Pool play. A board bolding on sets alone would leave these looking
    // undecided while the standings had already awarded the win.
    // 45-40 across the two sets, so home takes it despite the 1-1 split.
    expect(
      winnerSide(
        played([
          [25, 15],
          [20, 25],
        ]),
        true,
      ),
    ).toBe('home');
    // 45-49 the other way.
    expect(
      winnerSide(
        played([
          [20, 25],
          [25, 24],
        ]),
        true,
      ),
    ).toBe('away');
  });

  it('leaves a 1-1 split undecided when the format does not', () => {
    // Playoffs play a third set, so 1-1 means the decider has not happened.
    expect(
      winnerSide(
        played([
          [25, 20],
          [18, 25],
        ]),
        false,
      ),
    ).toBeNull();
  });

  it('is null when total points tie too, and when nothing was played', () => {
    expect(
      winnerSide(
        played([
          [25, 20],
          [20, 25],
        ]),
        true,
      ),
    ).toBeNull();
    expect(winnerSide(match('m1', 'p1', 'p2'), true)).toBeNull();
  });
});

describe('reconcileResults', () => {
  it('keeps results whose match and pairing both survive', () => {
    const results: StoredResults = { m1: stored('m1', 'p1', 'p2', [[25, 20]]) };
    expect(reconcileResults(results, [match('m1', 'p1', 'p2')])).toEqual(results);
  });

  it('drops a result whose match id no longer exists', () => {
    // The organizer removed a team; the grid regenerated shorter.
    const results: StoredResults = { m1: stored('m1', 'p1', 'p2', [[25, 20]]) };
    expect(reconcileResults(results, [])).toEqual({});
  });

  it('drops a result whose match id now pairs different teams', () => {
    // The sharp edge. Ids are minted from pool and index, so removing a team
    // can hand the same id to a different pairing. Keeping the score would
    // attach a result to a game nobody played (M5).
    const results: StoredResults = { m1: stored('m1', 'p1', 'p2', [[25, 20]]) };
    expect(reconcileResults(results, [match('m1', 'p1', 'p3')])).toEqual({});
  });

  it('keeps the survivors when only some results are orphaned', () => {
    const results: StoredResults = {
      m1: stored('m1', 'p1', 'p2', [[25, 20]]),
      m2: stored('m2', 'p3', 'p4', [[25, 20]]),
    };
    const kept = reconcileResults(results, [match('m1', 'p1', 'p2'), match('m2', 'p9', 'p4')]);
    expect(Object.keys(kept)).toEqual(['m1']);
  });

  it('never mutates the results it was given', () => {
    const results: StoredResults = { m1: stored('m1', 'p1', 'p2', [[25, 20]]) };
    const before = structuredClone(results);
    reconcileResults(results, []);
    expect(results).toEqual(before);
  });

  it('is deterministic', () => {
    const results: StoredResults = {
      m1: stored('m1', 'p1', 'p2', [[25, 20]]),
      m2: stored('m2', 'p3', 'p4', [[25, 20]]),
    };
    const matches = [match('m1', 'p1', 'p2'), match('m2', 'p3', 'p4')];
    expect(reconcileResults(results, matches)).toEqual(reconcileResults(results, matches));
  });
});
