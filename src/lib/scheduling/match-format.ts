import type { Match, SetRule } from '@/lib/core';
import { PLAYOFF_SETS, POOL_PLAY_ROUND_LABEL, POOL_PLAY_SETS } from '@/lib/core';
import type { BracketSlot } from './match-ids';
import { BRACKET_SLOTS } from './match-ids';

/**
 * Which set rules a match is played to, derived rather than stored.
 *
 * `POOL_PLAY_SETS` and `PLAYOFF_SETS` have been in core since the beginning
 * and only the demo's scoreline generator ever read them. Nothing told an
 * organizer entering a score which format the match in front of them was —
 * two sets to 21, or best of three to 25 — so the printed rules sheet stayed
 * the authority and the screen stayed silent. A referee asking "is this one
 * to 21 or to 25?" halfway through a tournament is the actual failure.
 *
 * Derived from the match rather than carried on it. A `format` column would
 * be a second place the answer lives, free to disagree with the round label
 * beside it, and divergent copies of one fact is C3.
 */

export type MatchPhase = 'pool' | 'playoff';

export interface SetFormat {
  phase: MatchPhase;
  rules: readonly SetRule[];
  /** One line for a match row: "2 sets to 21, cap 25". */
  label: string;
  /** One line per set, index-aligned with `rules`. */
  setLabels: string[];
  /** Whether a 1-1 split is settled on total points across the sets played. */
  splitDecidedOnTotalPoints: boolean;
  /** 1-based number of the set only played when the others split; null if none. */
  deciderSetNumber: number | null;
}

const BRACKET_SLOT_SET = new Set<string>(BRACKET_SLOTS);

const isBracketSlot = (label: string | null | undefined): label is BracketSlot =>
  label !== null && label !== undefined && BRACKET_SLOT_SET.has(label);

/**
 * Which phase a match belongs to, or null when it is neither.
 *
 * Null is a real answer, not a fallback. A league's "Week 3" and a drop-in
 * round are not pool play and not a bracket, and defaulting them to pool
 * would print a tournament's scoring rules on a league fixture. This module
 * serves the tournament; it declines the other two rather than guessing.
 *
 * The pool test is exact equality against the shared constant. `Pool A` and
 * `pool play` are not it — accepting them would invent the leniency the
 * constant exists to rule out.
 */
export function matchPhaseOf(match: Match): MatchPhase | null {
  // Tier first: a bracket match always carries one, and its round label is a
  // slot rather than a phase name.
  if (match.bracket) return 'playoff';
  if (isBracketSlot(match.roundLabel)) return 'playoff';
  if (match.roundLabel === POOL_PLAY_ROUND_LABEL) return 'pool';
  return null;
}

/**
 * A set format has a decider when its last set can only be reached from a
 * split — three sets, or five. Two sets have no decider, which is precisely
 * why pool play settles a 1-1 on total points.
 */
const deciderIndexOf = (rules: readonly SetRule[]): number | null =>
  rules.length >= 3 && rules.length % 2 === 1 ? rules.length - 1 : null;

/** "to 21, cap 25" — the cap is only worth saying when there is one. */
function targetPhrase(rule: SetRule): string {
  return rule.cap === null ? `to ${rule.target}` : `to ${rule.target}, cap ${rule.cap}`;
}

/**
 * Both sides switch ends halfway through a deciding set — at 8 in a set to
 * 15, which is the case this label exists for.
 *
 * Derived rather than added to `SetRule` in core. The switch is a rule of
 * volleyball rather than a knob an organizer sets, and a field would invite
 * somebody to configure it to something the sport does not do.
 */
const switchPointOf = (rule: SetRule): number => Math.ceil(rule.target / 2);

/**
 * One line for the whole match, generated from the rules rather than typed
 * beside them.
 *
 * A hardcoded "2 sets to 21" would go stale the moment `POOL_PLAY_SETS` was
 * edited, and go stale silently, on a screen somebody is entering scores
 * from. Reading the constants is what makes editing them a real change.
 */
function formatLabel(rules: readonly SetRule[], deciderIndex: number | null): string {
  const first = rules[0];
  if (!first) return 'No sets';
  if (deciderIndex === null) {
    return `${rules.length} set${rules.length === 1 ? '' : 's'} ${targetPhrase(first)}`;
  }
  // Best-of takes its target from the sets that are always played; the
  // decider is shorter and saying "best of 3 to 15" would be wrong.
  return `Best of ${rules.length} ${targetPhrase(first)}`;
}

function setLabel(rule: SetRule, index: number, deciderIndex: number | null): string {
  const base = `Set ${index + 1} — ${targetPhrase(rule)}`;
  return index === deciderIndex ? `${base} (switch at ${switchPointOf(rule)})` : base;
}

export function setFormatFor(phase: MatchPhase): SetFormat {
  const rules = phase === 'pool' ? POOL_PLAY_SETS : PLAYOFF_SETS;
  const deciderIndex = deciderIndexOf(rules);

  return {
    phase,
    rules,
    label: formatLabel(rules, deciderIndex),
    // A fresh array each call: the caller gets something it can sort or push
    // onto without the next caller seeing it.
    setLabels: rules.map((rule, index) => setLabel(rule, index, deciderIndex)),
    // Pool play is two sets with no decider, so a split goes to whoever
    // scored more across both. The playoffs have a third set, so 1-1 means
    // the decider has not been played — which is what `advanceBracket`
    // already says by refusing to advance a tied elimination match (H15).
    splitDecidedOnTotalPoints: deciderIndex === null,
    deciderSetNumber: deciderIndex === null ? null : deciderIndex + 1,
  };
}

export function setFormatOf(match: Match): SetFormat | null {
  const phase = matchPhaseOf(match);
  return phase === null ? null : setFormatFor(phase);
}

/**
 * Whether the two teams playing call their own match.
 *
 * The Red Velvet sheet lists the consolation match as "Self Ref": no crew
 * assigned, deliberately. A blank on the screen reads as a missing
 * assignment instead of as the decision it is.
 *
 * A pool match with no referee is emphatically NOT this. `assignReferees`
 * staffs pool play and returns the matches it could not — with every court
 * running there is nobody left who is not playing, and the organizer has to
 * see that. Labelling it "self ref" would turn a shortfall into a line that
 * reads like somebody chose it.
 */
export function isSelfRefereed(match: Match): boolean {
  return matchPhaseOf(match) === 'playoff' && !match.refParticipantId;
}
