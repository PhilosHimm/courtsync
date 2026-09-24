/**
 * The four starter templates (#19) each produce an event the engine can run
 * end to end, and that the create path would accept as typed.
 */

import { describe, expect, it } from 'vitest';
import { newEventProblems } from '@/lib/db/events';
import { planLeague, planPoolDraw, planPoolPlay } from '@/lib/event/engine';
import { STARTER_TEMPLATES, templateById } from '@/lib/event/templates';
import { snapshotOf } from './snapshot-fixture';

const args = { name: 'Test', startDate: '2026-09-05', timeZone: 'America/Toronto' };

describe('STARTER_TEMPLATES', () => {
  it('are the four the owner named', () => {
    expect(STARTER_TEMPLATES.map((t) => t.title)).toEqual([
      '8 teams, 2 pools, gold bracket',
      '12 teams, 3 pools, gold + silver',
      'Weekly league, 8 teams',
      'Drop-in night, 20 people',
    ]);
  });

  it('each build an event the create path accepts', () => {
    for (const template of STARTER_TEMPLATES) {
      expect(newEventProblems(template.build(args))).toEqual([]);
    }
  });

  it('draw and schedule the tournaments with every match placed', () => {
    for (const id of ['eight-two-gold', 'twelve-three-tiers'] as const) {
      const input = templateById(id)!.build(args);
      const base = snapshotOf({
        teams: input.participants.length,
        courts: input.courts.length,
        slots: 12,
        competition: { poolCount: input.poolCount, bracketTiers: input.bracketTiers },
      });
      const pools = planPoolDraw(base).pools.map((p, i) => ({ ...p, id: `p${i}` }));
      expect(pools).toHaveLength(input.poolCount!);
      expect(planPoolPlay({ ...base, pools }).unplaced).toEqual([]);
    }
  });

  it('schedule the league across its seven weeks', () => {
    const input = templateById('weekly-league-8')!.build(args);
    expect(input.sessions.map((s) => s.playDate).slice(0, 2)).toEqual(['2026-09-05', '2026-09-12']);
    const base = snapshotOf({ format: 'league', teams: 8, sessions: 7, courts: 2, slots: 3 });
    const { matches, unplaced } = planLeague(base);
    expect(matches).toHaveLength(28);
    expect(unplaced).toEqual([]);
  });
});
