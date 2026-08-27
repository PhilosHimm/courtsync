export function SiteFooter() {
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 text-sm text-ink-faint sm:flex-row sm:items-center sm:justify-between">
        <p>
          <span className="font-mono uppercase tracking-wide text-ink-dim">Status —</span>{' '}
          Pre-launch. No accounts, no data, nothing to sign up for yet.
        </p>
        <p className="flex gap-4">
          <a
            href="https://github.com/PhilosHimm/courtsync"
            className="text-ink-dim underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
          >
            Source on GitHub
          </a>
          <span>Apache-2.0, free forever</span>
        </p>
      </div>
    </footer>
  );
}
