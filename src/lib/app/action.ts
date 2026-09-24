import 'server-only';
import { ConflictError, ForbiddenError, InvalidInputError, NotFoundError } from '@/lib/db/errors';

/**
 * What a server action hands back to the form that called it.
 *
 * The data layer raises four kinds of error on purpose — each is something
 * the person can act on — and this turns them into a message. Anything else
 * is a bug: it is rethrown, so Next.js shows its error page and the logs keep
 * the stack, rather than a vague "something went wrong" that hides it.
 */
export type ActionState =
  | { ok: true; message?: string; data?: unknown }
  | { ok: false; message: string }
  | null;

export async function run(
  work: () => Promise<string | undefined | { message?: string; data?: unknown }>,
): Promise<ActionState> {
  try {
    const result = await work();
    if (typeof result === 'string' || result === undefined)
      return { ok: true, ...(result ? { message: result } : {}) };
    return { ok: true, ...result };
  } catch (error) {
    if (
      error instanceof InvalidInputError ||
      error instanceof ConflictError ||
      error instanceof ForbiddenError ||
      error instanceof NotFoundError
    ) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

/** The current instant. Server actions own the clock; the engine never reads one (rule 9). */
export const now = (): string => new Date().toISOString();

/** A form field as a trimmed string. */
export const text = (form: FormData, name: string): string => String(form.get(name) ?? '').trim();

/** A form field as a whole number, or undefined when blank. */
export function int(form: FormData, name: string): number | undefined {
  const raw = text(form, name);
  if (raw === '') return undefined;
  const n = Number(raw);
  return Number.isInteger(n) ? n : Number.NaN;
}

/** Non-empty lines of a textarea. */
export const lines = (form: FormData, name: string): string[] =>
  text(form, name)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
