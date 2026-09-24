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
 */
let pool: Pool | undefined;

export async function getDb(): Promise<Db> {
  if (!pool) {
    if (typeof globalThis.WebSocket === 'undefined') {
      const { default: ws } = await import('ws');
      neonConfig.webSocketConstructor = ws;
    }
    pool = new Pool({ connectionString: serverEnv().databaseUrl });
  }
  return pool as unknown as Db;
}
