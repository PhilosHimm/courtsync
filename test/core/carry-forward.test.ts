/**
 * SKIPPED — specification for `carryForwardParticipants`.
 *
 * A league convener runs a season a term and the same twenty teams come back.
 * `Participant` is scoped to a competition, so those are new rows every time,
 * and retyping them is the tedious part of setting up week one.
 *
 * The decision this encodes (docs/DECISIONS.md): copy the rows forward, do not
 * give teams a shared identity across competitions. A team that plays four
 * seasons is four independent rows — which keeps renaming or dropping a team
 * a decision about this season only, and keeps CourtSync clear of the team
 * histories and player profiles SCOPE.md rules out.
 */

import { describe, expect, it } from 'vitest';
import type { Participant } from '@/lib/core';
import { carryForwardParticipants } from '@/lib/core';

const spring: Participant[] = [
  {
    id: 'p-spikeadelic',
    competitionId: 'comp-spring-2026',
    kind: 'team',
    name: 'Spikeadelic',
    seed: 1,
    contactName: 'Rui',
    contactEmail: 'rui@example.test',
    contactPhone: '555-0101',
    registeredAt: '2026-01-04T18:00:00Z',
    notes: 'Prefers the late slot',
  },
  {
    id: 'p-block-party',
    competitionId: 'comp-spring-2026',
    kind: 'team',
    name: 'Block Party',
    seed: 2,
    registeredAt: '2026-01-05T09:30:00Z',
  },
];

describe('carryForwardParticipants', () => {
  it('brings every team across', () => {
    const carried = carryForwardParticipants(spring, 'comp-fall-2026');
    expect(carried).toHaveLength(2);
    expect(carried.map((p) => p.name)).toEqual(['Spikeadelic', 'Block Party']);
  });

  it('points every copy at the new competition', () => {
    const carried = carryForwardParticipants(spring, 'comp-fall-2026');
    for (const participant of carried) {
      expect(participant.competitionId).toBe('comp-fall-2026');
    }
  });

  it('carries the contact details, which is the retyping worth avoiding', () => {
    const [spikeadelic] = carryForwardParticipants(spring, 'comp-fall-2026');
    expect(spikeadelic?.contactName).toBe('Rui');
    expect(spikeadelic?.contactEmail).toBe('rui@example.test');
    expect(spikeadelic?.contactPhone).toBe('555-0101');
    expect(spikeadelic?.notes).toBe('Prefers the late slot');
  });

  it('keeps a team kind rather than assuming everything is a team', () => {
    const dropIn: Participant[] = [
      {
        id: 'p-ana',
        competitionId: 'comp-thursday',
        kind: 'individual',
        name: 'Ana',
        registeredAt: '2026-02-05T18:00:00Z',
      },
    ];
    expect(carryForwardParticipants(dropIn, 'comp-thursday-2')[0]?.kind).toBe('individual');
  });

  /**
   * The important omission. `drawPools` reads `seed`, so a seed carried
   * forward would shape a new pool draw with a ranking nobody re-entered —
   * a remembered number outliving the results behind it, which is the shape
   * of H9.
   */
  it('does not carry the seed forward', () => {
    const carried = carryForwardParticipants(spring, 'comp-fall-2026');
    for (const participant of carried) {
      expect(participant).not.toHaveProperty('seed');
    }
  });

  it('does not carry an id — the new rows are not the old rows', () => {
    const carried = carryForwardParticipants(spring, 'comp-fall-2026');
    for (const participant of carried) {
      expect(participant).not.toHaveProperty('id');
    }
  });

  it('does not carry registeredAt — a copy made today did not register in spring', () => {
    const carried = carryForwardParticipants(spring, 'comp-fall-2026');
    for (const participant of carried) {
      expect(participant).not.toHaveProperty('registeredAt');
    }
  });

  it('omits absent optional fields rather than writing undefined into them', () => {
    const [, blockParty] = carryForwardParticipants(spring, 'comp-fall-2026');
    expect(blockParty).toEqual({
      competitionId: 'comp-fall-2026',
      kind: 'team',
      name: 'Block Party',
    });
  });

  it('handles an empty roster of teams', () => {
    expect(carryForwardParticipants([], 'comp-fall-2026')).toEqual([]);
  });

  it('is deterministic and does not mutate its input', () => {
    const before = structuredClone(spring);
    expect(carryForwardParticipants(spring, 'comp-fall-2026')).toEqual(
      carryForwardParticipants(spring, 'comp-fall-2026'),
    );
    expect(spring).toEqual(before);
  });
});
