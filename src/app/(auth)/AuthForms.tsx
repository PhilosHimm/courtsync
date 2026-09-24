'use client';

import Link from 'next/link';
import { ActionForm, INPUT, SubmitButton } from '@/components/app/forms';
import { requestResetAction, resetPasswordAction, signInAction, signUpAction } from './actions';

function Email() {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="email" className="text-caption-strong">
        Email
      </label>
      <input id="email" name="email" type="email" autoComplete="email" required className={INPUT} />
    </div>
  );
}

function Password({ autoComplete, label = 'Password' }: { autoComplete: string; label?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="password" className="text-caption-strong">
        {label}
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete={autoComplete}
        minLength={autoComplete === 'new-password' ? 10 : undefined}
        required
        className={INPUT}
      />
    </div>
  );
}

export function SignInForm({ next }: { next: string }) {
  return (
    <ActionForm action={signInAction}>
      <input type="hidden" name="next" value={next} />
      <Email />
      <Password autoComplete="current-password" />
      <SubmitButton pending="Signing in…">Sign in</SubmitButton>
      <p className="text-caption text-ink-muted-80">
        <Link className="text-primary" href="/forgot-password">
          Forgot your password?
        </Link>{' '}
        ·{' '}
        <Link className="text-primary" href={`/sign-up?next=${encodeURIComponent(next)}`}>
          Create an account
        </Link>
      </p>
    </ActionForm>
  );
}

export function SignUpForm({ next }: { next: string }) {
  return (
    <ActionForm action={signUpAction}>
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-caption-strong">
          Your name
        </label>
        <input id="name" name="name" autoComplete="name" required className={INPUT} />
      </div>
      <Email />
      <Password autoComplete="new-password" />
      <p className="text-caption text-ink-muted-80">At least 10 characters.</p>
      <SubmitButton pending="Creating…">Create account</SubmitButton>
      <p className="text-caption text-ink-muted-80">
        Already have one?{' '}
        <Link className="text-primary" href={`/sign-in?next=${encodeURIComponent(next)}`}>
          Sign in
        </Link>
      </p>
    </ActionForm>
  );
}

export function ForgotForm() {
  return (
    <ActionForm action={requestResetAction}>
      <Email />
      <SubmitButton pending="Sending…">Send reset link</SubmitButton>
    </ActionForm>
  );
}

export function ResetForm({ token }: { token: string }) {
  return (
    <ActionForm action={resetPasswordAction}>
      <input type="hidden" name="token" value={token} />
      <Password autoComplete="new-password" label="New password" />
      <SubmitButton>Set password</SubmitButton>
    </ActionForm>
  );
}
