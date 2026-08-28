/**
 * The demo's whole state arrives in a query string, so these parsers are the
 * only thing between a hand-edited URL and an engine that throws on input it
 * cannot schedule. `drawPools` refusing an impossible pool count is correct
 * behaviour for a form and a 500 for a link somebody pasted into a group
 * chat, which is why every knob clamps rather than validates.
 */

import { describe, expect, it } from 'vitest';
import { MAX_TEAMS_PER_POOL, MIN_TEAMS_PER_POOL } from '@/lib/core';
import {
  dropInQuery,
  flipsQuery,
  leagueQuery,
  nearestPoolCount,
  parseDropInConfig,
  parseFlips,
  parseLeagueConfig,
  parseTournamentConfig,
  readInt,
  tournamentQuery,
  validPoolCounts,
} from '@/lib/demo';
import { drawPools } from '@/lib/scheduling';

describe('readInt', () => {
  const range = { min: 4, max: 12, fallback: 8 };

  it('falls back when the key is absent', () => {
    expect(readInt({}, 'teams', range)).toBe(8);
  });

  it('clamps rather than rejecting', () => {
    expect(readInt({ teams: '999' }, 'teams', range)).toBe(12);
    expect(readInt({ teams: '-4' }, 'teams', range)).toBe(4);
  });

  it('falls back on anything that is not a number', () => {
    for (const junk of ['', 'abc', 'NaN', '../../etc', '<script>']) {
      expect(readInt({ teams: junk }, 'teams', range)).toBe(8);
    }
  });

  it('takes the first value when a parameter repeats', () => {
    expect(readInt({ teams: ['6', '99'] }, 'teams', range)).toBe(6);
  });

  it('truncates a fractional value instead of passing it on', () => {
    // A non-integer count reaches Array.from({ length }) downstream, where it
    // is silently useless. Trim it here where it is still visible.
    expect(readInt({ teams: '7.9' }, 'teams', range)).toBe(7);
  });
});

describe('pool counts', () => {
  it('only offers counts that give legal pool sizes', () => {
    for (let teams = 6; teams <= 24; teams++) {
      for (const count of validPoolCounts(teams)) {
        expect(Math.floor(teams / count)).toBeGreaterThanOrEqual(MIN_TEAMS_PER_POOL);
        expect(Math.ceil(teams / count)).toBeLessThanOrEqual(MAX_TEAMS_PER_POOL);
      }
    }
  });

  it('snaps a requested count to the nearest legal one', () => {
    // 12 teams cannot be drawn into 5 pools (that is 2s and 3s), and 4 is the
    // nearest count that works.
    expect(nearestPoolCount(12, 5)).toBe(4);
    expect(nearestPoolCount(12, 3)).toBe(3);
    expect(nearestPoolCount(12, 99)).toBe(4);
  });
});

describe('parseTournamentConfig', () => {
  it('never produces a field the engine refuses to draw', () => {
    for (let teams = 6; teams <= 24; teams++) {
      for (let pools = 1; pools <= 12; pools++) {
        const config = parseTournamentConfig({ teams: String(teams), pools: String(pools) });
        const participants = Array.from({ length: config.teams }, (_, i) => ({
          id: `t-${i}`,
          competitionId: 'c',
          kind: 'team' as const,
          name: `Team ${i}`,
          registeredAt: '2026-01-01T00:00:00Z',
        }));
        expect(() =>
          drawPools({
            participants,
            pools: Array.from({ length: config.pools }, (_, i) => ({
              id: `p-${i}`,
              name: String(i),
            })),
          }),
        ).not.toThrow();
      }
    }
  });

  it('ignores a stage nobody defined', () => {
    expect(parseTournamentConfig({ stage: 'champion' }).stage).toBe('pools');
  });

  it('round-trips through its own query string', () => {
    const config = parseTournamentConfig({ teams: '16', courts: '4', stage: 'semis' });
    const query = Object.fromEntries(new URLSearchParams(tournamentQuery(config)));
    expect(parseTournamentConfig(query)).toEqual(config);
  });
});

describe('corrected results in the link', () => {
  it('round-trips a list of corrected matches', () => {
    const ids = ['demo-open-gold-q1', 'demo-open-pool-a-3'];
    const query = Object.fromEntries(new URLSearchParams(flipsQuery(ids)));
    expect(parseFlips(query)).toEqual(ids);
  });

  it('is empty when nothing was corrected', () => {
    expect(flipsQuery([])).toBe('');
    expect(parseFlips({})).toEqual([]);
  });

  it('drops anything that is not a match id', () => {
    // The ids are minted by src/lib/scheduling/match-ids.ts and nothing else.
    // A value that could not have come from there did not come from there.
    expect(parseFlips({ flip: 'demo-open-gold-q1,<script>,../secret,DEMO-OPEN,ok-id' })).toEqual([
      'demo-open-gold-q1',
      'ok-id',
    ]);
  });

  it('de-duplicates and stays bounded', () => {
    const many = Array.from({ length: 500 }, (_, i) => `m-${i}`).join(',');
    expect(parseFlips({ flip: 'a,a,b' })).toEqual(['a', 'b']);
    expect(parseFlips({ flip: many }).length).toBeLessThanOrEqual(120);
  });
});

describe('parseLeagueConfig', () => {
  it('never reports more weeks played than the season has', () => {
    const config = parseLeagueConfig({ weeks: '6', played: '40' });
    expect(config.played).toBe(6);
  });

  it('round-trips through its own query string', () => {
    const config = parseLeagueConfig({ teams: '10', weeks: '12', legs: '2', played: '7' });
    const query = Object.fromEntries(new URLSearchParams(leagueQuery(config)));
    expect(parseLeagueConfig(query)).toEqual(config);
  });
});

describe('parseDropInConfig', () => {
  it('cannot report more no-shows than there were places', () => {
    // Somebody on the waitlist never had a place to fail to turn up for.
    const config = parseDropInConfig({ registered: '30', capacity: '12', noshows: '25' });
    expect(config.noShows).toBe(12);
  });

  it('round-trips through its own query string', () => {
    const config = parseDropInConfig({ registered: '24', capacity: '16', promoted: '1' });
    const query = Object.fromEntries(new URLSearchParams(dropInQuery(config)));
    expect(parseDropInConfig(query)).toEqual(config);
  });
});
