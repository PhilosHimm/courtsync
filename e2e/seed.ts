/**
 * The database the end-to-end suite runs against: rebuilt from sql/ on every
 * run, then filled through the real data layer — the same functions the app
 * calls — so the pages under test show data the app itself wrote.
 *
 * Organizer flows need a Neon Auth session, which this suite cannot mint
 * without a real Neon Auth project; they are covered against Postgres by
 * `npm run test:db`. What this suite covers is everything a person without
 * an account touches: public pages, the scorekeeper's link, sign-in, the
 * demo — in a real browser, with axe.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import pg from 'pg';
import { createEvent, loadEvent, transitionEvent } from '@/lib/db/events';
import { addWalkIn } from '@/lib/db/people';
import { generateSchedule, seedPlayoffs } from '@/lib/db/schedule';
import { issueScoreLink, recordScore } from '@/lib/db/scores';
import type { Db } from '@/lib/db/types';
import { upsertUser } from '@/lib/db/users';

export const E2E_DB = 'courtsync_e2e';
export const SEED_FILE = 'e2e/.seed.json';

export default async function seed(): Promise<void> {
  const admin = process.env.TEST_DATABASE_URL;
  if (!admin)
    throw new Error(
      'TEST_DATABASE_URL is not set. The end-to-end suite needs a Postgres it may create a database on.',
    );
  const client = new pg.Client({ connectionString: admin });
  await client.connect();
  await client.query(`drop database if exists ${E2E_DB} with (force)`);
  await client.query(`create database ${E2E_DB}`);
  await client.end();

  const url = new URL(admin);
  url.pathname = `/${E2E_DB}`;
  const pool = new pg.Pool({ connectionString: url.toString() });
  for (const name of readdirSync('sql')
    .filter((n) => n.endsWith('.sql'))
    .sort()) {
    await pool.query(readFileSync(`sql/${name}`, 'utf8'));
  }
  const db = pool as unknown as Db;
  const owner = await upsertUser(db, {
    authUserId: 'e2e-owner',
    email: 'owner@example.invalid',
    displayName: 'Owner',
  });
  const actor = { userId: owner.id };
  const now = '2026-07-04T14:00:00.000Z';

  const tournament = await createEvent(db, actor, {
    name: 'E2E Open',
    format: 'tournament',
    description: 'A tournament the end-to-end suite plays.',
    timeZone: 'America/Toronto',
    venue: { name: 'Riverside Gym' },
    gameDurationMin: 45,
    bufferMin: 15,
    poolCount: 2,
    bracketTiers: ['gold'],
    minRestMin: 0,
    courts: ['Court 1', 'Court 2'],
    sessions: [{ playDate: '2026-07-04', startTime: '09:00', endTime: '21:00' }],
    participants: [
      'Spikers',
      'Blockheads',
      'Dig Deep',
      'Setters',
      'Aces',
      'Net Gains',
      'Side Out',
      'Libero Club',
    ].map((name, i) => ({
      name,
      seed: i + 1,
      players: i === 0 ? ['Jordan Lee', 'Sam Rivera'] : [],
    })),
  });
  await generateSchedule(db, actor, tournament);
  let event = await loadEvent(db, actor, tournament);
  for (const m of event.matches) {
    const homeWins = (m.homeParticipantId ?? '') < (m.awayParticipantId ?? '');
    await recordScore(
      db,
      { kind: 'organizer', actor },
      tournament,
      m.id,
      homeWins
        ? [
            { home: 21, away: 15 },
            { home: 21, away: 17 },
          ]
        : [
            { home: 15, away: 21 },
            { home: 17, away: 21 },
          ],
      { now },
    );
  }
  await seedPlayoffs(db, actor, tournament);
  event = await loadEvent(db, actor, tournament);
  const q1 = event.matches.find((m) => m.roundLabel === 'q1');
  if (!q1) throw new Error('Seeding produced no q1.');
  const { token } = await issueScoreLink(db, actor, tournament, q1.id, now);
  await transitionEvent(db, actor, tournament, 'publish', now);

  const dropin = await createEvent(db, actor, {
    name: 'E2E Thursday',
    format: 'dropin',
    timeZone: 'America/Toronto',
    gameDurationMin: 20,
    bufferMin: 0,
    capacity: 12,
    playersPerSide: 6,
    courts: ['Court 1'],
    sessions: [{ playDate: '2026-07-09', startTime: '19:00', endTime: '21:00' }],
    participants: [],
  });
  const night = (await loadEvent(db, actor, dropin)).sessions[0];
  if (!night) throw new Error('No night.');
  await addWalkIn(db, actor, dropin, night.id, 'Jordan Lee', now);
  await transitionEvent(db, actor, dropin, 'publish', now);

  const draft = await createEvent(db, actor, {
    name: 'E2E Draft',
    format: 'league',
    timeZone: 'UTC',
    gameDurationMin: 50,
    bufferMin: 10,
    courts: ['Court 1'],
    sessions: [{ playDate: '2026-09-01', startTime: '19:00', endTime: '22:00' }],
    participants: [{ name: 'Only Team' }],
  });

  await pool.end();
  writeFileSync(
    SEED_FILE,
    JSON.stringify({ tournament, dropin, draft, token, q1: q1.id }, null, 2),
  );
}
