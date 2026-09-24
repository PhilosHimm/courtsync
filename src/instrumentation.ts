/**
 * Runs once when the server starts. Validates the environment so a missing
 * secret stops the server at boot, not on the first sign-in (CLAUDE.md
 * rule 7). The error names every missing variable at once.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { readServerEnv } = await import('@/lib/db/env');
  readServerEnv();
}
