'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import type { FormState } from '@/components/app/forms';
import { FormMessage, SubmitButton } from '@/components/app/forms';

/**
 * One wizard step. Saves on "Save and continue", then moves on — one step of
 * work at risk, never a keystroke of it, and never a step silently skipped
 * because a save failed: the message stays and the page does not move.
 */
export function StepForm({
  action,
  id,
  next,
  children,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  id: string;
  next: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, null);
  useEffect(() => {
    if (state?.ok && next && state.message !== undefined) router.push(next);
  }, [state, next, router]);
  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="id" value={id} />
      {children}
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-3">
        <SubmitButton pending="Saving…">{next ? 'Save and continue' : 'Save'}</SubmitButton>
      </div>
    </form>
  );
}
