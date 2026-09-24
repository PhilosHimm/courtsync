/**
 * Specification for score validation (#18): warn, never block.
 *
 * Weird real scores happen — an injury, a time cap, an agreed default, a
 * rec night that plays one set to 15 because the gym is closing. A form that
 * refuses them strands the organizer with a result they cannot record, which
 * is worse than a result that looks odd. So everything a volleyball rule
 * would object to is a warning, shown and then accepted.
 *
 * Only input that cannot be a score at all is an error: no sets, a negative
 * number, half a point. Those are typing mistakes, not scores.
 */

import { describe, expect, it } from 'vitest';
import { setFormatFor } from '@/lib/scheduling/match-format';
import { checkScore } from '@/lib/scheduling/score-check';

const pool = setFormatFor('pool'); // 2 sets to 21, cap 25
const playoff = setFormatFor('playoff'); // best of 3 to 25, decider to 15

const kinds = (sets: Array<[number, number]>, format = pool) =>
  checkScore({ sets: sets.map(([home, away]) => ({ home, away })), format }).warnings.map(
    (w) => w.kind,
  );

describe('errors — input that is not a score', () => {
  it('refuses an empty scoreline', () => {
    expect(checkScore({ sets: [], format: pool }).errors).toHaveLength(1);
  });

  it('refuses negative and fractional points', () => {
    expect(checkScore({ sets: [{ home: -1, away: 21 }], format: pool }).errors[0]).toMatch(/Set 1/);
    expect(checkScore({ sets: [{ home: 21, away: 18.5 }], format: pool }).errors[0]).toMatch(
      /whole/,
    );
  });

  it('has no errors for anything that could have been played', () => {
    for (const sets of [
      [[12, 10]],
      [[21, 20]],
      [[40, 38]],
      [[21, 21]],
      [
        [21, 15],
        [21, 15],
        [21, 15],
      ],
    ] as Array<Array<[number, number]>>) {
      const result = checkScore({
        sets: sets.map(([home, away]) => ({ home, away })),
        format: pool,
      });
      expect(result.errors).toEqual([]);
    }
  });
});

describe('warnings — accepted, but worth a second look', () => {
  it('says nothing about an ordinary result', () => {
    expect(
      kinds([
        [21, 15],
        [19, 21],
      ]),
    ).toEqual([]);
    expect(
      kinds(
        [
          [25, 20],
          [23, 25],
          [15, 12],
        ],
        playoff,
      ),
    ).toEqual([]);
  });

  it('flags a set that ended short of its target', () => {
    // A time cap, most likely. Real, and worth checking it was not 21-10
    // typed as 12-10.
    expect(
      kinds([
        [12, 10],
        [21, 15],
      ]),
    ).toEqual(['below-target']);
  });

  it('flags a one-point margin in a win-by-two set', () => {
    expect(
      kinds([
        [21, 20],
        [21, 15],
      ]),
    ).toEqual(['short-margin']);
  });

  it('accepts a one-point margin at the cap without comment', () => {
    // 25-24 at a cap of 25 is exactly how a capped set ends.
    expect(
      kinds([
        [25, 24],
        [21, 15],
      ]),
    ).toEqual([]);
  });

  it('flags a winner past the cap', () => {
    expect(
      kinds([
        [27, 25],
        [21, 15],
      ]),
    ).toEqual(['over-cap']);
  });

  it('flags a set that ran past the point where it was already won', () => {
    // 30-20 in a set to 25 means the set went on after it ended.
    expect(
      kinds(
        [
          [30, 20],
          [25, 20],
        ],
        playoff,
      ),
    ).toEqual(['past-target']);
  });

  it('does not call a long deuce a set that ran past its target', () => {
    expect(
      kinds(
        [
          [31, 29],
          [25, 20],
        ],
        playoff,
      ),
    ).toEqual([]);
  });

  it('flags a level set', () => {
    expect(
      kinds([
        [21, 21],
        [21, 15],
      ]),
    ).toContain('level-set');
  });

  it('flags more sets than the format has', () => {
    expect(
      kinds([
        [21, 15],
        [15, 21],
        [15, 10],
      ]),
    ).toEqual(['too-many-sets']);
  });

  it('flags a set played after the match was already decided', () => {
    expect(
      kinds(
        [
          [25, 20],
          [25, 20],
          [15, 10],
        ],
        playoff,
      ),
    ).toEqual(['set-after-decided']);
  });

  it('flags a playoff that is not decided, because the bracket cannot advance on it', () => {
    // H15: advancing a tied elimination match invents a winner. The score
    // is still saved — maybe the decider is being played right now — but the
    // organizer has to know nothing moves until it is.
    const result = checkScore({
      sets: [
        { home: 25, away: 20 },
        { home: 20, away: 25 },
      ],
      format: playoff,
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings.map((w) => w.kind)).toEqual(['undecided']);
    expect(result.warnings[0]!.message).toMatch(/bracket/i);
  });

  it('flags a pool match with a set missing', () => {
    expect(kinds([[21, 15]])).toEqual(['missing-set']);
  });

  it('never flags a pool 1-1 split as undecided — total points settle it', () => {
    expect(
      kinds([
        [21, 15],
        [19, 21],
      ]),
    ).not.toContain('undecided');
  });

  it('names the set in every per-set warning', () => {
    const result = checkScore({
      sets: [
        { home: 21, away: 15 },
        { home: 12, away: 10 },
      ],
      format: pool,
    });
    expect(result.warnings[0]).toMatchObject({ kind: 'below-target', setNumber: 2 });
    expect(result.warnings[0]!.message).toMatch(/Set 2/);
  });
});

describe('purity', () => {
  it('does not mutate the sets it was given and answers the same twice', () => {
    const sets = [
      { home: 21, away: 20 },
      { home: 12, away: 10 },
    ];
    const before = JSON.stringify(sets);
    const first = checkScore({ sets, format: pool });
    expect(JSON.stringify(sets)).toBe(before);
    expect(checkScore({ sets, format: pool })).toEqual(first);
  });
});
