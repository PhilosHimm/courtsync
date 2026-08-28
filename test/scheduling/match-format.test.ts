/**
 * Specification for `matchPhaseOf`, `setFormatFor`, `setFormatOf` and
 * `isSelfRefereed`.
 *
 * The organizer-facing question these answer is "what is this match played
 * to, and who blows the whistle" — the two things a scoring screen has to
 * say and currently does not. The rules live in core; the point of this
 * module is that they are derived from the match rather than copied onto it,
 * because a `format` column beside a round label is two places one fact can
 * live and disagree (C3).
 */

import { describe, expect, it } from 'vitest';
import type { Match } from '@/lib/core';
import { PLAYOFF_SETS, POOL_PLAY_ROUND_LABEL, POOL_PLAY_SETS } from '@/lib/core';
import {
  isSelfRefereed,
  matchPhaseOf,
  setFormatFor,
  setFormatOf,
} from '@/lib/scheduling/match-format';

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    competitionId: 'comp-1',
    sessionId: 'sess-1',
    poolId: null,
    courtId: 'court-1',
    timeslotId: 'ts-1',
    homeParticipantId: 't1',
    awayParticipantId: 't2',
    refParticipantId: null,
    bracket: null,
    roundLabel: null,
    status: 'scheduled',
    sets: [],
    ...overrides,
  };
}

describe('matchPhaseOf', () => {
  it('reads a pool match off the round label every producer writes', () => {
    expect(matchPhaseOf(match({ roundLabel: POOL_PLAY_ROUND_LABEL, poolId: 'pool-a' }))).toBe(
      'pool',
    );
  });

  it('reads a playoff match off its bracket tier', () => {
    expect(matchPhaseOf(match({ bracket: 'gold', roundLabel: 'q1' }))).toBe('playoff');
    expect(matchPhaseOf(match({ bracket: 'silver', roundLabel: 'final' }))).toBe('playoff');
  });

  it('reads a playoff match off a bracket slot even with no tier recorded', () => {
    // `seedBrackets` always sets both, but a match arriving from anywhere
    // else should not silently lose its format because one field is blank.
    expect(matchPhaseOf(match({ bracket: null, roundLabel: 's2' }))).toBe('playoff');
  });

  it('answers null for a match that is neither', () => {
    // A league week and a drop-in round are not pool play and not a bracket.
    // This module has nothing to say about them, and guessing "pool" would
    // put a tournament's scoring rules on a league fixture.
    expect(matchPhaseOf(match({ roundLabel: 'Week 3' }))).toBeNull();
    expect(matchPhaseOf(match({ roundLabel: null }))).toBeNull();
  });

  it('does not match a round label that only looks like pool play', () => {
    // The whole reason the label is a constant: `Pool A` and `pool play` are
    // not it, and a filter that accepted them would be inventing the rule
    // the constant exists to pin.
    expect(matchPhaseOf(match({ roundLabel: 'Pool A' }))).toBeNull();
    expect(matchPhaseOf(match({ roundLabel: 'pool play' }))).toBeNull();
  });
});

describe('setFormatFor', () => {
  it('gives pool play the two-set preset from core', () => {
    const format = setFormatFor('pool');
    expect(format.rules).toEqual(POOL_PLAY_SETS);
    expect(format.deciderSetNumber).toBeNull();
    expect(format.splitDecidedOnTotalPoints).toBe(true);
  });

  it('gives the playoffs the three-set preset from core', () => {
    const format = setFormatFor('playoff');
    expect(format.rules).toEqual(PLAYOFF_SETS);
    expect(format.deciderSetNumber).toBe(3);
    // A knockout match is not settled on aggregate points — `advanceBracket`
    // refuses to advance a tied elimination match (H15), and the two have to
    // say the same thing about what 1-1 means.
    expect(format.splitDecidedOnTotalPoints).toBe(false);
  });

  it('says the pool format in one line an organizer can read', () => {
    expect(setFormatFor('pool').label).toBe('2 sets to 21, cap 25');
  });

  it('says the playoff format in one line an organizer can read', () => {
    expect(setFormatFor('playoff').label).toBe('Best of 3 to 25');
  });

  it('labels each pool set with its own target', () => {
    expect(setFormatFor('pool').setLabels).toEqual([
      'Set 1 — to 21, cap 25',
      'Set 2 — to 21, cap 25',
    ]);
  });

  it('labels the deciding set with the target and the switch', () => {
    // Most organizers know the tiebreak rules; the label is there so nobody
    // has to go and check the sheet mid-match.
    expect(setFormatFor('playoff').setLabels).toEqual([
      'Set 1 — to 25',
      'Set 2 — to 25',
      'Set 3 — to 15 (switch at 8)',
    ]);
  });

  it('is derived from the core presets, not a second copy of them', () => {
    // If someone edits POOL_PLAY_SETS the labels have to follow. A hardcoded
    // "2 sets to 21" would go stale silently and be wrong on a scoring screen.
    for (const phase of ['pool', 'playoff'] as const) {
      const format = setFormatFor(phase);
      expect(format.setLabels).toHaveLength(format.rules.length);
      for (const [i, rule] of format.rules.entries()) {
        expect(format.setLabels[i]).toContain(`to ${rule.target}`);
      }
    }
  });

  it('does not hand back the core preset array for a caller to mutate', () => {
    const format = setFormatFor('pool');
    expect(() => {
      format.setLabels.push('Set 3');
    }).not.toThrow();
    expect(setFormatFor('pool').setLabels).toHaveLength(2);
  });
});

describe('setFormatOf', () => {
  it('gives a pool match the pool format', () => {
    expect(setFormatOf(match({ roundLabel: POOL_PLAY_ROUND_LABEL }))?.phase).toBe('pool');
  });

  it('gives a bracket match the playoff format', () => {
    expect(setFormatOf(match({ bracket: 'gold', roundLabel: 'q3' }))?.phase).toBe('playoff');
  });

  it('answers null rather than guessing for a match it cannot place', () => {
    expect(setFormatOf(match({ roundLabel: 'Week 3' }))).toBeNull();
  });
});

describe('isSelfRefereed', () => {
  /**
   * The Red Velvet sheet lists the consolation match as "Self Ref": no
   * assigned crew, the two teams call their own. A blank on the screen reads
   * as a missing assignment instead.
   */
  it('calls an unstaffed bracket match self-refereed', () => {
    expect(isSelfRefereed(match({ bracket: 'gold', roundLabel: 'consolation' }))).toBe(true);
  });

  it('does not call an unstaffed POOL match self-refereed', () => {
    // This is the distinction the whole predicate exists for. `assignReferees`
    // staffs pool matches and reports the ones it could not — when every court
    // is running there is nobody left who is not playing. Rendering that as
    // "self ref" would turn a shortfall the organizer needs to see into a
    // line that reads like a decision somebody made.
    expect(isSelfRefereed(match({ roundLabel: POOL_PLAY_ROUND_LABEL, poolId: 'pool-a' }))).toBe(
      false,
    );
  });

  it('is false once a bracket match has a crew', () => {
    expect(
      isSelfRefereed(match({ bracket: 'gold', roundLabel: 'final', refParticipantId: 't9' })),
    ).toBe(false);
  });

  it('is false for a match that is neither pool play nor a bracket', () => {
    expect(isSelfRefereed(match({ roundLabel: 'Week 3' }))).toBe(false);
  });
});
