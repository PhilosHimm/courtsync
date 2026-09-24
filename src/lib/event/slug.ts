/**
 * A URL-safe slug from an event name, unique among the names already taken.
 *
 * The slug feeds every match id `match-ids.ts` mints, and slugs are unique
 * per owner (sql/0002), so this only has to avoid the owner's own events.
 * Accents are folded rather than dropped — "Été" becomes "ete", not "t".
 */
export function slugify(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  return base || 'event';
}

export function uniqueSlug(name: string, taken: ReadonlySet<string>): string {
  const base = slugify(name);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
