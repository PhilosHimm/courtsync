import type { AppUser } from '@/lib/core';
import type { Actor } from '@/lib/db/authz';
import type { NewEventInput } from '@/lib/db/events';
import type { Db } from '@/lib/db/types';
import { upsertUser } from '@/lib/db/users';

export async function user(db: Db, name: string): Promise<AppUser & { actor: Actor }> {
  const u = await upsertUser(db, {
    authUserId: `auth-${name}`,
    email: `${name}@example.invalid`,
    displayName: name,
  });
  return { ...u, actor: { userId: u.id } };
}

export const tournamentInput = (overrides: Partial<NewEventInput> = {}): NewEventInput => ({
  name: 'Spring Open',
  format: 'tournament',
  timeZone: 'America/Toronto',
  venue: { name: 'Riverside Gym' },
  gameDurationMin: 45,
  bufferMin: 15,
  poolCount: 2,
  bracketTiers: ['gold'],
  minRestMin: 0,
  courts: ['Court 1', 'Court 2'],
  sessions: [{ playDate: '2026-07-04', startTime: '09:00', endTime: '17:00' }],
  participants: ['Spikers', 'Blockheads', 'Dig Deep', 'Setters', 'Aces', 'Net Gains', 'Side Out', 'Libero Club'].map(
    (name, i) => ({ name, seed: i + 1 }),
  ),
  ...overrides,
});
