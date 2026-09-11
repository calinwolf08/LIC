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
 * True when `assignmentId` belongs to the caller's schedule. Assignments have
 * no `schedule_id`; ownership flows through the assigned student's
 * `schedule_students` row.
 */
export async function isAssignmentInSchedule(
	dbConn: Kysely<DB>,
	scheduleId: string,
	assignmentId: string
): Promise<boolean> {
	const row = await dbConn
		.selectFrom('schedule_assignments as sa')
		.innerJoin('schedule_students as ss', (join) =>
			join.onRef('ss.student_id', '=', 'sa.student_id').on('ss.schedule_id', '=', scheduleId)
		)
		.where('sa.id', '=', assignmentId)
		.select('sa.id')
		.executeTakeFirst();
	return Boolean(row);
}

/**
 * Assert that an assignment belongs to the caller's schedule, throwing
 * `NotFoundError` (→ 404) otherwise.
 */
export async function assertAssignmentInSchedule(
	dbConn: Kysely<DB>,
	scheduleId: string,
	assignmentId: string
): Promise<void> {
	if (!(await isAssignmentInSchedule(dbConn, scheduleId, assignmentId))) {
		throw new NotFoundError('Assignment');
	}
}

/**
 * Assert that a scheduling period is owned by the given user
 * (`scheduling_periods.user_id`), throwing `NotFoundError` (→ 404) otherwise.
 */
export async function assertScheduleOwnedByUser(
	dbConn: Kysely<DB>,
	userId: string,
	scheduleId: string
): Promise<void> {
	const row = await dbConn
		.selectFrom('scheduling_periods')
		.select('id')
		.where('id', '=', scheduleId)
		.where('user_id', '=', userId)
		.executeTakeFirst();
	if (!row) {
		throw new NotFoundError('Schedule');
	}
}

/**
 * Config-row ownership (step 35). Scheduling-config rows are not in a
 * `schedule_*` junction; they belong to a schedule through their **parent**
 * entity (an elective/requirement to its clerkship; a capacity rule/fallback to
 * its preceptor). Each helper resolves the parent and delegates to
 * `assertEntityInSchedule`, throwing `NotFoundError` (→ 404) when the config row
 * does not exist or its parent is not in the caller's schedule.
 */

/** Elective → its clerkship must be in the schedule. */
export async function assertElectiveInSchedule(
	dbConn: Kysely<DB>,
	scheduleId: string,
	electiveId: string
): Promise<void> {
	const row = await dbConn
		.selectFrom('clerkship_electives')
		.select('clerkship_id')
		.where('id', '=', electiveId)
		.executeTakeFirst();
	if (!row) throw new NotFoundError('Elective');
	await assertEntityInSchedule(dbConn, scheduleId, 'clerkship', row.clerkship_id);
}

/** Capacity rule → its preceptor must be in the schedule. */
export async function assertCapacityRuleInSchedule(
	dbConn: Kysely<DB>,
	scheduleId: string,
	ruleId: string
): Promise<void> {
	const row = await dbConn
		.selectFrom('preceptor_capacity_rules')
		.select('preceptor_id')
		.where('id', '=', ruleId)
		.executeTakeFirst();
	if (!row) throw new NotFoundError('Capacity rule');
	await assertEntityInSchedule(dbConn, scheduleId, 'preceptor', row.preceptor_id);
}

/** Fallback → its primary preceptor must be in the schedule. */
export async function assertFallbackInSchedule(
	dbConn: Kysely<DB>,
	scheduleId: string,
	fallbackId: string
): Promise<void> {
	const row = await dbConn
		.selectFrom('preceptor_fallbacks')
		.select('primary_preceptor_id')
		.where('id', '=', fallbackId)
		.executeTakeFirst();
	if (!row) throw new NotFoundError('Fallback');
	await assertEntityInSchedule(dbConn, scheduleId, 'preceptor', row.primary_preceptor_id);
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
