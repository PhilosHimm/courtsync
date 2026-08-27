/**
 * The area pages claim, in numbers, what is finished. Those claims went stale
 * once already: every persona's status still promised pool play, league
 * fixtures and the drop-in rotation as future work long after all three
 * shipped and were covered by the suites in this directory.
 *
 * Understating what is built is as dishonest as overstating it (PRODUCT.md,
 * Evidence on Hand). These assertions tie the copy back to the code so the
 * next drift fails here rather than on the page.
 *
 * They deliberately do NOT re-count the suites — parsing test sources to
 * check a number in a UI file is the kind of cleverness that breaks on the
 * first refactor. The re-derivation procedure is documented on CoverageRow in
 * src/lib/personas.ts and is a one-liner.
 */

import { describe, expect, it } from 'vitest';
import { PERSONAS } from '@/lib/personas';
import * as scheduling from '@/lib/scheduling';

const schedulingExports = new Set(Object.keys(scheduling));

describe('persona build box scores', () => {
  it('covers all three formats, one persona each', () => {
    expect(PERSONAS.map((p) => p.id).sort()).toEqual(['dropin', 'league', 'tournament']);
  });

  for (const persona of PERSONAS) {
    describe(persona.id, () => {
      it('names only functions the scheduling engine actually exports', () => {
        for (const row of persona.status.coverage) {
          expect(schedulingExports, `${persona.id} claims ${row.fn}`).toContain(row.fn);
        }
      });

      it('claims at least one piece of finished work', () => {
        expect(persona.status.coverage.length).toBeGreaterThan(0);
      });

      it('reports whole positive test counts, never estimates', () => {
        const counts = [
          ...persona.status.coverage.map((row) => row.tests),
          persona.status.endToEnd.tests,
        ];
        for (const n of counts) {
          expect(Number.isInteger(n)).toBe(true);
          expect(n).toBeGreaterThan(0);
        }
      });

      it('still admits what is missing', () => {
        // Nothing here is deployed. A persona that has run out of gaps to
        // list has stopped being honest rather than become finished.
        expect(persona.status.notYet.length).toBeGreaterThan(0);
      });

      it('says plainly that nothing persists yet', () => {
        // The single most important gap: the engine runs, but no screen
        // saves anything. Every area page has to say so.
        const admitsNoPersistence = persona.status.notYet.some((item) =>
          /database|saves/i.test(item),
        );
        expect(admitsNoPersistence).toBe(true);
      });

      it('marks a shared function on both areas that run it', () => {
        for (const row of persona.status.coverage) {
          if (!row.sharedWith) continue;
          // The claim is that one function serves more than one format. If
          // that is true, the same function has to appear on another persona
          // with the same count — otherwise the note is decoration.
          const elsewhere = PERSONAS.filter((other) => other.id !== persona.id).flatMap((other) =>
            other.status.coverage.filter((r) => r.fn === row.fn),
          );

          expect(
            elsewhere.length,
            `${row.fn} is marked shared but appears nowhere else`,
          ).toBeGreaterThan(0);
          for (const match of elsewhere) {
            expect(match.tests, `${row.fn} reports a different count per area`).toBe(row.tests);
          }
        }
      });
    });
  }
});
