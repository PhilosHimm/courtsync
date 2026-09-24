'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/components/app/forms';
import { int, lines, now, run, text } from '@/lib/app/action';
import { actorOf, requireUser } from '@/lib/auth/server';
import type { AttendanceStatus, ForfeitPolicy, Tiebreaker } from '@/lib/core';
import { FORFEIT_POLICIES, TIEBREAKER_ORDER } from '@/lib/core';
import { duplicateEvent } from '@/lib/db/backup';
import { getDb } from '@/lib/db/client';
import { serverEnv } from '@/lib/db/env';
import { InvalidInputError } from '@/lib/db/errors';
import {
  addCoOrganizer,
  deleteEvent,
  type EventTransition,
  removeCoOrganizer,
  transitionEvent,
  updateBasics,
  updateFormatSettings,
} from '@/lib/db/events';
import {
  addWalkIn,
  cancelSession,
  hostAddToSession,
  hostSetAttendance,
  postAnnouncement,
  postponeSession,
  reinstateSession,
} from '@/lib/db/people';
import {
  generateSchedule,
  moveMatch,
  redrawPools,
  seedPlayoffs,
  setMatchStatus,
  withdrawTeam,
} from '@/lib/db/schedule';
import { issueScoreLink, recordScore, revokeScoreLinks } from '@/lib/db/scores';
import { saveCourts, saveCourtWindows, saveParticipants, saveSessions } from '@/lib/db/setup';

/**
 * Every organizer action for one event. Each one reads the event id from the
 * form, identifies the signed-in person, and hands both to the data layer —
 * which checks, itself, that this person may do this to this event (rule 6).
 * Nothing here is a security boundary; the id in the form is untrusted and
 * treated that way.
 */

async function context(form: FormData) {
  const id = text(form, 'id');
  const user = await requireUser(`/events/${id}`);
  return { id, actor: actorOf(user), db: await getDb() };
}

function done(id: string, state: FormState): FormState {
  if (state?.ok) revalidatePath(`/events/${id}`, 'layout');
  return state;
}

const conflictsLine = (conflicts: ReadonlyArray<{ severity: string }>) => {
  const blocking = conflicts.filter((c) => c.severity === 'blocking').length;
  const warnings = conflicts.length - blocking;
  if (conflicts.length === 0) return 'The audit found nothing wrong.';
  return `The audit found ${blocking} blocking conflict${blocking === 1 ? '' : 's'} and ${warnings} warning${warnings === 1 ? '' : 's'} — see below.`;
};

// ── setup steps ──────────────────────────────────────────────────────────

export async function basicsAction(_: FormState, form: FormData): Promise<FormState> {
  const { id, actor, db } = await context(form);
  const fee = text(form, 'fee');
  return done(
    id,
    await run(async () => {
      await updateBasics(db, actor, id, {
        name: text(form, 'name'),
        description: text(form, 'description'),
        venueName: text(form, 'venueName'),
        venueAddress: text(form, 'venueAddress'),
        registrationFee: fee === '' ? null : Number(fee),
        timeZone: text(form, 'timeZone'),
      });
      return 'Saved.';
    }),
  );
}

const ruleRows = (form: FormData, phase: string) => {
  const targets = form.getAll(`${phase}_target`).map(String);
  const winBys = form.getAll(`${phase}_winBy`).map(String);
  const caps = form.getAll(`${phase}_cap`).map(String);
  return targets
    .map((t, i) => ({ t: t.trim(), w: (winBys[i] ?? '2').trim(), c: (caps[i] ?? '').trim() }))
    .filter((r) => r.t !== '')
    .map((r) => ({
      target: Number(r.t),
      winBy: Number(r.w || '2'),
      cap: r.c === '' ? null : Number(r.c),
    }));
};

export async function formatAction(_: FormState, form: FormData): Promise<FormState> {
  const { id, actor, db } = await context(form);
  return done(
    id,
    await run(async () => {
      const policy = text(form, 'forfeitPolicy') as ForfeitPolicy;
      if (!FORFEIT_POLICIES.includes(policy)) throw new InvalidInputError('Choose a forfeit rule.');
      const order = form
        .getAll('tiebreaker')
        .map(String)
        .filter((t): t is Tiebreaker => (TIEBREAKER_ORDER as readonly string[]).includes(t));
      await updateFormatSettings(db, actor, id, {
        gameDurationMin: int(form, 'gameDurationMin') ?? 45,
        bufferMin: int(form, 'bufferMin') ?? 0,
        poolCount: int(form, 'poolCount') ?? null,
        bracketTiers: lines(form, 'bracketTiers').length > 0 ? lines(form, 'bracketTiers') : null,
        minRestMin: int(form, 'minRestMin') ?? 0,
        playersPerSide: int(form, 'playersPerSide') ?? null,
        capacity: int(form, 'capacity') ?? null,
        skillLabel: text(form, 'skillLabel') || null,
        forfeitPolicy: policy,
        tiebreakerOrder: order.length > 0 ? order : null,
        setFormats: { pool: ruleRows(form, 'pool'), playoff: ruleRows(form, 'playoff') },
      });
      return 'Saved. Match length and buffer apply to days you add or change from here on.';
    }),
  );
}

export async function entriesAction(_: FormState, form: FormData): Promise<FormState> {
  const { id, actor, db } = await context(form);
  const ids = form.getAll('entry_id').map(String);
  const names = form.getAll('entry_name').map(String);
  const seeds = form.getAll('entry_seed').map(String);
  const rosters = form.getAll('entry_roster').map(String);
  const removed = new Set(form.getAll('entry_remove').map(String));
  const kept = ids
    .map((entryId, i) => ({
      id: entryId,
      name: names[i] ?? '',
      seed: seeds[i]?.trim() ? Number(seeds[i]) : undefined,
      players: (rosters[i] ?? '')
        .split('\n')
        .map((n) => n.trim())
        .filter(Boolean),
    }))
    .filter((e) => !removed.has(e.id));
  const added = lines(form, 'newEntries').map((name) => ({
    name,
    kind: text(form, 'kind') === 'individual' ? ('individual' as const) : ('team' as const),
  }));
  return done(
    id,
    await run(async () => {
      await saveParticipants(db, actor, id, [...kept, ...added]);
      return `Saved ${kept.length + added.length} entries.`;
    }),
  );
}

export async function courtsAction(_: FormState, form: FormData): Promise<FormState> {
  const { id, actor, db } = await context(form);
  const ids = form.getAll('court_id').map(String);
  const names = form.getAll('court_name').map(String);
  const inactive = new Set(form.getAll('court_inactive').map(String));
  const removed = new Set(form.getAll('court_remove').map(String));
  const courts = [
    ...ids
      .map((courtId, i) => ({
        id: courtId,
        name: names[i] ?? '',
        isActive: !inactive.has(courtId),
      }))
      .filter((c) => !removed.has(c.id)),
    ...lines(form, 'newCourts').map((name) => ({ name })),
  ];
  return done(
    id,
    await run(async () => {
      await saveCourts(db, actor, id, courts);
      return 'Courts saved.';
    }),
  );
}

export async function sessionsAction(_: FormState, form: FormData): Promise<FormState> {
  const { id, actor, db } = await context(form);
  const ids = form.getAll('session_id').map(String);
  const col = (k: string) => form.getAll(k).map(String);
  const [names, dates, starts, ends] = [
    col('session_name'),
    col('session_date'),
    col('session_start'),
    col('session_end'),
  ];
  const removed = new Set(col('session_remove'));
  const sessions = ids
    .map((sid, i) => ({
      ...(sid.startsWith('new-') ? {} : { id: sid }),
      key: sid,
      name: names[i] ?? '',
      playDate: dates[i] ?? '',
      startTime: starts[i] ?? '',
      endTime: ends[i] ?? '',
    }))
    .filter((s) => !removed.has(s.key) && !(s.key.startsWith('new-') && !s.playDate))
    .map(({ key: _key, ...s }) => s);
  return done(
    id,
    await run(async () => {
      const { unplaced } = await saveSessions(db, actor, id, sessions);
      return unplaced > 0
        ? `Saved. ${unplaced} match${unplaced === 1 ? '' : 'es'} lost their slot when the hours changed — regenerate or place them on the schedule board.`
        : 'Days saved.';
    }),
  );
}

export async function windowsAction(_: FormState, form: FormData): Promise<FormState> {
  const { id, actor, db } = await context(form);
  const col = (k: string) => form.getAll(k).map(String);
  const [courts, sessions, starts, ends] = [
    col('w_court'),
    col('w_session'),
    col('w_start'),
    col('w_end'),
  ];
  const windows = courts
    .map((courtId, i) => ({
      courtId,
      sessionId: sessions[i] ?? '',
      startTime: starts[i] ?? '',
      endTime: ends[i] ?? '',
    }))
    .filter((w) => w.courtId && w.sessionId && w.startTime && w.endTime);
  return done(
    id,
    await run(async () => {
      await saveCourtWindows(db, actor, id, windows);
      return windows.length === 0
        ? 'Every court is available all day.'
        : `Saved ${windows.length} window${windows.length === 1 ? '' : 's'}.`;
    }),
  );
}

// ── schedule ─────────────────────────────────────────────────────────────

export async function generateAction(_: FormState, form: FormData): Promise<FormState> {
  const { id, actor, db } = await context(form);
  return done(
    id,
    await run(async () => {
      const report = await generateSchedule(db, actor, id);
      const parts = ['Schedule generated.'];
      if (report.kept.length > 0)
        parts.push(
          `${report.kept.length} played or live match(es) were kept exactly as they were.`,
        );
      if (report.unplaced.length > 0)
        parts.push(`${report.unplaced.length} match(es) did not fit on the grid.`);
      if (report.unrefereed.length > 0)
        parts.push(`${report.unrefereed.length} match(es) have no referee.`);
      parts.push(conflictsLine(report.conflicts));
      return parts.join(' ');
    }),
  );
}

export async function redrawAction(_: FormState, form: FormData): Promise<FormState> {
  const { id, actor, db } = await context(form);
  return done(
    id,
    await run(async () => {
      await redrawPools(db, actor, id);
      return 'Pools and pool play cleared. Generate again to draw fresh pools.';
    }),
  );
}

export async function seedAction(_: FormState, form: FormData): Promise<FormState> {
  const { id, actor, db } = await context(form);
  return done(
    id,
    await run(async () => {
      const report = await seedPlayoffs(db, actor, id);
      return `Playoffs seeded from the pool tables. ${report.unplaced.length > 0 ? `${report.unplaced.length} playoff match(es) did not fit — place them on the board. ` : ''}${conflictsLine(report.conflicts)}`;
    }),
  );
}

export async function moveAction(_: FormState, form: FormData): Promise<FormState> {
  const { id, actor, db } = await context(form);
  const cell = text(form, 'cell');
  const [courtId, timeslotId] = cell === 'unplace' ? [null, null] : cell.split('|');
  return done(
    id,
    await run(async () => {
      const conflicts = await moveMatch(db, actor, id, text(form, 'match'), {
        courtId: courtId || null,
        timeslotId: timeslotId || null,
      });
      return `Moved. ${conflictsLine(conflicts)}`;
    }),
  );
}

export async function statusAction(_: FormState, form: FormData): Promise<FormState> {
  const { id, actor, db } = await context(form);
  const status = text(form, 'status');
  if (!['scheduled', 'live', 'delayed', 'cancelled'].includes(status))
    return { ok: false, message: 'Choose a status.' };
  return done(
    id,
    await run(async () => {
      await setMatchStatus(
        db,
        actor,
        id,
        text(form, 'match'),
        status as 'scheduled' | 'live' | 'delayed' | 'cancelled',
      );
      return 'Status saved.';
    }),
  );
}

export async function withdrawAction(_: FormState, form: FormData): Promise<FormState> {
  const { id, actor, db } = await context(form);
  if (text(form, 'confirm') !== 'yes')
    return { ok: false, message: 'Tick the box to confirm the withdrawal.' };
  return done(
    id,
    await run(async () => {
      const r = await withdrawTeam(db, actor, id, text(form, 'participant'), now());
      return `Withdrawn. ${r.forfeited.length} match(es) recorded as forfeits; ${r.refereeCleared.length} now need a referee.${r.unresolved.length > 0 ? ` ${r.unresolved.length} bracket match(es) wait for their opponent.` : ''} Nothing else moved.`;
    }),
  );
}

// ── scores ───────────────────────────────────────────────────────────────

export async function scoreAction(_: FormState, form: FormData): Promise<FormState> {
  const { id, actor, db } = await context(form);
  const homes = form.getAll('home').map(String);
  const aways = form.getAll('away').map(String);
  const sets = homes
    .map((h, i) => ({ h: h.trim(), a: (aways[i] ?? '').trim() }))
    .filter((s) => s.h !== '' || s.a !== '')
    .map((s) => ({ home: Number(s.h), away: Number(s.a) }));
  const result = await recordScore(
    db,
    { kind: 'organizer', actor },
    id,
    text(form, 'match'),
    sets,
    {
      now: now(),
      confirm: text(form, 'confirm') === 'yes',
      ...(text(form, 'reason') ? { reason: text(form, 'reason') } : {}),
    },
  );
  if (result.kind === 'invalid') return { ok: false, message: result.errors.join(' ') };
  if (result.kind === 'confirm') return { ok: true, data: result };
  revalidatePath(`/events/${id}`, 'layout');
  return { ok: true, message: 'Score saved.', data: result };
}

export async function issueLinkAction(_: FormState, form: FormData): Promise<FormState> {
  const { id, actor, db } = await context(form);
  return run(async () => {
    const { token } = await issueScoreLink(db, actor, id, text(form, 'match'), now());
    return {
      message: 'New link issued. Any earlier link for this match stopped working.',
      data: `${serverEnv().appUrl}/score/${token}`,
    };
  });
}

export async function revokeLinkAction(_: FormState, form: FormData): Promise<FormState> {
  const { id, actor, db } = await context(form);
  return run(async () => {
    const n = await revokeScoreLinks(db, actor, id, text(form, 'match'), now());
    return n > 0 ? 'Link revoked.' : 'There was no active link.';
  });
}

// ── the event's life ─────────────────────────────────────────────────────

export async function transitionAction(_: FormState, form: FormData): Promise<FormState> {
  const { id, actor, db } = await context(form);
  const transition = text(form, 'transition') as EventTransition;
  if (!['publish', 'unpublish', 'archive', 'restore'].includes(transition))
    return { ok: false, message: 'Unknown action.' };
  return done(
    id,
    await run(async () => {
      await transitionEvent(db, actor, id, transition, now());
      return {
        publish: 'Published. The public page is live.',
        unpublish: 'Back to a draft. The public page is gone.',
        archive: 'Archived.',
        restore: 'Restored as a draft.',
      }[transition];
    }),
  );
}

export async function deleteAction(_: FormState, form: FormData): Promise<FormState> {
  const { id, actor, db } = await context(form);
  const result = await run(async () => {
    await deleteEvent(db, actor, id, text(form, 'typedName'));
    return undefined;
  });
  if (result?.ok) redirect('/events');
  return result;
}

export async function duplicateAction(_: FormState, form: FormData): Promise<FormState> {
  const { id, actor, db } = await context(form);
  let copy = '';
  const result = await run(async () => {
    copy = await duplicateEvent(db, actor, id, text(form, 'name'));
    return undefined;
  });
  if (result?.ok) redirect(`/events/${copy}/setup/basics`);
  return result;
}

export async function addCoOrganizerAction(_: FormState, form: FormData): Promise<FormState> {
  const { id, actor, db } = await context(form);
  return done(
    id,
    await run(async () => {
      await addCoOrganizer(db, actor, id, text(form, 'email'));
      return 'Added. They will see this event under Your events.';
    }),
  );
}

export async function removeCoOrganizerAction(_: FormState, form: FormData): Promise<FormState> {
  const { id, actor, db } = await context(form);
  return done(
    id,
    await run(async () => {
      await removeCoOrganizer(db, actor, id, text(form, 'user'));
      return 'Removed.';
    }),
  );
}

// ── the door, the season, the notice board ───────────────────────────────

export async function hostStatusAction(_: FormState, form: FormData): Promise<FormState> {
  const { id, actor, db } = await context(form);
  const status = text(form, 'status') as AttendanceStatus;
  return done(
    id,
    await run(async () => {
      const { promoted } = await hostSetAttendance(
        db,
        actor,
        id,
        text(form, 'session'),
        text(form, 'participant'),
        status,
        now(),
      );
      return promoted.length > 0
        ? `Saved. ${promoted.length} promoted off the waitlist and told.`
        : 'Saved.';
    }),
  );
}

export async function hostAddAction(_: FormState, form: FormData): Promise<FormState> {
  const { id, actor, db } = await context(form);
  return done(
    id,
    await run(async () => {
      await hostAddToSession(
        db,
        actor,
        id,
        text(form, 'session'),
        text(form, 'participant'),
        now(),
      );
      return 'Added.';
    }),
  );
}

export async function walkInAction(_: FormState, form: FormData): Promise<FormState> {
  const { id, actor, db } = await context(form);
  return done(
    id,
    await run(async () => {
      await addWalkIn(db, actor, id, text(form, 'session'), text(form, 'name'), now());
      return `${text(form, 'name')} is checked in.`;
    }),
  );
}

export async function announceAction(_: FormState, form: FormData): Promise<FormState> {
  const { id, actor, db } = await context(form);
  return done(
    id,
    await run(async () => {
      await postAnnouncement(
        db,
        actor,
        id,
        { body: text(form, 'body'), sessionId: text(form, 'session') || null },
        now(),
      );
      return 'Posted. Players and followers who opted in will be told.';
    }),
  );
}

export async function cancelSessionAction(_: FormState, form: FormData): Promise<FormState> {
  const { id, actor, db } = await context(form);
  return done(
    id,
    await run(async () => {
      await cancelSession(
        db,
        actor,
        id,
        text(form, 'session'),
        text(form, 'reason') || null,
        now(),
      );
      return 'Cancelled. Everyone following has been told.';
    }),
  );
}

export async function reinstateAction(_: FormState, form: FormData): Promise<FormState> {
  const { id, actor, db } = await context(form);
  return done(
    id,
    await run(async () => {
      await reinstateSession(db, actor, id, text(form, 'session'));
      return 'Reinstated.';
    }),
  );
}

export async function postponeAction(_: FormState, form: FormData): Promise<FormState> {
  const { id, actor, db } = await context(form);
  const mode = text(form, 'mode') === 'cascade' ? 'cascade' : 'only';
  return done(
    id,
    await run(async () => {
      const { moved } = await postponeSession(
        db,
        actor,
        id,
        text(form, 'session'),
        text(form, 'newDate'),
        mode,
        now(),
      );
      return moved.length === 0
        ? 'That is already its date.'
        : `Moved ${moved.length} week${moved.length === 1 ? '' : 's'}. Teams following have been told.`;
    }),
  );
}
