import type { UUID } from '@courtsync/core';

/** Sentinel for the odd-participant-out in a round; never appears in output. */
const BYE = '__bye__';

/**
 * Round-robin pairings by the circle method: fix the first entry, rotate the
 * rest, pair front against back. Produces exactly n*(n-1)/2 pairings across
 * n-1 rounds, with every participant appearing at most once per round. An odd
 * count gets a bye each round rather than a second match.
 *
 * That once-per-round property is the load-bearing part, and it is what audit
 * finding H6 was missing. scoop generated pairings in an order that handed the
 * first team its whole schedule up front, so it played n-1 matches back to
 * back and then sat idle. Here a participant physically cannot appear twice in
 * one round, so spacing rounds apart spaces out every participant for free.
 *
 * Shared by pool play (which packs the rounds into one day) and league
 * fixtures (which spreads them across a season) precisely so the two cannot
 * drift into producing different pairings from the same teams.
 */
export function roundRobinRounds(participantIds: readonly UUID[]): Array<Array<[UUID, UUID]>> {
  // A repeated id silently produces a fixture where somebody plays themselves,
  // which the schema then rejects at write time with no useful explanation.
  // Duplicate registrations are a real and common data error, so say so here.
  const seen = new Set<UUID>();
  for (const id of participantIds) {
    if (seen.has(id)) {
      throw new Error(
        `Cannot build a round robin: participant ${id} appears more than once. Each participant may only be entered once.`,
      );
    }
    seen.add(id);
  }

  const list: string[] = [...participantIds];
  if (list.length < 2) return [];
  if (list.length % 2 === 1) list.push(BYE);

  const n = list.length;
  const rounds: Array<Array<[UUID, UUID]>> = [];

  for (let r = 0; r < n - 1; r++) {
    const pairs: Array<[UUID, UUID]> = [];
    for (let i = 0; i < n / 2; i++) {
      const home = list[i];
      const away = list[n - 1 - i];
      if (home === undefined || away === undefined) continue;
      if (home === BYE || away === BYE) continue;
      pairs.push([home, away]);
    }
    rounds.push(pairs);

    // Rotate every position except the first.
    const last = list.pop();
    if (last !== undefined) list.splice(1, 0, last);
  }

  return rounds;
}
