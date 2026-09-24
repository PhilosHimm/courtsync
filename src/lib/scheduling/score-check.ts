import type { SetFormat } from './match-format';

/**
 * Score validation that warns and never blocks (#18).
 *
 * Weird real scores happen — an injury, a time cap, an agreed default. A
 * form that refuses them strands the organizer with a result they cannot
 * record. So every rule of volleyball a scoreline might break is reported as
 * a warning the organizer sees and can accept. Only input that cannot be a
 * score at all — nothing entered, negative or fractional points — is an
 * error, because that is a typing slip rather than something that happened.
 *
 * Reads the match's `SetFormat`, so a competition that plays one set to 15
 * is checked against one set to 15 rather than against a constant.
 */

export interface EnteredSet {
  home: number;
  away: number;
}

export type ScoreWarningKind =
  | 'below-target'
  | 'short-margin'
  | 'over-cap'
  | 'past-target'
  | 'level-set'
  | 'too-many-sets'
  | 'set-after-decided'
  | 'missing-set'
  | 'undecided';

export interface ScoreWarning {
  kind: ScoreWarningKind;
  /** 1-based, for warnings about one set. Absent for warnings about the match. */
  setNumber?: number;
  /** One sentence the organizer reads before confirming. */
  message: string;
}

export interface ScoreCheck {
  /** Input that is not a score. Non-empty means do not save. */
  errors: string[];
  /** Accepted, but shown. Never a reason to refuse the save. */
  warnings: ScoreWarning[];
}

export function checkScore(input: { sets: readonly EnteredSet[]; format: SetFormat }): ScoreCheck {
  const { sets, format } = input;
  const errors: string[] = [];
  const warnings: ScoreWarning[] = [];

  if (sets.length === 0) {
    return { errors: ['Enter at least one set.'], warnings };
  }
  for (const [index, set] of sets.entries()) {
    const n = index + 1;
    if (!Number.isInteger(set.home) || !Number.isInteger(set.away)) {
      errors.push(`Set ${n} needs whole numbers.`);
    } else if (set.home < 0 || set.away < 0) {
      errors.push(`Set ${n} cannot have negative points.`);
    }
  }
  if (errors.length > 0) return { errors, warnings };

  const { rules } = format;
  const needed = format.deciderSetNumber === null ? null : Math.floor(rules.length / 2) + 1;
  let homeSets = 0;
  let awaySets = 0;

  for (const [index, set] of sets.entries()) {
    const setNumber = index + 1;
    const rule = rules[index];

    if (needed !== null && (homeSets >= needed || awaySets >= needed)) {
      warnings.push({
        kind: 'set-after-decided',
        setNumber,
        message: `Set ${setNumber} was entered after the match was already won. Check it belongs to this match.`,
      });
    }

    if (set.home === set.away) {
      warnings.push({
        kind: 'level-set',
        setNumber,
        message: `Set ${setNumber} is level at ${set.home}–${set.away}. It counts for neither side.`,
      });
      continue;
    }
    if (set.home > set.away) homeSets += 1;
    else awaySets += 1;

    // Past the format's last set there is no rule to measure against;
    // `too-many-sets` below says so once for the match.
    if (!rule) continue;

    const winner = Math.max(set.home, set.away);
    const loser = Math.min(set.home, set.away);
    const score = `${set.home}–${set.away}`;

    if (winner < rule.target) {
      warnings.push({
        kind: 'below-target',
        setNumber,
        message: `Set ${setNumber} finished ${score}, short of ${rule.target}. Fine for a time cap — check it was not mistyped.`,
      });
    } else if (rule.cap !== null && winner > rule.cap) {
      warnings.push({
        kind: 'over-cap',
        setNumber,
        message: `Set ${setNumber} finished ${score}, past the cap of ${rule.cap}.`,
      });
    } else if (winner - loser < rule.winBy && (rule.cap === null || winner < rule.cap)) {
      warnings.push({
        kind: 'short-margin',
        setNumber,
        message: `Set ${setNumber} finished ${score}. Sets are won by ${rule.winBy}.`,
      });
    } else if (winner > Math.max(rule.target, loser + rule.winBy)) {
      warnings.push({
        kind: 'past-target',
        setNumber,
        message: `Set ${setNumber} finished ${score}, but it was over at ${Math.max(rule.target, loser + rule.winBy)}.`,
      });
    }
  }

  if (sets.length > rules.length) {
    warnings.push({
      kind: 'too-many-sets',
      message: `${sets.length} sets entered; this match is ${format.label.toLowerCase()}.`,
    });
  }

  if (needed === null) {
    if (sets.length < rules.length) {
      warnings.push({
        kind: 'missing-set',
        message: `${sets.length} of ${rules.length} sets entered. Pool standings count what is here.`,
      });
    }
  } else if (homeSets < needed && awaySets < needed) {
    warnings.push({
      kind: 'undecided',
      message:
        'Nobody has won this match yet. The score is saved, but the bracket will not advance until it has a winner.',
    });
  }

  return { errors, warnings };
}
