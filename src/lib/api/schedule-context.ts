/**
 * Schedule Context Helpers
 *
 * Utilities for getting and using the current schedule context in API handlers.
 */

import { db } from '$lib/db';
import type { Kysely, Selectable } from 'kysely';
import type { DB, SchedulingPeriods } from '$lib/db/types';
import { nanoid } from 'nanoid';
import { NotFoundError, UnauthorizedError, ValidationError } from './errors';

/** The entity kinds that belong to a schedule through a `schedule_*` junction. */
export type ScheduleEntityKind =
	| 'student'
	| 'preceptor'
	| 'clerkship'
	| 'site'
	| 'health_system'
	| 'team';

const JUNCTION_TABLE: Record<ScheduleEntityKind, keyof DB> = {
	student: 'schedule_students',
	preceptor: 'schedule_preceptors',
	clerkship: 'schedule_clerkships',
	site: 'schedule_sites',
	health_system: 'schedule_health_systems',
	team: 'schedule_teams'
};

const JUNCTION_ID_COLUMN: Record<ScheduleEntityKind, string> = {
	student: 'student_id',
	preceptor: 'preceptor_id',
	clerkship: 'clerkship_id',
	site: 'site_id',
	health_system: 'health_system_id',
	team: 'team_id'
};

/** Minimal shape of `event.locals` we need to resolve the active schedule. */
export interface ScheduleLocals {
	session: { user?: { id?: string | null } | null } | null;
}

/**
 * Resolve the signed-in user's active schedule id, throwing a typed API error
 * when there is no session (401) or no active schedule (400). This is the one
 * gate every scoped read/mutation should pass through — services never resolve
 * the schedule internally.
 */
export async function requireActiveScheduleId(
	locals: ScheduleLocals,
	dbConn: Kysely<DB> = db
): Promise<string> {
	const userId = locals.session?.user?.id;
	if (!userId) {
		throw new UnauthorizedError('Authentication required');
	}
	const scheduleId = await getActiveScheduleId(userId, dbConn);
	if (!scheduleId) {
		throw new ValidationError('No active schedule. Please create or select a schedule first.');
	}
	return scheduleId;
}

/**
 * True when `entityId` is linked to `scheduleId` through its `schedule_*`
 * junction. The tenant-boundary check for a single entity.
 */
export async function isEntityInSchedule(
	dbConn: Kysely<DB>,
	scheduleId: string,
	kind: ScheduleEntityKind,
	entityId: string
): Promise<boolean> {
	const table = JUNCTION_TABLE[kind];
	const idColumn = JUNCTION_ID_COLUMN[kind];
	const row = await dbConn
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		.selectFrom(table as any)
		.select('id')
		.where('schedule_id', '=', scheduleId)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		.where(idColumn as any, '=', entityId)
		.executeTakeFirst();
	return Boolean(row);
}

/**
 * Assert that an entity belongs to the caller's active schedule, throwing
 * `NotFoundError` (→ 404) when it does not. **404, not 403** — a 403 confirms
 * the row exists, which is itself a cross-tenant disclosure.
 */
export async function assertEntityInSchedule(
	dbConn: Kysely<DB>,
	scheduleId: string,
	kind: ScheduleEntityKind,
	entityId: string
): Promise<void> {
	const ok = await isEntityInSchedule(dbConn, scheduleId, kind, entityId);
	if (!ok) {
		throw new NotFoundError(kind.replace('_', ' '));
	}
}

/**
 * Get the active schedule ID for a user
 */
export async function getActiveScheduleId(
	userId: string,
	dbConn: Kysely<DB> = db
): Promise<string | null> {
	const user = await dbConn
		.selectFrom('user')
		.select('active_schedule_id')
		.where('id', '=', userId)
		.executeTakeFirst();

	return user?.active_schedule_id || null;
}

/**
 * Resolve a user's active schedule to the full period row.
 *
 * This is the single source of truth for "which schedule am I working in".
 * It reads `user.active_schedule_id` — never the global `scheduling_periods.is_active`
 * flag, which is per-installation and would leak one user's range into another's views.
 */
export async function getActiveScheduleForUser(
	dbConn: Kysely<DB>,
	userId: string
): Promise<Selectable<SchedulingPeriods> | null> {
	const user = await dbConn
		.selectFrom('user')
		.select('active_schedule_id')
		.where('id', '=', userId)
		.executeTakeFirst();

	if (!user?.active_schedule_id) return null;

	const period = await dbConn
		.selectFrom('scheduling_periods')
		.selectAll()
		.where('id', '=', user.active_schedule_id)
		.executeTakeFirst();

	return period ?? null;
}

/**
 * Get the date range for a schedule. Throws if the schedule does not exist.
 */
export async function getScheduleRange(
	dbConn: Kysely<DB>,
	scheduleId: string
): Promise<{ start: string; end: string }> {
	const period = await dbConn
		.selectFrom('scheduling_periods')
		.select(['start_date', 'end_date'])
		.where('id', '=', scheduleId)
		.executeTakeFirst();

	if (!period) throw new NotFoundError('Schedule');
	return { start: period.start_date, end: period.end_date };
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
