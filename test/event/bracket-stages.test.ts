/**
 * Specification for the bracket on a phone (#29).
 *
 * Stage by stage — quarters, semis, final — rather than a horizontal scroll,
 * with a list alternative built from the same data. Two states must never
 * read the same, per docs/DECISIONS.md:
 *
 * - A BYE: a quarterfinal with no opponent, which walks its seed through.
 *   Not a fabricated forfeit.
 * - OPPONENT NOT YET KNOWN: a semifinal waiting on an unplayed quarterfinal.
 *   Rendering it like a bye would show somebody a title they had not played
 *   for.
 */

import { describe, expect, it } from 'vitest';
import type { Match } from '@/lib/core';
import { bracketStages, sideText } from '@/lib/event/bracket-stages';
import { advanceBracket, seedBrackets } from '@/lib/scheduling/seeding';

const slug = 'open';

/** A gold bracket from `seedBrackets`, turned into matches. */
function seeded(qualifiers: string[]): Match[] {
  // Two pools, ranks by list order; a short field leaves byes.
  const half = Math.ceil(qualifiers.length / 2);
  const pool = (ids: string[]) =>
    ids.map((id, i) => ({
      participantId: id,
      participantName: id.toUpperCase(),
      wins: 10 - i,
      losses: i,
      winPercentage: (10 - i) / 10,
      setsWon: 0,
      setsLost: 0,
      setDifferential: 10 - i,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDifferential: 10 - i,
      pointAdjustment: 0,
      rank: i + 1,
    }));
  const draw = seedBrackets({
    competitionSlug: slug,
    sessionId: 's',
    standingsByPool: { A: pool(qualifiers.slice(0, half)), B: pool(qualifiers.slice(half)) },
    tiers: ['gold'],
  });
  return draw.map((d) => ({
    id: d.matchId,
    competitionId: 'c',
    sessionId: 's',
    bracket: d.tier,
    roundLabel: d.slot,
    homeParticipantId: d.homeParticipantId,
    awayParticipantId: d.awayParticipantId,
    status: 'scheduled' as const,
    sets: [],
  }));
}

const names: Record<string, string> = Object.fromEntries(
  ['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4'].map((id) => [id, id.toUpperCase()]),
);

const win = (match: Match, homeWins: boolean): Match => ({
  ...match,
  status: 'final',
  sets: [
    {
      id: `${match.id}-1`,
      matchId: match.id,
      setNumber: 1,
      homePoints: homeWins ? 25 : 20,
      awayPoints: homeWins ? 20 : 25,
    },
    {
      id: `${match.id}-2`,
      matchId: match.id,
      setNumber: 2,
      homePoints: homeWins ? 25 : 20,
      awayPoints: homeWins ? 20 : 25,
    },
  ],
});

describe('bracketStages', () => {
  it('lays out quarterfinals, semifinals, final and consolation, in that order', () => {
    const stages = bracketStages({
      competitionSlug: slug,
      tier: 'gold',
      matches: seeded(Object.keys(names)),
      names,
    });
    expect(stages.map((s) => s.key)).toEqual([
      'quarterfinals',
      'semifinals',
      'final',
      'consolation',
    ]);
    expect(stages.map((s) => s.matches.length)).toEqual([4, 2, 1, 1]);
    expect(stages[0]!.label).toBe('Quarterfinals');
  });

  it('shows a full, unplayed draw with teams in the quarters and waiting sides after', () => {
    const [quarters, semis, final] = bracketStages({
      competitionSlug: slug,
      tier: 'gold',
      matches: seeded(Object.keys(names)),
      names,
    });
    for (const m of quarters!.matches) {
      expect(m.home.kind).toBe('team');
      expect(m.away.kind).toBe('team');
    }
    expect(semis!.matches[0]!.home).toEqual({
      kind: 'awaiting',
      from: 'q1',
      text: 'Winner of QF 1',
    });
    expect(final!.matches[0]!.away).toEqual({
      kind: 'awaiting',
      from: 's2',
      text: 'Winner of SF 2',
    });
  });

  it('calls a quarterfinal with no opponent a bye, and never a forfeit', () => {
    const matches = advanceBracket({
      competitionSlug: slug,
      tier: 'gold',
      matches: seeded(['a1', 'a2', 'a3', 'b1', 'b2', 'b3']),
    });
    const [quarters] = bracketStages({ competitionSlug: slug, tier: 'gold', matches, names });
    const byes = quarters!.matches.filter((m) => m.home.kind === 'bye' || m.away.kind === 'bye');
    expect(byes).toHaveLength(2);
    for (const m of byes) {
      expect(m.statusText).toBe('Bye');
      expect(JSON.stringify(m)).not.toMatch(/forfeit/i);
    }
  });

  it('walks a bye’s seed into the semifinal while the other side is still awaited', () => {
    const matches = advanceBracket({
      competitionSlug: slug,
      tier: 'gold',
      matches: seeded(['a1', 'a2', 'a3', 'b1', 'b2', 'b3']),
    });
    const [, semis] = bracketStages({ competitionSlug: slug, tier: 'gold', matches, names });
    const sides = semis!.matches.flatMap((m) => [m.home, m.away]);
    // Two top seeds are through on byes; their opponents are not known yet.
    expect(sides.filter((s) => s.kind === 'team')).toHaveLength(2);
    expect(sides.filter((s) => s.kind === 'awaiting')).toHaveLength(2);
    expect(sides.some((s) => s.kind === 'bye')).toBe(false);
  });

  it('fills a semifinal side once its quarterfinal is played', () => {
    const draw = seeded(Object.keys(names));
    const q1 = draw.find((m) => m.roundLabel === 'q1')!;
    const played = advanceBracket({
      competitionSlug: slug,
      tier: 'gold',
      matches: draw.map((m) => (m.id === q1.id ? win(m, true) : m)),
    });
    const [quarters, semis] = bracketStages({
      competitionSlug: slug,
      tier: 'gold',
      matches: played,
      names,
    });
    expect(quarters!.matches[0]!.statusText).toBe('Final');
    expect(quarters!.matches[0]!.score).toBe('25–20, 25–20');
    expect(quarters!.matches[0]!.winner).toBe('home');
    expect(semis!.matches[0]!.home).toMatchObject({
      kind: 'team',
      participantId: q1.homeParticipantId,
    });
    expect(semis!.matches[0]!.away.kind).toBe('awaiting');
  });

  it('says who the consolation match is waiting for', () => {
    const stages = bracketStages({
      competitionSlug: slug,
      tier: 'gold',
      matches: seeded(Object.keys(names)),
      names,
    });
    expect(stages[3]!.matches[0]!.home).toEqual({
      kind: 'awaiting',
      from: 's1',
      text: 'Loser of SF 1',
    });
  });

  it('drops a stage that has no matches at all rather than rendering an empty page', () => {
    const noConsolation = seeded(Object.keys(names)).filter((m) => m.roundLabel !== 'consolation');
    const stages = bracketStages({
      competitionSlug: slug,
      tier: 'gold',
      matches: noConsolation,
      names,
    });
    expect(stages.map((s) => s.key)).toEqual(['quarterfinals', 'semifinals', 'final']);
  });

  it('ignores matches from another tier', () => {
    const gold = seeded(Object.keys(names));
    const stages = bracketStages({ competitionSlug: slug, tier: 'silver', matches: gold, names });
    expect(stages).toEqual([]);
  });
});

describe('sideText', () => {
  it('gives every side a plain-text reading, for the list alternative and screen readers', () => {
    expect(sideText({ kind: 'team', participantId: 'a1', name: 'A1' })).toBe('A1');
    expect(sideText({ kind: 'bye' })).toBe('Bye');
    expect(sideText({ kind: 'awaiting', from: 'q1', text: 'Winner of QF 1' })).toBe(
      'Winner of QF 1',
    );
    expect(sideText({ kind: 'empty' })).toBe('No team');
  });
});
