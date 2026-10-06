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
import { normalizeSession, type SessionSlot } from './session-slots';

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
	/** Sum of the student's existing credit on this day (excluding `excludeId`). */
	studentBookedCredit: number;
	/**
	 * The sessions the student already occupies on this day (excluding `excludeId`).
	 * Lets the dialog flag a real session clash (AM+AM, PM+PM, full+anything) while
	 * a morning + afternoon pair passes (L1).
	 */
	studentSessions: SessionSlot[];
	/** The preceptor's available session that day (for prefilling the dialog), or null. */
	availableSession: SessionSlot | null;
	/** The preceptor's default credit that day (for prefilling the dialog), or null. */
	availableCredit: number | null;
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
	let availabilityRows: {
		date: string;
		is_available: number;
		session: string;
		credit_value: number;
	}[] = [];
	let maxStudents = 0;
	let bookingRows: { id: string | null; date: string; student_id: string; student_name: string }[] =
		[];

	if (query.preceptorId) {
		let availQuery = db
			.selectFrom('preceptor_availability')
			.select(['date', 'is_available', 'session', 'credit_value'])
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
		.where('schedule_id', '=', scheduleId)
		.where('date', '>=', query.from)
		.where('date', '<=', query.to)
		.execute();
	const blackouts = new Set(blackoutRows.map((b) => b.date));

	const studentCreditByDate = new Map<string, number>();
	const studentSessionsByDate = new Map<string, SessionSlot[]>();
	if (query.studentId) {
		let busyQuery = db
			.selectFrom('schedule_assignments')
			.select(['date', 'credit_value', 'session'])
			.where('student_id', '=', query.studentId)
			.where('date', '>=', query.from)
			.where('date', '<=', query.to);
		// Edit mode: don't let the edited assignment mark its own day as busy.
		if (query.excludeId) busyQuery = busyQuery.where('id', '!=', query.excludeId);
		const rows = await busyQuery.execute();
		for (const r of rows) {
			const credit = typeof r.credit_value === 'number' && r.credit_value > 0 ? r.credit_value : 1;
			studentCreditByDate.set(r.date, (studentCreditByDate.get(r.date) ?? 0) + credit);
			const list = studentSessionsByDate.get(r.date) ?? [];
			list.push(normalizeSession(r.session));
			studentSessionsByDate.set(r.date, list);
		}
	}

	// date -> is any explicit availability row present, is any "available", and the
	// (first available) row's default session + credit for prefilling the dialog.
	const availableOn = new Set<string>();
	const anyRowOn = new Set<string>();
	const availSessionByDate = new Map<string, SessionSlot>();
	const availCreditByDate = new Map<string, number>();
	for (const row of availabilityRows) {
		anyRowOn.add(row.date);
		if (row.is_available === 1) {
			availableOn.add(row.date);
			if (!availSessionByDate.has(row.date)) {
				availSessionByDate.set(row.date, normalizeSession(row.session));
				availCreditByDate.set(
					row.date,
					typeof row.credit_value === 'number' && row.credit_value > 0 ? row.credit_value : 1
				);
			}
		}
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
			studentBusy: (studentCreditByDate.get(date) ?? 0) > 0,
			studentBookedCredit: studentCreditByDate.get(date) ?? 0,
			studentSessions: studentSessionsByDate.get(date) ?? [],
			availableSession: availSessionByDate.get(date) ?? null,
			availableCredit: availCreditByDate.get(date) ?? null,
			isPast: date < today
		};
	});
}
