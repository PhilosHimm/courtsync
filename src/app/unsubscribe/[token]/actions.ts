'use server';

import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { unsubscribe } from '@/lib/db/notify';

export async function confirmUnsubscribe(form: FormData): Promise<void> {
  const token = String(form.get('token') ?? '');
  const done = await unsubscribe(await getDb(), token, new Date().toISOString());
  redirect(`/unsubscribe/${encodeURIComponent(token)}?done=${done ? '1' : '0'}`);
}
