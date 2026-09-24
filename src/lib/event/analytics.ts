/**
 * Aggregate, privacy-preserving page counts (#31): enough to see whether
 * anyone came back next week, and nothing that could follow a person.
 *
 * A path is reduced to its route pattern before it is counted — an event id,
 * a score token or an unsubscribe token never reaches the table — and the
 * count is per day. No cookie, no user, no referrer, no third party inside a
 * tool that holds player names.
 */
const PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/^\/e\/[^/]+(\/.*)?$/, '/e/[id]'],
  [/^\/score\/[^/]+$/, '/score/[token]'],
  [/^\/unsubscribe\/[^/]+$/, '/unsubscribe/[token]'],
  [/^\/events\/[^/]+(\/[^/]+)?$/, '/events/[id]'],
];

/** The route a path belongs to, or null for a path that is not counted. */
export function routePattern(path: string): string | null {
  const clean = path.split(/[?#]/)[0]?.replace(/\/+$/, '') || '/';
  for (const [pattern, name] of PATTERNS) if (pattern.test(clean)) return name;
  const known = [
    '/',
    '/tournaments',
    '/leagues',
    '/dropins',
    '/demo',
    '/demo/tournament',
    '/demo/league',
    '/demo/dropins',
    '/events',
    '/me',
    '/e',
  ];
  return known.includes(clean) ? clean : null;
}

/** The UTC day an instant falls on — the only time resolution kept. */
export const dayOf = (instant: string): string => new Date(instant).toISOString().slice(0, 10);
