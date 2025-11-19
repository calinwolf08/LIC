/**
 * Scheduling Period Service Layer
 *
 * Business logic and database operations for scheduling periods
 */

import type { Kysely, Selectable } from 'kysely';
import type { DB, SchedulingPeriods } from '$lib/db/types';
import type {
	CreateSchedulingPeriod,
	UpdateSchedulingPeriod
} from '$lib/features/preceptors/pattern-schemas';
import { NotFoundError, ConflictError } from '$lib/api/errors';

// ========================================
// CRUD Operations
// ========================================

/**
 * Get all scheduling periods
 */
export async function getSchedulingPeriods(
	db: Kysely<DB>
): Promise<Selectable<SchedulingPeriods>[]> {
	return await db
		.selectFrom('scheduling_periods')
		.selectAll()
		.orderBy('start_date', 'desc')
		.execute();
}

/**
 * Get a single scheduling period by ID
 */
export async function getSchedulingPeriodById(
	db: Kysely<DB>,
	id: string
): Promise<Selectable<SchedulingPeriods> | null> {
	const period = await db
		.selectFrom('scheduling_periods')
		.selectAll()
		.where('id', '=', id)
		.executeTakeFirst();

	return period || null;
}

/**
 * Get the currently active scheduling period
 */
export async function getActiveSchedulingPeriod(
	db: Kysely<DB>
): Promise<Selectable<SchedulingPeriods> | null> {
	const period = await db
		.selectFrom('scheduling_periods')
		.selectAll()
		.where('is_active', '=', 1)
		.executeTakeFirst();

	return period || null;
}

/**
 * Create a new scheduling period
 */
export async function createSchedulingPeriod(
	db: Kysely<DB>,
	data: CreateSchedulingPeriod
): Promise<Selectable<SchedulingPeriods>> {
	// If this period should be active, check if there's already an active period
	if (data.is_active) {
		const activePeriod = await getActiveSchedulingPeriod(db);
		if (activePeriod) {
			throw new ConflictError(
				`Cannot create active period. Period "${activePeriod.name}" is currently active. Deactivate it first.`
			);
		}
	}

	const timestamp = new Date().toISOString();
	const id = crypto.randomUUID();

	const newPeriod = {
		id,
		name: data.name,
		start_date: data.start_date,
		end_date: data.end_date,
		is_active: data.is_active ? 1 : 0,
		created_at: timestamp,
		updated_at: timestamp
	};

	const inserted = await db
		.insertInto('scheduling_periods')
		.values(newPeriod)
		.returningAll()
		.executeTakeFirstOrThrow();

	return inserted;
}

/**
 * Update an existing scheduling period
 */
export async function updateSchedulingPeriod(
	db: Kysely<DB>,
	id: string,
	data: UpdateSchedulingPeriod
): Promise<Selectable<SchedulingPeriods>> {
	// Check if period exists
	const existing = await getSchedulingPeriodById(db, id);
	if (!existing) {
		throw new NotFoundError('Scheduling Period');
	}

	// If trying to activate this period, check if there's already an active one
	if (data.is_active === true) {
		const activePeriod = await getActiveSchedulingPeriod(db);
		if (activePeriod && activePeriod.id !== id) {
			throw new ConflictError(
				`Cannot activate period. Period "${activePeriod.name}" is currently active. Deactivate it first.`
			);
		}
	}

	const timestamp = new Date().toISOString();

	const updateData: any = {
		updated_at: timestamp
	};

	if (data.name !== undefined) {
		updateData.name = data.name;
	}

	if (data.start_date !== undefined) {
		updateData.start_date = data.start_date;
	}

	if (data.end_date !== undefined) {
		updateData.end_date = data.end_date;
	}

	if (data.is_active !== undefined) {
		updateData.is_active = data.is_active ? 1 : 0;
	}

	const updated = await db
		.updateTable('scheduling_periods')
		.set(updateData)
		.where('id', '=', id)
		.returningAll()
		.executeTakeFirstOrThrow();

	return updated;
}

/**
 * Delete a scheduling period
 */
export async function deleteSchedulingPeriod(db: Kysely<DB>, id: string): Promise<void> {
	// Check if period exists
	const period = await getSchedulingPeriodById(db, id);
	if (!period) {
		throw new NotFoundError('Scheduling Period');
	}

	// Prevent deletion of active period
	if (period.is_active === 1) {
		throw new ConflictError('Cannot delete the active scheduling period. Deactivate it first.');
	}

	await db
		.deleteFrom('scheduling_periods')
		.where('id', '=', id)
		.execute();
}

/**
 * Activate a scheduling period (deactivates all others)
 */
export async function activateSchedulingPeriod(
	db: Kysely<DB>,
	id: string
): Promise<Selectable<SchedulingPeriods>> {
	// Check if period exists
	const period = await getSchedulingPeriodById(db, id);
	if (!period) {
		throw new NotFoundError('Scheduling Period');
	}

	// Deactivate all periods first
	await db
		.updateTable('scheduling_periods')
		.set({ is_active: 0, updated_at: new Date().toISOString() })
		.where('is_active', '=', 1)
		.execute();

	// Activate the requested period
	const activated = await db
		.updateTable('scheduling_periods')
		.set({ is_active: 1, updated_at: new Date().toISOString() })
		.where('id', '=', id)
		.returningAll()
		.executeTakeFirstOrThrow();

	return activated;
}

/**
 * Deactivate all scheduling periods
 */
export async function deactivateAllSchedulingPeriods(db: Kysely<DB>): Promise<void> {
	await db
		.updateTable('scheduling_periods')
		.set({ is_active: 0, updated_at: new Date().toISOString() })
		.where('is_active', '=', 1)
		.execute();
}

// ========================================
// Query Helpers
// ========================================

/**
 * Check if a scheduling period exists
 */
export async function schedulingPeriodExists(db: Kysely<DB>, id: string): Promise<boolean> {
	const period = await getSchedulingPeriodById(db, id);
	return period !== null;
}

/**
 * Get scheduling periods that overlap with a given date range
 */
export async function getOverlappingPeriods(
	db: Kysely<DB>,
	startDate: string,
	endDate: string
): Promise<Selectable<SchedulingPeriods>[]> {
	return await db
		.selectFrom('scheduling_periods')
		.selectAll()
		.where((eb) =>
			eb.or([
				// Period starts within range
				eb.and([
					eb('start_date', '>=', startDate),
					eb('start_date', '<=', endDate)
				]),
				// Period ends within range
				eb.and([
					eb('end_date', '>=', startDate),
					eb('end_date', '<=', endDate)
				]),
				// Period completely contains range
				eb.and([
					eb('start_date', '<=', startDate),
					eb('end_date', '>=', endDate)
				])
			])
		)
		.execute();
}

/**
 * Get upcoming scheduling periods (start date in the future)
 */
export async function getUpcomingPeriods(
	db: Kysely<DB>
): Promise<Selectable<SchedulingPeriods>[]> {
	const today = new Date().toISOString().split('T')[0];

	return await db
		.selectFrom('scheduling_periods')
		.selectAll()
		.where('start_date', '>', today)
		.orderBy('start_date', 'asc')
		.execute();
}

/**
 * Get past scheduling periods (end date in the past)
 */
export async function getPastPeriods(
	db: Kysely<DB>
): Promise<Selectable<SchedulingPeriods>[]> {
	const today = new Date().toISOString().split('T')[0];

	return await db
		.selectFrom('scheduling_periods')
		.selectAll()
		.where('end_date', '<', today)
		.orderBy('end_date', 'desc')
		.execute();
}

/**
 * Get current scheduling periods (includes today)
 */
export async function getCurrentPeriods(
	db: Kysely<DB>
): Promise<Selectable<SchedulingPeriods>[]> {
	const today = new Date().toISOString().split('T')[0];

	return await db
		.selectFrom('scheduling_periods')
		.selectAll()
		.where('start_date', '<=', today)
		.where('end_date', '>=', today)
		.orderBy('start_date', 'asc')
		.execute();
}
