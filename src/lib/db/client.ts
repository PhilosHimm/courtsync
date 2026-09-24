import { neonConfig, Pool } from '@neondatabase/serverless';
import { serverEnv } from './env';
import type { Db } from './types';

/**
 * The one database handle, created on first use.
 *
 * Neon serverless over WebSockets rather than its HTTP query function,
 * because multi-statement writes run in a transaction (rule 5) and the HTTP
 * function cannot hold one open across a read and a dependent write.
 * Node 22 has a global WebSocket; Node 20 — the engines floor — does not, so
 * `ws` fills in.
 *
 * A DATABASE_URL on this machine (localhost) gets plain `pg` over TCP
 * instead: Neon's driver speaks to Neon's WebSocket proxy, which a local
 * Postgres does not run. That is what lets the end-to-end suite drive the
 * real app against a real database. The two drivers share one API by design,
 * and it changes nothing about who may do what — authorization is in the
 * queries, not the driver.
 */
let pool: Promise<Db> | undefined;

const LOCAL = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

async function connect(): Promise<Db> {
  const url = serverEnv().databaseUrl;
  if (LOCAL.has(new URL(url).hostname)) {
    const { default: pg } = await import('pg');
    return new pg.Pool({ connectionString: url, max: 5 }) as unknown as Db;
  }
  if (typeof globalThis.WebSocket === 'undefined') {
    const { default: ws } = await import('ws');
    neonConfig.webSocketConstructor = ws;
  }
  return new Pool({ connectionString: url }) as unknown as Db;
}

export function getDb(): Promise<Db> {
  pool ??= connect();
  return pool;
}
