import type { NewEventInput } from './inputs';

/**
 * The four starter templates, named by the project owner as ones actually
 * run (#19). Each is a complete, valid event with placeholder entries — a
 * starting point the wizard then edits, never a hidden default.
 */

export type TemplateId = 'eight-two-gold' | 'twelve-three-tiers' | 'weekly-league-8' | 'dropin-20';

export interface StarterTemplate {
  id: TemplateId;
  title: string;
  summary: string;
  build: (input: { name: string; startDate: string; timeZone: string }) => NewEventInput;
}

const teams = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `Team ${i + 1}`, seed: i + 1 }));

/** YYYY-MM-DD plus whole days. */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
  {
    id: 'eight-two-gold',
    title: '8 teams, 2 pools, gold bracket',
    summary: 'A one-day tournament: two pools of four, then an eight-team gold bracket.',
    build: ({ name, startDate, timeZone }) => ({
      name,
      format: 'tournament',
      timeZone,
      gameDurationMin: 45,
      bufferMin: 5,
      poolCount: 2,
      bracketTiers: ['gold'],
      minRestMin: 0,
      courts: ['Court 1', 'Court 2'],
      sessions: [{ playDate: startDate, startTime: '09:00', endTime: '18:00' }],
      participants: teams(8),
    }),
  },
  {
    id: 'twelve-three-tiers',
    title: '12 teams, 3 pools, gold + silver',
    summary: 'Three pools of four; the top eight play gold, the rest play silver.',
    build: ({ name, startDate, timeZone }) => ({
      name,
      format: 'tournament',
      timeZone,
      gameDurationMin: 45,
      bufferMin: 5,
      poolCount: 3,
      bracketTiers: ['gold', 'silver'],
      minRestMin: 0,
      courts: ['Court 1', 'Court 2', 'Court 3'],
      sessions: [{ playDate: startDate, startTime: '08:30', endTime: '19:00' }],
      participants: teams(12),
    }),
  },
  {
    id: 'weekly-league-8',
    title: 'Weekly league, 8 teams',
    summary: 'Seven weeks, one night a week — everyone plays everyone once.',
    build: ({ name, startDate, timeZone }) => ({
      name,
      format: 'league',
      timeZone,
      gameDurationMin: 50,
      bufferMin: 10,
      minRestMin: 0,
      courts: ['Court 1', 'Court 2'],
      sessions: Array.from({ length: 7 }, (_, i) => ({
        name: `Week ${i + 1}`,
        playDate: addDays(startDate, i * 7),
        startTime: '19:00',
        endTime: '22:00',
      })),
      participants: teams(8),
    }),
  },
  {
    id: 'dropin-20',
    title: 'Drop-in night, 20 people',
    summary: 'A weekly drop-in: 20 places, sides of six, a waitlist when it fills.',
    build: ({ name, startDate, timeZone }) => ({
      name,
      format: 'dropin',
      timeZone,
      gameDurationMin: 20,
      bufferMin: 0,
      minRestMin: 0,
      capacity: 20,
      playersPerSide: 6,
      courts: ['Court 1'],
      sessions: Array.from({ length: 4 }, (_, i) => ({
        playDate: addDays(startDate, i * 7),
        startTime: '19:00',
        endTime: '21:00',
      })),
      participants: [],
    }),
  },
];

export function templateById(id: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find((t) => t.id === id);
}
