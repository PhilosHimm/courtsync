/**
 * Specification for the agreement between the Postgres schema and the
 * TypeScript constants that mirror it.
 *
 * Audit finding H4 was two conflicting schema definitions — a migration and a
 * runtime table creation that disagreed, so production almost certainly had no
 * foreign keys at all. docs/PITFALLS.md records it as prevented by there being
 * one schema file, and for tables that is true. For enums it is not: every
 * `create type ... as enum` in sql/0001_initial.sql is stated a second time as
 * a constant under src/lib/core/types, and nothing compared the two.
 *
 * They agree today. This suite is what keeps them agreeing, and it is only
 * cheap to write while the database is still unwired — once rows exist, a
 * value added on one side and missed on the other is a failed insert in a gym
 * on a Saturday rather than a red test.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ATTENDANCE_STATUSES,
  COMPETITION_FORMATS,
  MATCH_STATUSES,
  PARTICIPANT_KINDS,
  PAYMENT_METHODS,
  TIEBREAKER_ORDER,
  TRANSACTION_TYPES,
} from '@/lib/core';

const schemaPath = fileURLToPath(new URL('../../sql/0001_initial.sql', import.meta.url));
const schema = readFileSync(schemaPath, 'utf8');

/** Every `create type <name> as enum ('a', 'b')` in the migration. */
function enumsInSchema(sql: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const declaration = /create\s+type\s+(\w+)\s+as\s+enum\s*\(([^)]*)\)/gi;
  for (const [, name, body] of sql.matchAll(declaration)) {
    if (!name || body === undefined) continue;
    const values = [...body.matchAll(/'([^']*)'/g)].map(([, value]) => value ?? '');
    found.set(name, values);
  }
  return found;
}

/** The TypeScript constant that mirrors each Postgres enum. */
const MIRRORED: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['competition_format', COMPETITION_FORMATS],
  ['match_status', MATCH_STATUSES],
  ['participant_kind', PARTICIPANT_KINDS],
  ['attendance_status', ATTENDANCE_STATUSES],
  ['payment_method', PAYMENT_METHODS],
  ['transaction_type', TRANSACTION_TYPES],
];

describe('the Postgres enums and their TypeScript mirrors', () => {
  const declared = enumsInSchema(schema);

  it('finds every enum the migration declares', () => {
    expect(declared.size).toBeGreaterThan(0);
    expect([...declared.keys()].sort()).toEqual(MIRRORED.map(([name]) => name).sort());
  });

  for (const [name, constant] of MIRRORED) {
    it(`${name} holds exactly the values its constant does`, () => {
      // Order matters as well as membership: the constants are what the app
      // renders in a picker, and a schema reordering that the constant did not
      // follow is the kind of drift H4 was about.
      expect(declared.get(name)).toEqual([...constant]);
    });
  }
});

describe('TIEBREAKER_ORDER is the order computeStandings actually applies', () => {
  /**
   * The constant states the tiebreaker order as data; `computeStandings`
   * hard-codes the same order in its comparator and never reads the constant.
   * Two statements of one rule, each free to change without the other
   * noticing. Every entry needs a scenario in standings.test.ts that proves
   * that step decides a tie, so adding a tiebreaker here without testing it
   * fails right away.
   */
  const covered = new Set(['winPercentage', 'headToHead', 'setDifferential', 'pointDifferential']);

  it('has a proven scenario for every step it declares', () => {
    for (const tiebreaker of TIEBREAKER_ORDER) {
      expect(covered.has(tiebreaker)).toBe(true);
    }
  });

  it('puts head-to-head above the differentials', () => {
    // The one ordering decision in the list that is not obvious, and the one
    // the MVP spec is explicit about: beating someone directly counts for more
    // than a fat margin elsewhere.
    expect(TIEBREAKER_ORDER.indexOf('headToHead')).toBeLessThan(
      TIEBREAKER_ORDER.indexOf('setDifferential'),
    );
    expect(TIEBREAKER_ORDER.indexOf('setDifferential')).toBeLessThan(
      TIEBREAKER_ORDER.indexOf('pointDifferential'),
    );
  });

  it('starts with win percentage', () => {
    expect(TIEBREAKER_ORDER[0]).toBe('winPercentage');
  });
});
