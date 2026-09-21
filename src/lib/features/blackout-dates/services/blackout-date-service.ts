/**
 * Blackout Date Service Layer
 *
 * Business logic and database operations for blackout dates
 */

import type { Kysely, Selectable } from 'kysely';
import type { DB, BlackoutDates } from '$lib/db/types';
import type { CreateBlackoutDateInput } from '../schemas.js';
import { NotFoundError, ConflictError } from '$lib/api/errors';
import { createServerLogger } from '$lib/utils/logger.server';

const log = createServerLogger('service:blackout-dates');

/**
 * Get a schedule's blackout dates, ordered by date. Blackouts are scoped to a
 * schedule (finding P4-d); `null` (no active schedule) yields none.
 */
export async function getBlackoutDates(
	db: Kysely<DB>,
	scheduleId: string | null
): Promise<Selectable<BlackoutDates>[]> {
	if (!scheduleId) return [];
	return await db
		.selectFrom('blackout_dates')
		.selectAll()
		.where('schedule_id', '=', scheduleId)
		.orderBy('date', 'asc')
		.execute();
}

/**
 * Get a single blackout date by ID
 * @returns Blackout date or null if not found
 */
export async function getBlackoutDateById(
	db: Kysely<DB>,
	id: string
): Promise<Selectable<BlackoutDates> | null> {
	const blackoutDate = await db
		.selectFrom('blackout_dates')
		.selectAll()
		.where('id', '=', id)
		.executeTakeFirst();

	return blackoutDate || null;
}

/**
 * Get blackout dates within a date range (inclusive)
 * @param startDate Optional start date filter (YYYY-MM-DD)
 * @param endDate Optional end date filter (YYYY-MM-DD)
 * @returns Blackout dates within the specified range
 */
export async function getBlackoutDatesByRange(
	db: Kysely<DB>,
	scheduleId: string | null,
	startDate?: string,
	endDate?: string
): Promise<Selectable<BlackoutDates>[]> {
	if (!scheduleId) return [];
	let query = db.selectFrom('blackout_dates').selectAll().where('schedule_id', '=', scheduleId);

	if (startDate) {
		query = query.where('date', '>=', startDate);
	}

	if (endDate) {
		query = query.where('date', '<=', endDate);
	}

	return await query.orderBy('date', 'asc').execute();
}

/**
 * Create a new blackout date
 */
export async function createBlackoutDate(
	db: Kysely<DB>,
	data: CreateBlackoutDateInput,
	scheduleId: string
): Promise<Selectable<BlackoutDates>> {
	log.debug('Creating blackout date', {
		date: data.date,
		reason: data.reason,
		scheduleId
	});

	// Friendly duplicate handling, scoped to this schedule (blackouts are
	// per-schedule, finding P4-d): a repeat insert would hit UNIQUE(schedule_id,
	// date) and surface as a raw 500, so pre-check and raise a 409 the UI shows as
	// "already a blackout date" (finding P4-e).
	const existing = await db
		.selectFrom('blackout_dates')
		.select('id')
		.where('schedule_id', '=', scheduleId)
		.where('date', '=', data.date)
		.executeTakeFirst();
	if (existing) {
		throw new ConflictError('A blackout date already exists for this date (duplicate)');
	}

	const timestamp = new Date().toISOString();
	const newBlackoutDate = {
		id: crypto.randomUUID(),
		schedule_id: scheduleId,
		date: data.date,
		reason: data.reason || null,
		created_at: timestamp
	};

	const inserted = await db
		.insertInto('blackout_dates')
		.values(newBlackoutDate)
		.returningAll()
		.executeTakeFirstOrThrow();

	log.info('Blackout date created', {
		id: inserted.id,
		date: inserted.date
	});

	return inserted;
}

/**
 * Delete a blackout date
 * @throws {NotFoundError} If blackout date not found
 */
export async function deleteBlackoutDate(
	db: Kysely<DB>,
	id: string,
	scheduleId?: string | null
): Promise<void> {
	log.debug('Deleting blackout date', { id, scheduleId });

	// Ownership: the row must exist and, when a schedule is given, belong to it —
	// otherwise a caller could delete another schedule's blackout (finding P4-d).
	const row = await getBlackoutDateById(db, id);
	if (!row || (scheduleId != null && row.schedule_id !== scheduleId)) {
		log.warn('Blackout date not found for deletion', { id, scheduleId });
		throw new NotFoundError('Blackout date');
	}

	await db.deleteFrom('blackout_dates').where('id', '=', id).execute();

	log.info('Blackout date deleted', { id });
}

/**
 * Check if a specific date is blacked out
 * @param date Date string in YYYY-MM-DD format
 * @returns True if the date is a blackout date
 */
export async function isDateBlackedOut(
	db: Kysely<DB>,
	date: string,
	scheduleId?: string | null
): Promise<boolean> {
	let query = db.selectFrom('blackout_dates').select('id').where('date', '=', date);
	if (scheduleId != null) query = query.where('schedule_id', '=', scheduleId);
	const blackoutDate = await query.executeTakeFirst();

	return !!blackoutDate;
}

/**
 * Check if a blackout date exists
 */
export async function blackoutDateExists(db: Kysely<DB>, id: string): Promise<boolean> {
	const blackoutDate = await getBlackoutDateById(db, id);
	return blackoutDate !== null;
}
