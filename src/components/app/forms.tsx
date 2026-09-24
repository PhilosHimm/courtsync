'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

/**
 * Forms for the signed-in app. Server actions do the work; these render the
 * fields and say what happened.
 *
 * Every control has a visible label tied to it (PRODUCT.md's accessibility
 * commitment), errors are announced with role="alert", and saves are
 * announced with role="status" — a result that only turns something green is
 * a result a screen reader never hears.
 */

export const INPUT =
  'w-full rounded-sm border border-hairline bg-canvas px-3 py-2 text-body text-ink focus-visible:border-primary';

export type FormState =
  | { ok: true; message?: string; data?: unknown }
  | { ok: false; message: string }
  | null;

export function ActionForm({
  action,
  children,
  className,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className ?? 'flex flex-col gap-4'}>
      {children}
      <FormMessage state={state} />
    </form>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (!state) return null;
  if (!state.ok) {
    return (
      <p
        role="alert"
        className="rounded-sm border border-hairline bg-parchment px-4 py-3 text-caption text-ink"
      >
        <span className="text-caption-strong">Not saved. </span>
        {state.message}
      </p>
    );
  }
  return state.message ? (
    <p role="status" className="text-caption text-ink-muted-80">
      {state.message}
    </p>
  ) : null;
}

export function SubmitButton({
  children,
  pending,
  variant = 'primary',
  name,
  value,
}: {
  children: React.ReactNode;
  pending?: string;
  variant?: 'primary' | 'secondary' | 'utility' | 'danger';
  name?: string;
  value?: string;
}) {
  const status = useFormStatus();
  const styles = {
    primary: 'bg-primary text-on-dark rounded-full px-[22px] py-[11px] text-body',
    secondary: 'border border-primary text-primary rounded-full px-[22px] py-[11px] text-body',
    utility: 'bg-ink text-on-dark rounded-sm px-[15px] py-2 text-button-utility',
    danger: 'border border-ink text-ink rounded-full px-[22px] py-[11px] text-body',
  }[variant];
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={status.pending}
      aria-disabled={status.pending}
      className={`inline-flex items-center justify-center whitespace-nowrap transition-transform duration-150 active:scale-95 disabled:opacity-60 ${styles}`}
    >
      {status.pending ? (pending ?? 'Saving…') : children}
    </button>
  );
}
