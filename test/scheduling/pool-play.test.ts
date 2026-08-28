/**
 * SKIPPED — specification for `generatePoolPlay`, which is not yet written.
 *
 * To implement: remove `.skip`, make it pass, delete the `NotImplementedError`
 * throw in `src/pool-play.ts`. Do not weaken an assertion to make it pass.
 *
 * Encodes audit findings H6 and H10 from scoopvolleyball's BACKEND_AUDIT.md.
 */

import { describe, expect, it } from 'vitest';
import { POOL_PLAY_ROUND_LABEL } from '@/lib/core';
import type { PoolPlayInput } from '@/lib/scheduling/pool-play';
import { generatePoolPlay } from '@/lib/scheduling/pool-play';

function input(
  teamsPerPool: number,
  poolCount: number,
  courts: number,
  slots: number,
): PoolPlayInput {
  const pools = Array.from({ length: poolCount }, (_, p) => ({
    id: `pool-${p}`,
    name: String.fromCharCode(65 + p),
    participantIds: Array.from({ length: teamsPerPool }, (_, t) => `p${p}-t${t + 1}`),
  }));
  return {
    competitionSlug: 'test-open',
    sessionId: 'sess-1',
    pools,
    courtIds: Array.from({ length: courts }, (_, c) => `court-${c + 1}`),
    timeslotIds: Array.from({ length: slots }, (_, s) => `ts-${s + 1}`),
    minRestSlots: 1,
  };
}

describe('generatePoolPlay', () => {
  it('generates a full round robin: n*(n-1)/2 matches per pool', () => {
    const out = generatePoolPlay(input(4, 2, 2, 12));
    // 4 teams -> 6 matches per pool, 2 pools -> 12
    expect(out.matches).toHaveLength(12);
  });

  it('pairs every participant with every other exactly once', () => {
    const out = generatePoolPlay(input(5, 1, 2, 12));
    const seen = new Set<string>();
    for (const m of out.matches) {
      const key = [m.homeParticipantId, m.awayParticipantId].sort().join('|');
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(10); // 5*4/2
  });

  it('never double-books a participant in the same timeslot', () => {
    const out = generatePoolPlay(input(4, 3, 3, 12));
    const bySlot = new Map<string, Set<string>>();
    for (const m of out.matches) {
      if (!m.timeslotId) continue;
      const busy = bySlot.get(m.timeslotId) ?? new Set<string>();
      for (const id of [m.homeParticipantId, m.awayParticipantId]) {
        if (!id) continue;
        expect(busy.has(id)).toBe(false);
        busy.add(id);
      }
      bySlot.set(m.timeslotId, busy);
    }
  });

  it('never double-books a court in the same timeslot', () => {
    const out = generatePoolPlay(input(4, 2, 2, 12));
    const seen = new Set<string>();
    for (const m of out.matches) {
      if (!m.courtId || !m.timeslotId) continue;
      const key = `${m.courtId}@${m.timeslotId}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  /**
   * AUDIT FINDING H6 — verified in scoopvolleyball.
   *
   * scoop's round-robin ordering handed team 1 of every pool n-1 consecutive
   * games at the start of the day, then nothing. Reproduced by execution in
   * the audit, not merely suspected.
   */
  it('H6: never gives a participant n-1 consecutive matches', () => {
    const out = generatePoolPlay(input(4, 2, 2, 12));

    const slotIndex = new Map<string, number>();
    for (const [i, ts] of [
      'ts-1',
      'ts-2',
      'ts-3',
      'ts-4',
      'ts-5',
      'ts-6',
      'ts-7',
      'ts-8',
      'ts-9',
      'ts-10',
      'ts-11',
      'ts-12',
    ].entries()) {
      slotIndex.set(ts, i);
    }

    const appearances = new Map<string, number[]>();
    for (const m of out.matches) {
      if (!m.timeslotId) continue;
      const i = slotIndex.get(m.timeslotId);
      if (i === undefined) continue;
      for (const id of [m.homeParticipantId, m.awayParticipantId]) {
        if (!id) continue;
        appearances.set(id, [...(appearances.get(id) ?? []), i]);
      }
    }

    for (const [participant, slots] of appearances) {
      const sorted = [...slots].sort((a, b) => a - b);
      let run = 1;
      let longestRun = 1;
      for (let i = 1; i < sorted.length; i++) {
        run = sorted[i]! === sorted[i - 1]! + 1 ? run + 1 : 1;
        longestRun = Math.max(longestRun, run);
      }
      expect(longestRun, `${participant} played ${longestRun} matches back to back`).toBeLessThan(
        3,
      );
    }
  });

  it('spreads each participant appearances across the day rather than front-loading', () => {
    const out = generatePoolPlay(input(4, 2, 2, 12));
    const firstHalf = out.matches.filter((m) => {
      const n = Number(m.timeslotId?.replace('ts-', '') ?? '0');
      return n <= 6;
    });
    // With 12 matches over 12 slots on 2 courts there is ample room; a
    // front-loading scheduler would pile everything into the first half.
    expect(firstHalf.length).toBeLessThanOrEqual(9);
  });

  /**
   * AUDIT FINDING H10 — multi-tier round labels broke every consumer.
   * Labels must be stable strings the UI can group on.
   */
  it('H10: labels every pool match consistently', () => {
    const out = generatePoolPlay(input(4, 2, 2, 12));
    for (const m of out.matches) {
      expect(m.roundLabel).toBe('Pool Play');
      expect(m.poolId).toBeTruthy();
    }
  });

  /**
   * The literal above pins the wire value; this pins that the constant every
   * consumer filters on is that same string.
   *
   * Both assertions are needed, and neither replaces the other. The
   * predecessor filtered standings on `round = 'Pool Play'` while its seed
   * data wrote `Pool A`: the query matched no rows, raised nothing, and the
   * standings table simply came out empty. Producer and consumer agreeing is
   * the property; a shared constant is only how it is kept.
   */
  it('labels pool matches with the constant consumers filter on', () => {
    const out = generatePoolPlay(input(4, 2, 2, 12));
    expect(out.matches.length).toBeGreaterThan(0);
    for (const m of out.matches) {
      expect(m.roundLabel).toBe(POOL_PLAY_ROUND_LABEL);
    }
  });

  it('reports matches it could not place rather than dropping them', () => {
    // 6 matches needed, only 2 slots x 1 court = 2 placements available.
    const out = generatePoolPlay(input(4, 1, 1, 2));
    expect(out.matches).toHaveLength(6);
    expect(out.unassigned.length).toBeGreaterThan(0);
    for (const id of out.unassigned) {
      const m = out.matches.find((x) => x.id === id);
      expect(m?.timeslotId ?? null).toBeNull();
    }
  });

  it('falls back to the slug as competitionId, and prefers a real id when given', () => {
    // Scheduling is pure and never reads a database, so a caller that already
    // knows the persisted competition id passes it through.
    const withoutId = generatePoolPlay(input(4, 1, 2, 12));
    expect(withoutId.matches[0]?.competitionId).toBe('test-open');

    const withId = generatePoolPlay({ ...input(4, 1, 2, 12), competitionId: 'comp-uuid-1' });
    expect(withId.matches[0]?.competitionId).toBe('comp-uuid-1');
  });

  /**
   * `minRestSlots` was accepted, documented, and then completely ignored —
   * every value produced an identical schedule. An API that quietly does
   * nothing is worse than one that is missing, because the caller believes
   * they configured something.
   */
  it('honours minRestSlots, and a larger value means a longer rest', () => {
    const gapsFor = (minRestSlots: number): number => {
      const out = generatePoolPlay({
        competitionSlug: 'test-open',
        sessionId: 'sess-1',
        pools: [{ id: 'p', name: 'A', participantIds: ['a', 'b', 'c', 'd'] }],
        courtIds: ['court-1'],
        timeslotIds: Array.from({ length: 30 }, (_, i) => `ts-${i}`),
        minRestSlots,
      });

      const appearances = new Map<string, number[]>();
      for (const m of out.matches) {
        const slot = Number(m.timeslotId?.replace('ts-', ''));
        if (Number.isNaN(slot)) continue;
        for (const id of [m.homeParticipantId, m.awayParticipantId]) {
          if (!id) continue;
          appearances.set(id, [...(appearances.get(id) ?? []), slot]);
        }
      }

      let smallest = Number.POSITIVE_INFINITY;
      for (const slots of appearances.values()) {
        const sorted = [...slots].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) {
          smallest = Math.min(smallest, sorted[i]! - sorted[i - 1]!);
        }
      }
      return smallest;
    };

    // Sitting out n slots means the next match is n+1 slots later.
    expect(gapsFor(0)).toBeGreaterThanOrEqual(1);
    expect(gapsFor(1)).toBeGreaterThanOrEqual(2);
    expect(gapsFor(2)).toBeGreaterThanOrEqual(3);
    expect(gapsFor(3)).toBeGreaterThanOrEqual(4);
  });

  /**
   * H6 again, at the size that actually breaks it. The original spec only
   * exercised a day with plenty of room; a tight day floor-divided the slack
   * away to a uniform gap of zero and everybody played three in a row.
   */
  it('H6: shares scarce slack rather than flooring it away', () => {
    // Three rounds needing one slot each, four slots available. One spare
    // slot exists — giving it to the first boundary caps runs at two.
    const out = generatePoolPlay(input(4, 1, 2, 4));

    const appearances = new Map<string, number[]>();
    for (const m of out.matches) {
      const slot = Number(m.timeslotId?.replace('ts-', ''));
      if (Number.isNaN(slot)) continue;
      for (const id of [m.homeParticipantId, m.awayParticipantId]) {
        if (!id) continue;
        appearances.set(id, [...(appearances.get(id) ?? []), slot]);
      }
    }

    for (const [who, slots] of appearances) {
      const sorted = [...slots].sort((a, b) => a - b);
      let run = 1;
      let longest = 1;
      for (let i = 1; i < sorted.length; i++) {
        run = sorted[i] === sorted[i - 1]! + 1 ? run + 1 : 1;
        longest = Math.max(longest, run);
      }
      expect(longest, `${who} ran ${longest} matches back to back`).toBeLessThan(3);
    }
  });

  it('H6: holds across every configuration the day has room for', () => {
    // A sweep rather than one size, because the original spec passed at its
    // own numbers while failing at 141 others.
    for (const teams of [4, 6, 8]) {
      for (const pools of [1, 2]) {
        for (const courts of [1, 2, 3]) {
          for (const slots of [12, 20, 30]) {
            const out = generatePoolPlay(input(teams, pools, courts, slots));
            const tag = `teams=${teams} pools=${pools} courts=${courts} slots=${slots}`;

            const appearances = new Map<string, number[]>();
            for (const m of out.matches) {
              const slot = Number(m.timeslotId?.replace('ts-', ''));
              if (Number.isNaN(slot)) continue;
              for (const id of [m.homeParticipantId, m.awayParticipantId]) {
                if (!id) continue;
                appearances.set(id, [...(appearances.get(id) ?? []), slot]);
              }
            }

            for (const [who, list] of appearances) {
              const sorted = [...list].sort((a, b) => a - b);
              let run = 1;
              let longest = 1;
              for (let i = 1; i < sorted.length; i++) {
                run = sorted[i] === sorted[i - 1]! + 1 ? run + 1 : 1;
                longest = Math.max(longest, run);
              }
              expect(longest, `${tag}: ${who} ran ${longest}`).toBeLessThan(3);
            }
          }
        }
      }
    }
  });

  it('never double-books a participant or a court, across configurations', () => {
    for (const teams of [3, 4, 5, 6, 8]) {
      for (const pools of [1, 2, 3]) {
        for (const courts of [1, 2, 4]) {
          const out = generatePoolPlay(input(teams, pools, courts, 30));
          const tag = `teams=${teams} pools=${pools} courts=${courts}`;

          // Every pairing appears exactly once.
          const expected = pools * ((teams * (teams - 1)) / 2);
          expect(out.matches, tag).toHaveLength(expected);

          const busy = new Map<string, Set<string>>();
          const courtUse = new Set<string>();
          for (const m of out.matches) {
            if (!m.timeslotId) continue;
            const occupied = busy.get(m.timeslotId) ?? new Set<string>();
            for (const id of [m.homeParticipantId, m.awayParticipantId]) {
              if (!id) continue;
              expect(occupied.has(id), `${tag}: ${id} double-booked`).toBe(false);
              occupied.add(id);
            }
            busy.set(m.timeslotId, occupied);

            if (m.courtId) {
              const key = `${m.courtId}@${m.timeslotId}`;
              expect(courtUse.has(key), `${tag}: ${key} clash`).toBe(false);
              courtUse.add(key);
            }
          }
        }
      }
    }
  });

  it('is deterministic — same input, same output', () => {
    const a = generatePoolPlay(input(4, 2, 2, 12));
    const b = generatePoolPlay(input(4, 2, 2, 12));
    expect(a.matches.map((m) => m.id)).toEqual(b.matches.map((m) => m.id));
  });
});
