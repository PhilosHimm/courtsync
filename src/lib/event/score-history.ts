import type { MatchSet, MatchSetEdit, UUID } from '@/lib/core';
import { sortSets } from '@/lib/core';
import type { EnteredSet } from '@/lib/scheduling';

/**
 * The history behind a score (#22).
 *
 * Append-only for the reason the fee ledger is (rule 8): an organizer who
 * changes a score at 4pm has to be able to say what it was at 3pm and who
 * changed it, and a volunteer scorekeeper has no account — so "who" is the
 * link it came through. This computes the rows to append; it never produces
 * an update to an earlier one.
 */

/** An edit before it has a row id — the database assigns that. */
export type NewScoreEdit = Omit<MatchSetEdit, 'id'>;

export function scoreEdits(input: {
  matchId: UUID;
  previous: readonly MatchSet[];
  next: readonly EnteredSet[];
  editedAt: string;
  reason?: string;
  editedBy?: UUID;
  viaLinkId?: UUID;
}): NewScoreEdit[] {
  const before = new Map(sortSets(input.previous).map((set) => [set.setNumber, set]));
  const count = Math.max(before.size === 0 ? 0 : Math.max(...before.keys()), input.next.length);
  const edits: NewScoreEdit[] = [];

  for (let setNumber = 1; setNumber <= count; setNumber++) {
    const was = before.get(setNumber);
    const is = input.next[setNumber - 1];
    const previousHome = was?.homePoints ?? null;
    const previousAway = was?.awayPoints ?? null;
    const nextHome = is?.home ?? null;
    const nextAway = is?.away ?? null;
    if (previousHome === nextHome && previousAway === nextAway) continue;

    edits.push({
      matchId: input.matchId,
      setNumber,
      previousHome,
      previousAway,
      nextHome,
      nextAway,
      editedAt: input.editedAt,
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.editedBy ? { editedBy: input.editedBy } : {}),
      ...(input.viaLinkId ? { viaLinkId: input.viaLinkId } : {}),
    });
  }
  return edits;
}

/**
 * What a correction changes, one line per set — what the confirmation screen
 * says before an edit to a recorded score is saved.
 */
export function describeScoreChange(
  previous: readonly MatchSet[],
  next: readonly EnteredSet[],
): string[] {
  return scoreEdits({ matchId: '', previous, next, editedAt: '' }).map((edit) => {
    const was = edit.previousHome === null ? null : `${edit.previousHome}–${edit.previousAway}`;
    const is = edit.nextHome === null ? null : `${edit.nextHome}–${edit.nextAway}`;
    if (was === null) return `Set ${edit.setNumber}: added ${is}`;
    if (is === null) return `Set ${edit.setNumber}: removed (was ${was})`;
    return `Set ${edit.setNumber}: ${was} → ${is}`;
  });
}
