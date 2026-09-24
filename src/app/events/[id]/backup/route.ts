import { actorOf, currentUser } from '@/lib/auth/server';
import { exportEvent } from '@/lib/db/backup';
import { getDb } from '@/lib/db/client';
import { NotFoundError } from '@/lib/db/errors';

/** The whole event as a JSON download (#19). Organizers only — checked in the data layer. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return new Response('Sign in first.', { status: 401 });
  try {
    const backup = await exportEvent(await getDb(), actorOf(user), id, new Date().toISOString());
    const name = `${backup.event.competition.slug}-${backup.exportedAt.slice(0, 10)}.courtsync.json`;
    return new Response(JSON.stringify(backup, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof NotFoundError) return new Response('Not found.', { status: 404 });
    throw error;
  }
}
