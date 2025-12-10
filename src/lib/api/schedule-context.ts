/**
 * Schedule Context Helpers
 *
 * Utilities for getting and using the current schedule context in API handlers.
 */

import { db } from '$lib/db';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { nanoid } from 'nanoid';

/**
 * Get the active schedule ID for a user
 */
export async function getActiveScheduleId(userId: string): Promise<string | null> {
	const user = await db
		.selectFrom('user')
		.select('active_schedule_id')
		.where('id', '=', userId)
		.executeTakeFirst();

	return user?.active_schedule_id || null;
}

/**
 * Associate an entity with a schedule
 */
export async function associateEntityWithSchedule(
	dbConnection: Kysely<DB>,
	scheduleId: string,
	entityType: 'student' | 'preceptor' | 'clerkship' | 'site' | 'health_system' | 'team',
	entityId: string
): Promise<void> {
	const timestamp = new Date().toISOString();

	const tableMap: Record<string, string> = {
		student: 'schedule_students',
		preceptor: 'schedule_preceptors',
		clerkship: 'schedule_clerkships',
		site: 'schedule_sites',
		health_system: 'schedule_health_systems',
		team: 'schedule_teams'
	};

	const idFieldMap: Record<string, string> = {
		student: 'student_id',
		preceptor: 'preceptor_id',
		clerkship: 'clerkship_id',
		site: 'site_id',
		health_system: 'health_system_id',
		team: 'team_id'
	};

	const table = tableMap[entityType];
	const idField = idFieldMap[entityType];

	if (!table || !idField) {
		throw new Error(`Unknown entity type: ${entityType}`);
	}

	// Check if association already exists
	const existing = await dbConnection
		.selectFrom(table as any)
		.select('id')
		.where('schedule_id', '=', scheduleId)
		.where(idField as any, '=', entityId)
		.executeTakeFirst();

	if (!existing) {
		await dbConnection
			.insertInto(table as any)
			.values({
				id: nanoid(),
				schedule_id: scheduleId,
				[idField]: entityId,
				created_at: timestamp
			})
			.execute();
	}
}

/**
 * Helper to auto-associate a newly created entity with the user's active schedule
 */
export async function autoAssociateWithActiveSchedule(
	dbConnection: Kysely<DB>,
	userId: string | undefined,
	entityType: 'student' | 'preceptor' | 'clerkship' | 'site' | 'health_system' | 'team',
	entityId: string
): Promise<void> {
	if (!userId) return;

	const scheduleId = await getActiveScheduleId(userId);
	if (!scheduleId) return;

	await associateEntityWithSchedule(dbConnection, scheduleId, entityType, entityId);
}
