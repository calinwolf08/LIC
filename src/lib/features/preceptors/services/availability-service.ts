/**
 * Preceptor Availability Service Layer
 *
 * Business logic and database operations for preceptor availability
 */

import type { Kysely } from 'kysely';
import type { DB, PreceptorAvailabilityTable } from '$lib/db/types';
import type { CreateAvailabilityInput, UpdateAvailabilityInput, DateRangeInput, BulkAvailabilityInput } from '../availability-schemas';
import { NotFoundError, ConflictError } from '$lib/api/errors';
import { preceptorExists } from './preceptor-service';

/**
 * Get all availability for a preceptor, ordered by date
 */
export async function getAvailability(
	db: Kysely<DB>,
	preceptorId: string
): Promise<PreceptorAvailabilityTable[]> {
	return await db
		.selectFrom('preceptor_availability')
		.selectAll()
		.where('preceptor_id', '=', preceptorId)
		.orderBy('date', 'asc')
		.execute();
}

/**
 * Get a single availability record by ID
 */
export async function getAvailabilityById(
	db: Kysely<DB>,
	id: string
): Promise<PreceptorAvailabilityTable | null> {
	const availability = await db
		.selectFrom('preceptor_availability')
		.selectAll()
		.where('id', '=', id)
		.executeTakeFirst();

	return availability || null;
}

/**
 * Get availability for a preceptor within a date range
 */
export async function getAvailabilityByDateRange(
	db: Kysely<DB>,
	preceptorId: string,
	dateRange: DateRangeInput
): Promise<PreceptorAvailabilityTable[]> {
	return await db
		.selectFrom('preceptor_availability')
		.selectAll()
		.where('preceptor_id', '=', preceptorId)
		.where('date', '>=', dateRange.start_date)
		.where('date', '<=', dateRange.end_date)
		.orderBy('date', 'asc')
		.execute();
}

/**
 * Get availability for a specific date
 */
export async function getAvailabilityByDate(
	db: Kysely<DB>,
	preceptorId: string,
	date: string
): Promise<PreceptorAvailabilityTable | null> {
	const availability = await db
		.selectFrom('preceptor_availability')
		.selectAll()
		.where('preceptor_id', '=', preceptorId)
		.where('date', '=', date)
		.executeTakeFirst();

	return availability || null;
}

/**
 * Set availability for a specific date
 * Creates new record or updates existing one
 */
export async function setAvailability(
	db: Kysely<DB>,
	preceptorId: string,
	date: string,
	isAvailable: boolean
): Promise<PreceptorAvailabilityTable> {
	// Verify preceptor exists
	const exists = await preceptorExists(db, preceptorId);
	if (!exists) {
		throw new NotFoundError('Preceptor');
	}

	// Check if availability already exists for this date
	const existing = await getAvailabilityByDate(db, preceptorId, date);

	const timestamp = new Date().toISOString();

	if (existing) {
		// Update existing record
		const updated = await db
			.updateTable('preceptor_availability')
			.set({
				is_available: isAvailable ? 1 : 0,
				updated_at: timestamp
			})
			.where('id', '=', existing.id)
			.returningAll()
			.executeTakeFirstOrThrow();

		return updated;
	} else {
		// Create new record
		const newAvailability: Omit<PreceptorAvailabilityTable, 'id'> & { id?: string } = {
			id: crypto.randomUUID(),
			preceptor_id: preceptorId,
			date,
			is_available: isAvailable ? 1 : 0,
			created_at: timestamp,
			updated_at: timestamp
		};

		const inserted = await db
			.insertInto('preceptor_availability')
			.values(newAvailability)
			.returningAll()
			.executeTakeFirstOrThrow();

		return inserted;
	}
}

/**
 * Delete an availability record
 * @throws {NotFoundError} If availability not found
 * @throws {ConflictError} If availability has assignments
 */
export async function deleteAvailability(db: Kysely<DB>, id: string): Promise<void> {
	// Check if availability exists
	const availability = await getAvailabilityById(db, id);
	if (!availability) {
		throw new NotFoundError('Availability');
	}

	// Check if can be deleted
	const canDelete = await canDeleteAvailability(db, id);
	if (!canDelete) {
		throw new ConflictError('Cannot delete availability with existing assignments');
	}

	await db.deleteFrom('preceptor_availability').where('id', '=', id).execute();
}

/**
 * Bulk update availability for a preceptor
 * Replaces all availability records for the given dates
 */
export async function bulkUpdateAvailability(
	db: Kysely<DB>,
	data: BulkAvailabilityInput
): Promise<PreceptorAvailabilityTable[]> {
	// Verify preceptor exists
	const exists = await preceptorExists(db, data.preceptor_id);
	if (!exists) {
		throw new NotFoundError('Preceptor');
	}

	const results: PreceptorAvailabilityTable[] = [];

	// Set availability for each date
	for (const item of data.availability) {
		const result = await setAvailability(db, data.preceptor_id, item.date, item.is_available);
		results.push(result);
	}

	return results;
}

/**
 * Check if an availability record can be deleted
 */
export async function canDeleteAvailability(db: Kysely<DB>, id: string): Promise<boolean> {
	const availability = await getAvailabilityById(db, id);
	if (!availability) {
		return false;
	}

	// Check if there are assignments on this date for this preceptor
	const assignment = await db
		.selectFrom('schedule_assignments')
		.select('id')
		.where('preceptor_id', '=', availability.preceptor_id)
		.where('date', '=', availability.date)
		.executeTakeFirst();

	return !assignment;
}
