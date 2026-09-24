'use server';

import { revalidatePath } from 'next/cache';
import type { FormState } from '@/components/app/forms';
import { now, run, text } from '@/lib/app/action';
import { requireUser } from '@/lib/auth/server';
import { getDb } from '@/lib/db/client';
import { checkInSelf, follow, joinDropIn, leaveDropIn, unfollow } from '@/lib/db/people';

/** A player's own actions on a public page. Each acts only for the signed-in person. */

export async function joinAction(_: FormState, form: FormData): Promise<FormState> {
  const id = text(form, 'id');
  const user = await requireUser(`/e/${id}`);
  const state = await run(async () => {
    const r = await joinDropIn(await getDb(), user, id, text(form, 'session'), now());
    return r.status === 'waitlist'
      ? `You are on the waitlist, number ${r.waitlistPos}. You will be told if a place opens.`
      : 'You are in.';
  });
  revalidatePath(`/e/${id}`);
  return state;
}

export async function leaveAction(_: FormState, form: FormData): Promise<FormState> {
  const id = text(form, 'id');
  const user = await requireUser(`/e/${id}`);
  const state = await run(async () => {
    await leaveDropIn(await getDb(), user, id, text(form, 'session'), now());
    return 'You have left. Your place goes to the next person waiting.';
  });
  revalidatePath(`/e/${id}`);
  return state;
}

export async function checkInAction(_: FormState, form: FormData): Promise<FormState> {
  const id = text(form, 'id');
  const user = await requireUser(`/e/${id}`);
  const state = await run(async () => {
    await checkInSelf(await getDb(), user, id, text(form, 'session'), now());
    return 'Checked in.';
  });
  revalidatePath(`/e/${id}`);
  return state;
}

export async function followAction(_: FormState, form: FormData): Promise<FormState> {
  const id = text(form, 'id');
  const user = await requireUser(`/e/${id}`);
  const state = await run(async () => {
    if (text(form, 'mode') === 'unfollow') {
      await unfollow(await getDb(), user, text(form, 'participant'));
      return 'Unfollowed.';
    }
    await follow(await getDb(), user, text(form, 'participant'));
    return 'Following. Their matches are on your schedule.';
  });
  revalidatePath(`/e/${id}`);
  return state;
}
