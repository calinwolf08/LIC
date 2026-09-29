/**
 * Schedule quarters (client feedback M4).
 *
 * Optional quarter date ranges per schedule. Purely descriptive for now — they
 * display on the schedule and map a date to its quarter; the "one exam per
 * quarter" rule is deliberately backlog (out of Phase 8 scope).
 */

import type { Kysely, Selectable } from 'kysely';
import type { DB, ScheduleQuarters } from '$lib/db/types';
import { nanoid } from 'nanoid';

export interface QuarterInput {
	name: string;
	start_date: string;
	end_date: string;
}

/** All quarters for a schedule, ordered by start date. */
export async function getQuartersBySchedule(
	db: Kysely<DB>,
	scheduleId: string
): Promise<Selectable<ScheduleQuarters>[]> {
	return db
		.selectFrom('schedule_quarters')
		.selectAll()
		.where('schedule_id', '=', scheduleId)
		.orderBy('start_date', 'asc')
		.execute();
}

/**
 * Replace a schedule's quarters with the given set (delete-all + insert), in one
 * transaction. Each quarter's end date must not precede its start date.
 */
export async function replaceQuarters(
	db: Kysely<DB>,
	scheduleId: string,
	quarters: QuarterInput[]
): Promise<Selectable<ScheduleQuarters>[]> {
	for (const q of quarters) {
		if (q.end_date < q.start_date) {
			throw new Error(`Quarter "${q.name}" ends before it starts`);
		}
	}
	const run = async (trx: Kysely<DB>) => {
		await trx.deleteFrom('schedule_quarters').where('schedule_id', '=', scheduleId).execute();
		if (quarters.length > 0) {
			const ts = new Date().toISOString();
			await trx
				.insertInto('schedule_quarters')
				.values(
					quarters.map((q) => ({
						id: nanoid(),
						schedule_id: scheduleId,
						name: q.name,
						start_date: q.start_date,
						end_date: q.end_date,
						created_at: ts
					}))
				)
				.execute();
		}
		return getQuartersBySchedule(trx, scheduleId);
	};
	return db.isTransaction ? run(db) : db.transaction().execute(run);
}

/**
 * The name of the quarter a date falls in (inclusive of both ends), or null when
 * no quarter covers it. First match wins if quarters overlap.
 */
export function quarterForDate(
	quarters: Pick<Selectable<ScheduleQuarters>, 'name' | 'start_date' | 'end_date'>[],
	date: string
): string | null {
	for (const q of quarters) {
		if (date >= q.start_date && date <= q.end_date) return q.name;
	}
	return null;
}
