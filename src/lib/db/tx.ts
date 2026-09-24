import type { Db, Queryable } from './types';

/**
 * Run `work` in one transaction: all of it, or none of it (rule 5).
 *
 * The predecessor had no transactions anywhere, and a partial write could
 * destroy a participant's name (H3). Every multi-statement write in this
 * package goes through here. `work` receives the transaction's client and
 * must use it, not the pool — a query on the pool runs outside the
 * transaction and would commit on its own.
 */
export async function withTransaction<T>(db: Db, work: (tx: Queryable) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
