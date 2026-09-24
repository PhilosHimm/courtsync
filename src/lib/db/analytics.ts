import { dayOf, routePattern } from '@/lib/event/analytics';
import type { Queryable } from './types';

/** Count one view of a route, for today. Never stores the path as given. */
export async function countView(q: Queryable, path: string, now: string): Promise<void> {
  const route = routePattern(path);
  if (!route) return;
  await q.query(
    `insert into page_view_daily (day, path, views) values ($1::date, $2, 1)
     on conflict (day, path) do update set views = page_view_daily.views + 1`,
    [dayOf(now), route],
  );
}

/** Daily counts for the last `days` days, for whoever runs the deployment. */
export async function viewsByDay(
  q: Queryable,
  days = 56,
): Promise<Array<{ day: string; path: string; views: number }>> {
  const { rows } = await q.query<{ day: string; path: string; views: number }>(
    `select day::text as day, path, views from page_view_daily
      where day >= current_date - $1::int order by day desc, path`,
    [days],
  );
  return rows;
}
