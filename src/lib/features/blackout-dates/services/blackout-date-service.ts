/**
 * Blackout Date Service Layer
 *
 * Business logic and database operations for blackout dates
 */

import type { Kysely, Selectable } from 'kysely';
import type { DB, BlackoutDates } from '$lib/db/types';
import type { CreateBlackoutDateInput } from '../schemas.js';
import { NotFoundError } from '$lib/api/errors';

/**
 * Get all blackout dates, ordered by date
 */
export async function getBlackoutDates(db: Kysely<DB>): Promise<Selectable<BlackoutDates>[]> {
	return await db
		.selectFrom('blackout_dates')
		.selectAll()
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
	startDate?: string,
	endDate?: string
): Promise<Selectable<BlackoutDates>[]> {
	let query = db.selectFrom('blackout_dates').selectAll();

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
	data: CreateBlackoutDateInput
): Promise<Selectable<BlackoutDates>> {
	const timestamp = new Date().toISOString();
	const newBlackoutDate = {
		id: crypto.randomUUID(),
		date: data.date,
		reason: data.reason || null,
		created_at: timestamp
	};

	const inserted = await db
		.insertInto('blackout_dates')
		.values(newBlackoutDate)
		.returningAll()
		.executeTakeFirstOrThrow();

	return inserted;
}

/**
 * Delete a blackout date
 * @throws {NotFoundError} If blackout date not found
 */
export async function deleteBlackoutDate(db: Kysely<DB>, id: string): Promise<void> {
	// Check if blackout date exists
	const exists = await blackoutDateExists(db, id);
	if (!exists) {
		throw new NotFoundError('Blackout date');
	}

	await db.deleteFrom('blackout_dates').where('id', '=', id).execute();
}

/**
 * Check if a specific date is blacked out
 * @param date Date string in YYYY-MM-DD format
 * @returns True if the date is a blackout date
 */
export async function isDateBlackedOut(db: Kysely<DB>, date: string): Promise<boolean> {
	const blackoutDate = await db
		.selectFrom('blackout_dates')
		.select('id')
		.where('date', '=', date)
		.executeTakeFirst();

	return !!blackoutDate;
}

/**
 * Check if a blackout date exists
 */
export async function blackoutDateExists(db: Kysely<DB>, id: string): Promise<boolean> {
	const blackoutDate = await getBlackoutDateById(db, id);
	return blackoutDate !== null;
}
