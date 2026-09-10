/**
 * Phase 4 (calendar / validation / export / dashboard) helpers.
 *
 * Re-exports the Phase 3 populated-sandbox helper (same needs — a throwaway
 * schedule seeded with the roster) plus a small API helper for placing known
 * assignments, and a weekday finder that avoids the seeded blackout dates.
 */

import { apiOf, fromToday, type Page } from '../../fixtures';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

export { populatedSandbox, type SeededRoster, type RosterEntity } from '../phase-3/helpers';

/** A weekday `atLeast` days out, as YYYY-MM-DD (skips Sat/Sun). */
export function futureWeekday(atLeast: number): string {
	let n = atLeast;
	for (;;) {
		const dow = new Date(`${fromToday(n)}T00:00:00Z`).getUTCDay();
		if (dow !== 0 && dow !== 6) return fromToday(n);
		n++;
	}
}

/**
 * The first weekday `atLeast` days out on which NONE of `studentIds` already has
 * an assignment on ANY schedule. The DB enforces a global UNIQUE(student_id,
 * date), so the seeded Demo rows must be avoided when placing sandbox rows.
 */
export async function freeWeekdayForStudents(
	db: Kysely<DB>,
	studentIds: string[],
	atLeast: number,
	exclude: string[] = []
): Promise<string> {
	const rows = await db
		.selectFrom('schedule_assignments')
		.select('date')
		.where('student_id', 'in', studentIds)
		.execute();
	const used = new Set([...rows.map((r) => r.date), ...exclude]);
	let n = atLeast;
	for (;;) {
		const d = fromToday(n);
		const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
		if (dow !== 0 && dow !== 6 && !used.has(d)) return d;
		n++;
	}
}

/** Create one manual assignment through the API; returns its id. */
export async function createAssignment(
	page: Page,
	a: {
		student_id: string;
		preceptor_id: string;
		clerkship_id: string;
		site_id?: string;
		date: string;
		override_codes?: string[];
	}
): Promise<string> {
	const res = await apiOf(page).post<{ id?: string; assignment?: { id: string } }>(
		'/api/schedules/assignments',
		a
	);
	if (!res.ok) {
		throw new Error(`createAssignment failed (${res.status}): ${JSON.stringify(res.error)}`);
	}
	// The create endpoint returns either { assignment } or the row directly.
	const id = res.data?.assignment?.id ?? res.data?.id;
	if (!id) throw new Error(`createAssignment: no id in response ${JSON.stringify(res.data)}`);
	return id;
}
