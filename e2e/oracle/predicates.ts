/**
 * Per-constraint predicates that mirror the *requirement* (not the implementation).
 *
 * Journeys use these to compute the conflicts a given placement should produce,
 * then assert the app agrees (dialog UI + validation API + conflict panels). Each
 * predicate is the executable spec of one rule, so if the app diverges from the
 * requirement the assertion fails — which is the point of the journey.
 *
 * They are pure and date-based; keep them tiny and obviously-correct.
 */

export type Session = 'full' | 'am' | 'pm';

/** Monday-anchored week key (UTC), matching the app's `weekKey`. */
export function weekKey(date: string): string {
	const d = new Date(`${date}T00:00:00Z`);
	const sinceMonday = (d.getUTCDay() + 6) % 7;
	d.setUTCDate(d.getUTCDate() - sinceMonday);
	return d.toISOString().slice(0, 10);
}

/** Two sessions occupy the same slot (→ session_clash). */
export function sessionsOverlap(a: Session, b: Session): boolean {
	if (a === 'full' || b === 'full') return true;
	return a === b;
}

/** `date` falls in a week consumed by one of the student's block placements (→ block_week_conflict). */
export function inBlockWeek(date: string, blockDates: string[]): boolean {
	const weeks = new Set(blockDates.map(weekKey));
	return weeks.has(weekKey(date));
}

/** Student already holds a session that overlaps `session` on `date` (→ session_clash). */
export function dayOccupied(
	heldSessionsOnDate: Session[],
	session: Session
): boolean {
	return heldSessionsOnDate.some((s) => sessionsOverlap(s, session));
}

/** `date` is strictly before today (→ past_date). */
export function isPast(date: string): boolean {
	const today = new Date().toISOString().slice(0, 10);
	return date < today;
}

/** `date` is outside [start, end] (→ outside_schedule). */
export function outsideSchedule(date: string, start: string, end: string): boolean {
	return date < start || date > end;
}
