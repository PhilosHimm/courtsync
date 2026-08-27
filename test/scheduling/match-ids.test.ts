/**
 * ACTIVE — this suite must pass. It covers audit finding C3, which is
 * already fixed by `src/match-ids.ts`.
 */

import { describe, expect, it } from 'vitest';
import {
  assertRowsAffected,
  dropInMatchId,
  leagueMatchId,
  playoffMatchId,
  poolMatchId,
} from '@/lib/scheduling/match-ids';

describe('playoffMatchId', () => {
  it('always includes the tier segment', () => {
    // The CSV import path in scoop produced `slug-q1` with no tier, so the
    // seeder — which looked for `slug-gold-q1` — never found it.
    expect(playoffMatchId('spring-open', 'gold', 'q1')).toBe('spring-open-gold-q1');
    expect(playoffMatchId('spring-open', 'silver', 'q1')).toBe('spring-open-silver-q1');
  });

  it('produces distinct ids for the same slot in different tiers', () => {
    const gold = playoffMatchId('x', 'gold', 'final');
    const silver = playoffMatchId('x', 'silver', 'final');
    expect(gold).not.toBe(silver);
  });

  it('is deterministic', () => {
    expect(playoffMatchId('x', 'gold', 's2')).toBe(playoffMatchId('x', 'gold', 's2'));
  });
});

describe('other id builders', () => {
  it('namespaces pool matches by pool name, lowercased', () => {
    expect(poolMatchId('spring-open', 'A', 3)).toBe('spring-open-pool-a-3');
    expect(poolMatchId('spring-open', 'a', 3)).toBe('spring-open-pool-a-3');
  });

  it('namespaces league matches by session sequence', () => {
    expect(leagueMatchId('tuesday-night', 3, 2)).toBe('tuesday-night-wk3-2');
  });

  it('namespaces drop-in matches by session sequence', () => {
    expect(dropInMatchId('thursday-dropin', 1, 4)).toBe('thursday-dropin-s1-4');
  });

  it('never collides across formats for the same competition', () => {
    const ids = new Set([
      playoffMatchId('c', 'gold', 'q1'),
      poolMatchId('c', 'A', 1),
      leagueMatchId('c', 1, 1),
      dropInMatchId('c', 1, 1),
    ]);
    expect(ids.size).toBe(4);
  });
});

describe('assertRowsAffected', () => {
  it('passes when the count matches', () => {
    expect(() => assertRowsAffected(4, 4, 'seed quarterfinals')).not.toThrow();
  });

  it('throws loudly on a silent zero-row write — the other half of C3', () => {
    expect(() => assertRowsAffected(4, 0, 'seed quarterfinals')).toThrow(/expected to affect 4/);
  });

  it('throws on a partial write too', () => {
    expect(() => assertRowsAffected(4, 3, 'seed quarterfinals')).toThrow();
  });
});
