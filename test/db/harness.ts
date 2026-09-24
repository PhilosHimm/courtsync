/**
 * A real Postgres for the data-layer suites.
 *
 * Every suite gets its own database, cloned from a template that has every
 * migration in sql/ applied in order — the same files, in the same order, a
 * deploy applies. No mocks: the point of these suites is that the SQL is
 * right, and a mock of Postgres can only agree with whoever wrote it.
 *
 * TEST_DATABASE_URL must point at a Postgres the suite may create databases
 * on. It is never defaulted (rule 7 applies to test infrastructure too): run
 * `npm run test:db` with it set, or not at all. CI sets it to a throwaway
 * service container.
 */

import { createHash, randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { Db } from '@/lib/db/types';

const sqlDir = fileURLToPath(new URL('../../sql/', import.meta.url));

function adminUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. The data-layer suites run against a real Postgres; see docs/SETUP.md.',
    );
  }
  return url;
}

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

const migrations = () =>
  readdirSync(sqlDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(`${sqlDir}${name}`, 'utf8') }));

/** Template name derived from the migrations' content, so an edited migration gets a new template. */
function templateName(): string {
  const hash = createHash('sha256');
  for (const { name, sql } of migrations()) hash.update(name).update(sql);
  return `courtsync_tmpl_${hash.digest('hex').slice(0, 12)}`;
}

async function ensureTemplate(admin: pg.Client, template: string): Promise<void> {
  // Suites run in parallel workers; one builds the template, the rest wait.
  await admin.query('select pg_advisory_lock(424242)');
  try {
    const { rowCount } = await admin.query('select 1 from pg_database where datname = $1', [
      template,
    ]);
    if (rowCount) return;
    await admin.query(`create database ${template}`);
    const client = new pg.Client({ connectionString: withDatabase(adminUrl(), template) });
    await client.connect();
    try {
      for (const { name, sql } of migrations()) {
        try {
          await client.query('begin');
          await client.query(sql);
          await client.query('commit');
        } catch (error) {
          await client.query('rollback');
          throw new Error(`Migration ${name} failed: ${(error as Error).message}`);
        }
      }
    } finally {
      await client.end();
    }
  } finally {
    await admin.query('select pg_advisory_unlock(424242)');
  }
}

export interface TestDatabase {
  db: Db;
  /** Raw pool, for assertions that read the tables directly. */
  pool: pg.Pool;
  drop(): Promise<void>;
}

export async function freshDatabase(): Promise<TestDatabase> {
  const url = adminUrl();
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  const template = templateName();
  const name = `courtsync_test_${randomBytes(6).toString('hex')}`;
  try {
    await ensureTemplate(admin, template);
    await admin.query(`create database ${name} template ${template}`);
  } finally {
    await admin.end();
  }

  const pool = new pg.Pool({ connectionString: withDatabase(url, name), max: 4 });
  return {
    db: pool as unknown as Db,
    pool,
    async drop() {
      await pool.end();
      const cleanup = new pg.Client({ connectionString: url });
      await cleanup.connect();
      try {
        await cleanup.query(`drop database if exists ${name} with (force)`);
      } finally {
        await cleanup.end();
      }
    },
  };
}
