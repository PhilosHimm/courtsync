/**
 * The smallest surface the data layer needs from a Postgres client.
 *
 * Both `Pool` from `@neondatabase/serverless` (production) and `Pool` from
 * `pg` (the test suite, against a real local Postgres) satisfy it — Neon's
 * driver is a drop-in for `pg` by design. This is a type, not a repository
 * layer: queries are written directly against it, as docs/DECISIONS.md
 * settled ("Direct queries, no layer").
 */
export interface QueryResultLike<R> {
  rows: R[];
  rowCount: number | null;
}

export interface Queryable {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResultLike<R>>;
}

export interface PoolClientLike extends Queryable {
  release(): void;
}

export interface Db extends Queryable {
  connect(): Promise<PoolClientLike>;
}
