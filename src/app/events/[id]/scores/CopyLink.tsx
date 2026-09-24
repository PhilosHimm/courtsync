'use client';

import { useActionState } from 'react';
import type { FormState } from '@/components/app/forms';
import { FormMessage, SubmitButton } from '@/components/app/forms';

/** Issue a score link and show it once — the token is never stored and cannot be shown again. */
export function CopyLink({
  action,
  id,
  match,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  id: string;
  match: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const url = state?.ok && typeof state.data === 'string' ? state.data : null;
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="match" value={match} />
      <div>
        <SubmitButton variant="secondary" pending="Issuing…">
          {url ? 'Issue another' : 'Issue score link'}
        </SubmitButton>
      </div>
      {url && (
        <div className="flex flex-col gap-2">
          <label htmlFor={`link-${match}`} className="text-caption-strong">
            Score link — copy it now, it will not be shown again
          </label>
          <input
            id={`link-${match}`}
            readOnly
            value={url}
            className="w-full rounded-sm border border-hairline bg-pearl px-3 py-2 text-caption"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            className="self-start rounded-sm bg-ink px-[15px] py-2 text-button-utility text-on-dark"
            onClick={() => void navigator.clipboard?.writeText(url)}
          >
            Copy
          </button>
        </div>
      )}
      <FormMessage
        state={
          state?.ok ? { ok: true, ...(state.message ? { message: state.message } : {}) } : state
        }
      />
    </form>
  );
}
