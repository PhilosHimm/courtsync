/**
 * SKIPPED — specification for `generatePoolPlay`, which is not yet written.
 *
 * To implement: remove `.skip`, make it pass, delete the `NotImplementedError`
 * throw in `src/pool-play.ts`. Do not weaken an assertion to make it pass.
 *
 * Encodes audit findings H6 and H10 from scoopvolleyball's BACKEND_AUDIT.md.
 */

import { describe, expect, it } from 'vitest';
import type { PoolPlayInput } from '../src/pool-play';
import { generatePoolPlay } from '../src/pool-play';

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

describe.skip('generatePoolPlay', () => {
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

  it('is deterministic — same input, same output', () => {
    const a = generatePoolPlay(input(4, 2, 2, 12));
    const b = generatePoolPlay(input(4, 2, 2, 12));
    expect(a.matches.map((m) => m.id)).toEqual(b.matches.map((m) => m.id));
  });
});
