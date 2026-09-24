import 'server-only';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { actorOf, currentUser, requireUser } from '@/lib/auth/server';
import type { AppUser } from '@/lib/core';
import { getDb } from '@/lib/db/client';
import { NotFoundError } from '@/lib/db/errors';
import { loadEvent } from '@/lib/db/events';
import type { EventSnapshot } from '@/lib/event/snapshot';

/**
 * Per-request loaders for pages. `cache` makes a layout and the page under it
 * share one load rather than making two. These only read; every write goes
 * through a server action, which checks authorization in the data layer.
 */

export const signedInUser = cache(async (): Promise<AppUser | null> => currentUser());

/** The event, for somebody who runs it — or a 404 for anyone else. */
export const organizerEvent = cache(
  async (id: string): Promise<{ user: AppUser; event: EventSnapshot }> => {
    const user = await requireUser(`/events/${id}`);
    try {
      return { user, event: await loadEvent(await getDb(), actorOf(user), id) };
    } catch (error) {
      if (error instanceof NotFoundError) notFound();
      throw error;
    }
  },
);
