/**
 * Converting what Postgres returns into what the domain types hold.
 *
 * Drivers disagree on shapes — a timestamptz is a `Date` from `pg` and may be
 * a string elsewhere; `numeric` is a string so money is never a float on the
 * way out. Queries select `date` and `time` columns as text (`::text`) so
 * nothing ever converts them through a local-midnight `Date`.
 */

/** An absolute instant as an ISO string, whatever the driver handed back. */
export function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  throw new Error(`Expected a timestamp, got ${String(value)}.`);
}

export function isoOrUndefined(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : iso(value);
}

/** `time` as HH:mm. Postgres sends HH:mm:ss. */
export function clock(value: unknown): string {
  if (typeof value !== 'string') throw new Error(`Expected a time, got ${String(value)}.`);
  return value.slice(0, 5);
}

/** `numeric` → number, for display and arithmetic on amounts already validated. */
export function money(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) throw new Error(`Expected an amount, got ${String(value)}.`);
  return n;
}

/** Drop undefined keys, so optional fields are absent rather than present-and-undefined. */
export function compact<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== null),
  ) as T;
}
