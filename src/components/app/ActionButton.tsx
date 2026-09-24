'use client';

import type { FormState } from './forms';
import { ActionForm, SubmitButton } from './forms';

/** One button that posts a few hidden fields to a server action and says what happened. */
export function ActionButton({
  action,
  fields,
  label,
  pending,
  variant = 'secondary',
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  fields: Record<string, string>;
  label: string;
  pending?: string;
  variant?: 'primary' | 'secondary' | 'utility' | 'danger';
}) {
  return (
    <ActionForm action={action} className="flex flex-col items-start gap-2">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SubmitButton variant={variant} {...(pending ? { pending } : {})}>
        {label}
      </SubmitButton>
    </ActionForm>
  );
}
