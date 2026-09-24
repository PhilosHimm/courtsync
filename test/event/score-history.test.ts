/**
 * Specification for score-edit history (#22).
 *
 * "Never invent a result" (PRODUCT.md principle 4) read honestly: a score
 * that changes has to be able to say what it was, when it changed, and
 * through which link. The history is append-only like the fee ledger
 * (rule 8) — a correction is a new row, never an update.
 */

import { describe, expect, it } from 'vitest';
import type { MatchSet } from '@/lib/core';
import { describeScoreChange, scoreEdits } from '@/lib/event/score-history';

const set = (n: number, home: number, away: number): MatchSet => ({
  id: `m-${n}`,
  matchId: 'm',
  setNumber: n,
  homePoints: home,
  awayPoints: away,
});

const at = '2026-05-02T15:20:00Z';

describe('scoreEdits', () => {
  it('records the first entry of each set as an edit from nothing, not from 0-0', () => {
    const edits = scoreEdits({
      matchId: 'm',
      previous: [],
      next: [
        { home: 21, away: 18 },
        { home: 21, away: 15 },
      ],
      editedAt: at,
    });
    expect(edits).toEqual([
      {
        matchId: 'm',
        setNumber: 1,
        previousHome: null,
        previousAway: null,
        nextHome: 21,
        nextAway: 18,
        editedAt: at,
      },
      {
        matchId: 'm',
        setNumber: 2,
        previousHome: null,
        previousAway: null,
        nextHome: 21,
        nextAway: 15,
        editedAt: at,
      },
    ]);
  });

  it('records only the sets that changed', () => {
    const edits = scoreEdits({
      matchId: 'm',
      previous: [set(1, 21, 18), set(2, 21, 15)],
      next: [
        { home: 21, away: 18 },
        { home: 19, away: 21 },
      ],
      editedAt: at,
      reason: 'Home and away swapped on set 2',
    });
    expect(edits).toEqual([
      {
        matchId: 'm',
        setNumber: 2,
        previousHome: 21,
        previousAway: 15,
        nextHome: 19,
        nextAway: 21,
        editedAt: at,
        reason: 'Home and away swapped on set 2',
      },
    ]);
  });

  it('records a removed set with no next score, rather than a 0-0 nobody played', () => {
    const edits = scoreEdits({
      matchId: 'm',
      previous: [set(1, 25, 20), set(2, 25, 20), set(3, 15, 10)],
      next: [
        { home: 25, away: 20 },
        { home: 25, away: 20 },
      ],
      editedAt: at,
    });
    expect(edits).toEqual([
      {
        matchId: 'm',
        setNumber: 3,
        previousHome: 15,
        previousAway: 10,
        nextHome: null,
        nextAway: null,
        editedAt: at,
      },
    ]);
  });

  it('keeps who made it — an organizer, or a score link', () => {
    const [byLink] = scoreEdits({
      matchId: 'm',
      previous: [],
      next: [{ home: 1, away: 0 }],
      editedAt: at,
      viaLinkId: 'link-7',
    });
    expect(byLink).toMatchObject({ viaLinkId: 'link-7' });
    expect(byLink).not.toHaveProperty('editedBy');
    const [byOrganizer] = scoreEdits({
      matchId: 'm',
      previous: [],
      next: [{ home: 1, away: 0 }],
      editedAt: at,
      editedBy: 'user-1',
    });
    expect(byOrganizer).toMatchObject({ editedBy: 'user-1' });
  });

  it('records nothing when nothing changed', () => {
    expect(
      scoreEdits({
        matchId: 'm',
        previous: [set(1, 21, 18)],
        next: [{ home: 21, away: 18 }],
        editedAt: at,
      }),
    ).toEqual([]);
  });

  it('reads the previous sets by set number, whatever order they arrive in', () => {
    const edits = scoreEdits({
      matchId: 'm',
      previous: [set(2, 21, 15), set(1, 21, 18)],
      next: [
        { home: 21, away: 18 },
        { home: 21, away: 15 },
      ],
      editedAt: at,
    });
    expect(edits).toEqual([]);
  });
});

describe('describeScoreChange', () => {
  it('says what changed in one line per set, for the confirmation screen', () => {
    expect(
      describeScoreChange(
        [set(1, 21, 18), set(2, 21, 15)],
        [
          { home: 21, away: 18 },
          { home: 19, away: 21 },
          { home: 15, away: 9 },
        ],
      ),
    ).toEqual(['Set 2: 21–15 → 19–21', 'Set 3: added 15–9']);
    expect(
      describeScoreChange(
        [set(1, 25, 20), set(2, 25, 20), set(3, 15, 10)],
        [
          { home: 25, away: 20 },
          { home: 25, away: 20 },
        ],
      ),
    ).toEqual(['Set 3: removed (was 15–10)']);
  });
});
