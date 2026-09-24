/**
 * Specification for whole-event backup, restore and duplicate (#19).
 */

import { describe, expect, it } from 'vitest';
import {
  BackupError,
  duplicateSource,
  parseBackup,
  reidentify,
  toBackup,
} from '@/lib/event/backup';
import { planPoolDraw, planPoolPlay } from '@/lib/event/engine';
import type { EventSnapshot } from '@/lib/event/snapshot';
import { advanceBracket, playoffMatchId } from '@/lib/scheduling';
import { decide, snapshotOf } from './snapshot-fixture';

function rich(): EventSnapshot {
  const base = snapshotOf();
  const pools = planPoolDraw(base).pools.map((p, i) => ({ ...p, id: `pool-${i}` }));
  const withPools = { ...base, pools };
  const matches = planPoolPlay(withPools).matches.map((m, i) => (i === 0 ? decide(m, true) : m));
  return {
    ...withPools,
    competition: {
      ...withPools.competition,
      createdBy: 'user-1',
      status: 'published',
      publishedAt: '2026-06-02T00:00:00.000Z',
    },
    matches,
    transactions: [
      {
        id: 'tx-1',
        participantId: 'team-01',
        type: 'payment',
        amount: 40,
        processedAt: '2026-06-01T00:00:00Z',
        processedBy: 'user-1',
      },
    ],
    scoreEdits: [
      {
        id: 'e-1',
        matchId: matches[0]!.id,
        setNumber: 1,
        previousHome: null,
        previousAway: null,
        nextHome: 21,
        nextAway: 15,
        editedAt: '2026-07-04T14:00:00Z',
        viaLinkId: 'link-9',
      },
    ],
    teamPlayers: [{ id: 'tp-1', participantId: 'team-01', name: 'Jordan Lee' }],
  };
}

let counter = 0;
const newId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

describe('parseBackup', () => {
  it('reads back exactly what toBackup wrote', () => {
    const snapshot = rich();
    expect(parseBackup(JSON.stringify(toBackup(snapshot, '2026-07-05T00:00:00Z')))).toEqual(
      snapshot,
    );
  });

  it('refuses a file that is not a CourtSync backup, saying why', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError);
    expect(() => parseBackup('{"format":"something-else"}')).toThrow(/not marked/);
    expect(() => parseBackup(JSON.stringify({ ...toBackup(rich(), 'x'), version: 99 }))).toThrow(
      /version 99/,
    );
  });

  it('refuses a match that does not belong to the event it claims', () => {
    const backup = toBackup(rich(), 'x');
    backup.event.matches[0] = { ...backup.event.matches[0]!, id: 'someone-else-pool-a-1' };
    expect(() => parseBackup(JSON.stringify(backup))).toThrow(/does not belong/);
  });
});

describe('reidentify', () => {
  const source = rich();
  const copy = reidentify(source, { slug: 'spring-open-2', newId });

  it('gives every row a new id and keeps every reference pointing at the right new row', () => {
    const oldIds = new Set([
      source.competition.id,
      ...source.participants.map((p) => p.id),
      ...source.courts.map((c) => c.id),
      ...source.timeslots.map((t) => t.id),
    ]);
    for (const p of copy.participants) expect(oldIds.has(p.id)).toBe(false);
    const participantIds = new Set(copy.participants.map((p) => p.id));
    const slotIds = new Set(copy.timeslots.map((t) => t.id));
    for (const m of copy.matches) {
      expect(participantIds.has(m.homeParticipantId!)).toBe(true);
      expect(slotIds.has(m.timeslotId!)).toBe(true);
    }
    expect(copy.pools.flatMap((p) => p.participantIds).every((id) => participantIds.has(id))).toBe(
      true,
    );
  });

  it('moves every match key to the new slug, so the bracket still finds its matches', () => {
    expect(copy.matches.every((m) => m.id.startsWith('spring-open-2-'))).toBe(true);
    expect(copy.scoreEdits[0]!.matchId).toBe(copy.matches[0]!.id);
    const bracket = [
      {
        id: playoffMatchId('spring-open-2', 'gold', 'q1'),
        competitionId: 'x',
        sessionId: 's',
        status: 'scheduled' as const,
        sets: [],
      },
    ];
    expect(
      advanceBracket({ competitionSlug: 'spring-open-2', tier: 'gold', matches: bracket }),
    ).toHaveLength(1);
  });

  it('restores as a private draft, forgetting people from the other database', () => {
    expect(copy.competition.status).toBe('draft');
    expect(copy.competition.createdBy).toBeUndefined();
    expect(copy.competition.publishedAt).toBeUndefined();
    expect(copy.transactions[0]!.processedBy).toBeUndefined();
    expect(copy.scoreEdits[0]!.viaLinkId).toBeUndefined();
  });

  it('keeps results and history', () => {
    expect(copy.matches[0]!.sets.map((s) => s.homePoints)).toEqual(
      source.matches[0]!.sets.map((s) => s.homePoints),
    );
    expect(copy.scoreEdits).toHaveLength(1);
  });

  it('does not mutate the source', () => {
    const before = JSON.stringify(source);
    reidentify(source, { slug: 'z', newId });
    expect(JSON.stringify(source)).toBe(before);
  });
});

describe('duplicateSource', () => {
  const dup = duplicateSource(rich(), 'Spring Open 2027');

  it('carries teams, rosters, courts, days and settings', () => {
    expect(dup.competition.name).toBe('Spring Open 2027');
    expect(dup.participants).toHaveLength(8);
    expect(dup.teamPlayers).toHaveLength(1);
    expect(dup.courts).toHaveLength(2);
    expect(dup.timeslots.length).toBeGreaterThan(0);
  });

  it('drops last season’s seeds, results, pools, payments and history', () => {
    expect(dup.participants.every((p) => p.seed === undefined)).toBe(true);
    expect([
      dup.pools,
      dup.matches,
      dup.transactions,
      dup.scoreEdits,
      dup.attendance,
      dup.announcements,
    ]).toEqual([[], [], [], [], [], []]);
  });
});
