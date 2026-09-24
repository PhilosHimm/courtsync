import type { Metadata } from 'next';
import { SignInForm } from '../AuthForms';
import { AuthShell } from '../AuthShell';
import { googleAction } from '../actions';

export const metadata: Metadata = { title: 'Sign in — CourtSync', robots: { index: false } };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string; error?: string }>;
}) {
  const { next = '/events', reset, error } = await searchParams;
  return (
    <AuthShell
      title="Sign in"
      lead="Organizers run events; players join drop-ins and follow their team."
    >
      {reset && (
        <p role="status" className="mb-4 text-caption text-ink-muted-80">
          Password changed. Sign in with the new one.
        </p>
      )}
      {error === 'google' && (
        <p role="alert" className="mb-4 text-caption text-ink">
          Google sign-in did not complete. Try again, or use your email.
        </p>
      )}
      <SignInForm next={next} />
      <form action={googleAction} className="mt-6 border-t border-hairline pt-6">
        <input type="hidden" name="next" value={next} />
        <button
          type="submit"
          className="w-full rounded-full border border-ink px-[22px] py-[11px] text-body text-ink transition-transform active:scale-95"
        >
          Continue with Google
        </button>
      </form>
    </AuthShell>
  );
}
