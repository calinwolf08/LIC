/**
 * Half-day session slots (client feedback L1 follow-up).
 *
 * A student may earn more than one day of credit on a date — e.g. a full-day
 * clerkship in the morning plus a half-day of another clerkship in the afternoon.
 * Credit is uncapped; instead each availability slot and each assignment carries a
 * `session`, and two assignments clash only when their sessions overlap:
 *
 *   - a `full` day overlaps everything,
 *   - `am` overlaps `am` (and `full`),
 *   - `pm` overlaps `pm` (and `full`),
 *   - `am` + `pm` never overlap.
 *
 * AM/PM slots default to half a day of credit; a full day defaults to one. The
 * default is overridable per availability slot and per assignment.
 */

export type SessionSlot = 'full' | 'am' | 'pm';

export const SESSION_SLOTS: readonly SessionSlot[] = ['full', 'am', 'pm'] as const;

export const SESSION_LABEL: Record<SessionSlot, string> = {
	full: 'Full day',
	am: 'Morning (AM)',
	pm: 'Afternoon (PM)'
};

/** Coerce any stored/user value to a valid slot, defaulting to a full day. */
export function normalizeSession(value: string | null | undefined): SessionSlot {
	return value === 'am' || value === 'pm' ? value : 'full';
}

/** A half-day slot is worth 0.5 by default; a full day is worth 1. */
export function defaultCreditForSession(session: SessionSlot): number {
	return session === 'full' ? 1 : 0.5;
}

/** Two sessions overlap unless they are the two distinct half-days (AM vs PM). */
export function sessionsOverlap(a: SessionSlot, b: SessionSlot): boolean {
	if (a === 'full' || b === 'full') return true;
	return a === b;
}

/** Does adding `candidate` clash with any session already on the student's day? */
export function sessionClashes(existing: SessionSlot[], candidate: SessionSlot): boolean {
	return existing.some((s) => sessionsOverlap(s, candidate));
}
