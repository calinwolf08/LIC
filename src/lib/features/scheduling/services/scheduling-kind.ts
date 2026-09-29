/**
 * Clerkship scheduling kind + week derivation (client feedback L3).
 *
 * A clerkship is scheduled as one of two kinds:
 *  - `block` (inpatient): the student is on it for whole weeks at a time. A single
 *    block assignment on any day consumes that entire calendar week.
 *  - `scattered` (outpatient): individual days placed across the schedule.
 *
 * The two mix on one student: weeks consumed by a block are unavailable for
 * scattered days. There is no separate cap — the block weeks are *derived* from
 * the block assignments, and scattered days landing in them are flagged
 * (`block_week_conflict`, soft/overridable for Basic; the gated auto-placer
 * avoids them).
 */

export type SchedulingKind = 'block' | 'scattered';

export const SCHEDULING_KINDS: readonly SchedulingKind[] = ['scattered', 'block'] as const;

/** Default kind for a clerkship with no explicit setting (existing behaviour). */
export const DEFAULT_SCHEDULING_KIND: SchedulingKind = 'scattered';

/** Coerce any stored/absent value to a valid scheduling kind. */
export function normalizeSchedulingKind(value: string | null | undefined): SchedulingKind {
	return value === 'block' ? 'block' : 'scattered';
}

export const SCHEDULING_KIND_LABEL: Record<SchedulingKind, string> = {
	block: 'Block (inpatient — whole weeks)',
	scattered: 'Scattered (outpatient — individual days)'
};

/**
 * The week a date belongs to, identified by the Monday of that week (UTC,
 * ISO-8601 week start). Two dates share a week key when they fall in the same
 * Monday–Sunday span, so a block assignment on any weekday consumes the whole
 * week and a scattered day only conflicts when it lands in that same span
 * (partial-week boundary handled naturally: the next Monday is a different key).
 */
export function weekKey(date: string): string {
	const d = new Date(`${date}T00:00:00Z`);
	if (Number.isNaN(d.getTime())) return date;
	const dow = d.getUTCDay(); // 0 = Sunday … 6 = Saturday
	const sinceMonday = (dow + 6) % 7; // Monday = 0
	d.setUTCDate(d.getUTCDate() - sinceMonday);
	return d.toISOString().slice(0, 10);
}

/**
 * The set of week keys consumed by block-kind assignments, from rows carrying a
 * date and their clerkship's scheduling kind.
 */
export function blockWeeksOf(
	rows: Iterable<{ date: string; kind: SchedulingKind }>
): Set<string> {
	const weeks = new Set<string>();
	for (const r of rows) {
		if (r.kind === 'block') weeks.add(weekKey(r.date));
	}
	return weeks;
}
