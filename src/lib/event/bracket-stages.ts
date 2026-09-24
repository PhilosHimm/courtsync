import type { Match, MatchStatus, UUID } from '@/lib/core';
import { setsWon, sortSets } from '@/lib/core';
import type { BracketSlot } from '@/lib/scheduling';
import { playoffMatchId } from '@/lib/scheduling';
import { STATUS_LABELS } from './views';

/**
 * The bracket as a phone reads it (#29): one stage at a time — quarters,
 * semis, final — instead of a tree that needs a horizontal scroll and a
 * pinch. Every side of every match is one of four things, and the four are
 * kept apart on purpose:
 *
 * - `team` — somebody is in this slot.
 * - `bye` — nobody is coming, and the other side walks through. Not a
 *   forfeit: nothing was forfeited, the draw was short.
 * - `awaiting` — somebody IS coming, from a match not yet decided. Showing
 *   this like a bye would hand a team a title they had not played for; the
 *   engine's `advanceBracket` draws the same line.
 * - `empty` — the slot does not exist in a bracket this size.
 *
 * Slots are recognised by the ids `match-ids.ts` mints, never by parsing a
 * round label (C3).
 */

export type BracketSide =
  | { kind: 'team'; participantId: UUID; name: string }
  | { kind: 'bye' }
  | { kind: 'awaiting'; from: BracketSlot; text: string }
  | { kind: 'empty' };

export interface StageMatch {
  matchId: UUID;
  slot: BracketSlot;
  /** "QF 1", "SF 2", "Final", "Consolation". */
  title: string;
  home: BracketSide;
  away: BracketSide;
  status: MatchStatus;
  /** Words, never colour alone. "Bye" for a walked-through quarterfinal. */
  statusText: string;
  score: string | null;
  winner: 'home' | 'away' | null;
}

export interface BracketStage {
  key: 'quarterfinals' | 'semifinals' | 'final' | 'consolation';
  label: string;
  matches: StageMatch[];
}

const STAGES: ReadonlyArray<{ key: BracketStage['key']; label: string; slots: BracketSlot[] }> = [
  { key: 'quarterfinals', label: 'Quarterfinals', slots: ['q1', 'q2', 'q3', 'q4'] },
  { key: 'semifinals', label: 'Semifinals', slots: ['s1', 's2'] },
  { key: 'final', label: 'Final', slots: ['final'] },
  { key: 'consolation', label: 'Consolation', slots: ['consolation'] },
];

/** Which slot feeds each side of a downstream slot. Consolation takes losers. */
const FEEDS: Partial<Record<BracketSlot, [BracketSlot, BracketSlot]>> = {
  s1: ['q1', 'q2'],
  s2: ['q3', 'q4'],
  final: ['s1', 's2'],
  consolation: ['s1', 's2'],
};

const TITLES: Record<BracketSlot, string> = {
  q1: 'QF 1',
  q2: 'QF 2',
  q3: 'QF 3',
  q4: 'QF 4',
  s1: 'SF 1',
  s2: 'SF 2',
  final: 'Final',
  consolation: 'Consolation',
};

export function bracketStages(input: {
  competitionSlug: string;
  tier: string;
  matches: readonly Match[];
  names: Readonly<Record<UUID, string>>;
}): BracketStage[] {
  const bySlot = new Map<BracketSlot, Match>();
  for (const stage of STAGES) {
    for (const slot of stage.slots) {
      const id = playoffMatchId(input.competitionSlug, input.tier, slot);
      const match = input.matches.find((m) => m.id === id);
      if (match) bySlot.set(slot, match);
    }
  }

  /** Whether anybody can ever arrive in this slot. */
  const exists = (slot: BracketSlot): boolean => {
    const feeds = FEEDS[slot];
    if (!feeds) {
      const match = bySlot.get(slot);
      return Boolean(match?.homeParticipantId || match?.awayParticipantId);
    }
    return feeds.some(exists);
  };

  const sideOf = (slot: BracketSlot, which: 0 | 1, id: UUID | null | undefined): BracketSide => {
    if (id) return { kind: 'team', participantId: id, name: input.names[id] ?? 'Unknown team' };
    const feeds = FEEDS[slot];
    if (!feeds) {
      // A quarterfinal is seeded directly. An empty side opposite a team is
      // a bye; both sides empty is a slot this bracket does not have.
      const match = bySlot.get(slot);
      const other = which === 0 ? match?.awayParticipantId : match?.homeParticipantId;
      return other ? { kind: 'bye' } : { kind: 'empty' };
    }
    const from = feeds[which];
    if (!exists(from)) return slot === 'consolation' ? { kind: 'empty' } : { kind: 'bye' };
    const verb = slot === 'consolation' ? 'Loser' : 'Winner';
    return { kind: 'awaiting', from, text: `${verb} of ${TITLES[from]}` };
  };

  const stages: BracketStage[] = [];
  for (const stage of STAGES) {
    const matches: StageMatch[] = [];
    for (const slot of stage.slots) {
      const match = bySlot.get(slot);
      if (!match) continue;
      const home = sideOf(slot, 0, match.homeParticipantId);
      const away = sideOf(slot, 1, match.awayParticipantId);
      const decided = match.status === 'final' || match.status === 'forfeit';
      const sets = setsWon(match);
      const isBye =
        (home.kind === 'bye' && away.kind === 'team') ||
        (away.kind === 'bye' && home.kind === 'team');
      const ordered = sortSets(match.sets);
      matches.push({
        matchId: match.id,
        slot,
        title: TITLES[slot],
        home,
        away,
        status: match.status,
        statusText: isBye ? 'Bye' : STATUS_LABELS[match.status],
        score:
          ordered.length === 0
            ? null
            : ordered.map((s) => `${s.homePoints}–${s.awayPoints}`).join(', '),
        winner:
          !decided || sets.home === sets.away ? null : sets.home > sets.away ? 'home' : 'away',
      });
    }
    if (matches.length > 0) stages.push({ key: stage.key, label: stage.label, matches });
  }
  return stages;
}

/** One side as plain text — the list alternative, and what a screen reader hears. */
export function sideText(side: BracketSide): string {
  switch (side.kind) {
    case 'team':
      return side.name;
    case 'bye':
      return 'Bye';
    case 'awaiting':
      return side.text;
    case 'empty':
      return 'No team';
  }
}
