/**
 * Day states for the assignment date picker (Step 17).
 *
 * Classifies every date in a range in one round trip, so the picker can render
 * a month grid showing what the preceptor's availability actually is and which
 * days are already spoken for — instead of a bare `<input type="date">`.
 */

import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { getScheduleRange } from '$lib/api/schedule-context';

export type DayAvailabilityState = 'available' | 'unavailable' | 'unset' | 'blackout';

export interface DayBooking {
	assignmentId: string;
	studentId: string;
	studentName: string;
}

export interface DayState {
	date: string;
	/** Within the active schedule's start/end range. */
	inRange: boolean;
	state: DayAvailabilityState;
	/** Students the preceptor already has on this day. */
	preceptorBookings: DayBooking[];
	preceptorAtCapacity: boolean;
	/** The student already has an assignment (of any kind) on this day. */
	studentBusy: boolean;
	/** Strictly before today — today itself is not past. */
	isPast: boolean;
}

export interface DayStateQuery {
	preceptorId?: string | null;
	studentId?: string | null;
	siteId?: string | null;
	from: string;
	to: string;
	/**
	 * Assignment id to exclude from booking/busy/capacity counts (edit mode) —
	 * so the assignment being edited never conflicts with itself.
	 */
	excludeId?: string | null;
}

function todayUTC(): string {
	return new Date().toISOString().split('T')[0];
}

/** Every YYYY-MM-DD from `from` to `to` inclusive. */
export function expandDateRange(from: string, to: string): string[] {
	const dates: string[] = [];
	if (from > to) return dates;
	const cur = new Date(from + 'T00:00:00.000Z');
	const last = new Date(to + 'T00:00:00.000Z');
	while (cur <= last) {
		dates.push(cur.toISOString().split('T')[0]);
		cur.setUTCDate(cur.getUTCDate() + 1);
	}
	return dates;
}

/**
 * Classify each date between `from` and `to`.
 *
 * @param today - injectable for tests; defaults to today (UTC).
 */
export async function getDayStates(
	db: Kysely<DB>,
	scheduleId: string,
	query: DayStateQuery,
	today: string = todayUTC()
): Promise<DayState[]> {
	const dates = expandDateRange(query.from, query.to);
	if (dates.length === 0) return [];

	const range = await getScheduleRange(db, scheduleId);

	// Preceptor availability (site-scoped). With a site selected we look only at
	// that site's rows; without one, the preceptor counts as available if they
	// are available at *any* of their sites that day.
	let availabilityRows: { date: string; is_available: number }[] = [];
	let maxStudents = 0;
	let bookingRows: { id: string | null; date: string; student_id: string; student_name: string }[] =
		[];

	if (query.preceptorId) {
		let availQuery = db
			.selectFrom('preceptor_availability')
			.select(['date', 'is_available'])
			.where('preceptor_id', '=', query.preceptorId)
			.where('date', '>=', query.from)
			.where('date', '<=', query.to);
		if (query.siteId) availQuery = availQuery.where('site_id', '=', query.siteId);
		availabilityRows = await availQuery.execute();

		const preceptor = await db
			.selectFrom('preceptors')
			.select('max_students')
			.where('id', '=', query.preceptorId)
			.executeTakeFirst();
		maxStudents = preceptor?.max_students ?? 0;

		let bookingQuery = db
			.selectFrom('schedule_assignments as sa')
			.innerJoin('students as s', 's.id', 'sa.student_id')
			.select([
				'sa.id as id',
				'sa.date as date',
				'sa.student_id as student_id',
				's.name as student_name'
			])
			.where('sa.preceptor_id', '=', query.preceptorId)
			.where('sa.date', '>=', query.from)
			.where('sa.date', '<=', query.to);
		// Edit mode: the assignment being edited must not count against its own
		// preceptor's bookings/capacity.
		if (query.excludeId) bookingQuery = bookingQuery.where('sa.id', '!=', query.excludeId);
		bookingRows = await bookingQuery.execute();
	}

	const blackoutRows = await db
		.selectFrom('blackout_dates')
		.select('date')
		.where('date', '>=', query.from)
		.where('date', '<=', query.to)
		.execute();
	const blackouts = new Set(blackoutRows.map((b) => b.date));

	let studentBusyDates = new Set<string>();
	if (query.studentId) {
		let busyQuery = db
			.selectFrom('schedule_assignments')
			.select('date')
			.where('student_id', '=', query.studentId)
			.where('date', '>=', query.from)
			.where('date', '<=', query.to);
		// Edit mode: don't let the edited assignment mark its own day as busy.
		if (query.excludeId) busyQuery = busyQuery.where('id', '!=', query.excludeId);
		const rows = await busyQuery.execute();
		studentBusyDates = new Set(rows.map((r) => r.date));
	}

	// date -> is any explicit availability row present, and is any of them "available"
	const availableOn = new Set<string>();
	const anyRowOn = new Set<string>();
	for (const row of availabilityRows) {
		anyRowOn.add(row.date);
		if (row.is_available === 1) availableOn.add(row.date);
	}

	const bookingsByDate = new Map<string, DayBooking[]>();
	for (const row of bookingRows) {
		if (!row.id) continue;
		const list = bookingsByDate.get(row.date) ?? [];
		list.push({ assignmentId: row.id, studentId: row.student_id, studentName: row.student_name });
		bookingsByDate.set(row.date, list);
	}

	return dates.map((date) => {
		let state: DayAvailabilityState;
		if (blackouts.has(date)) {
			// Blackout wins over an explicit "available".
			state = 'blackout';
		} else if (!query.preceptorId || !anyRowOn.has(date)) {
			state = 'unset';
		} else {
			state = availableOn.has(date) ? 'available' : 'unavailable';
		}

		const preceptorBookings = bookingsByDate.get(date) ?? [];

		return {
			date,
			inRange: date >= range.start && date <= range.end,
			state,
			preceptorBookings,
			preceptorAtCapacity: !!query.preceptorId && preceptorBookings.length >= maxStudents,
			studentBusy: studentBusyDates.has(date),
			isPast: date < today
		};
	});
}
