/**
 * Integration Test Helpers
 *
 * Utilities for creating and managing integration test scenarios.
 */

import { nanoid } from 'nanoid';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

/**
 * Creates a complete test clerkship with all necessary data
 * Note: clerkshipType must be 'inpatient' or 'outpatient' per database constraint
 */
export async function createTestClerkship(
	db: Kysely<DB>,
	name: string,
	clerkshipType: 'inpatient' | 'outpatient' | string = 'outpatient'
) {
	const id = nanoid();
	// Ensure valid clerkship type - default to 'outpatient' if invalid
	const validType = (clerkshipType === 'inpatient' || clerkshipType === 'outpatient')
		? clerkshipType
		: 'outpatient';

	await db
		.insertInto('clerkships')
		.values({
			id,
			name,
			clerkship_type: validType,
			required_days: 28,
			description: `Test ${name} clerkship`,
		})
		.execute();

	return id;
}

/**
 * Creates test students
 */
export async function createTestStudents(db: Kysely<DB>, count: number) {
	const studentIds: string[] = [];

	for (let i = 0; i < count; i++) {
		const id = nanoid();
		await db
			.insertInto('students')
			.values({
				id,
				name: `Test Student ${i + 1}`,
				email: `student-${id}@test.edu`, // Use unique ID in email to avoid conflicts
			})
			.execute();

		studentIds.push(id);
	}

	return studentIds;
}

/**
 * Creates test preceptors with optional health system and clerkship association
 * Note: Site associations are handled via preceptor_sites junction table
 * Note: Clerkship associations are handled via team membership (preceptor_teams + preceptor_team_members)
 */
export async function createTestPreceptors(
	db: Kysely<DB>,
	count: number,
	options?: {
		healthSystemId?: string;
		siteId?: string;
		maxStudents?: number;
		clerkshipId?: string; // If provided, creates a team and adds preceptors to it
	}
) {
	const preceptorIds: string[] = [];

	for (let i = 0; i < count; i++) {
		const id = nanoid();
		const values: any = {
			id,
			name: `Dr. Test Preceptor ${i + 1}`,
			email: `preceptor${i + 1}@test.edu`,
		};

		if (options?.maxStudents !== undefined) {
			values.max_students = options.maxStudents;
		}
		if (options?.healthSystemId) {
			values.health_system_id = options.healthSystemId;
		}

		await db.insertInto('preceptors').values(values).execute();

		// If siteId is provided, create the site association via junction table
		if (options?.siteId) {
			await db.insertInto('preceptor_sites').values({
				preceptor_id: id,
				site_id: options.siteId,
			}).execute();
		}

		preceptorIds.push(id);
	}

	// If clerkshipId is provided, create a team and add all preceptors to it
	if (options?.clerkshipId && preceptorIds.length > 0) {
		const teamId = nanoid();
		await db.insertInto('preceptor_teams').values({
			id: teamId,
			name: `Test Team for ${options.clerkshipId}`,
			clerkship_id: options.clerkshipId,
		}).execute();

		// Add all preceptors as team members
		for (let i = 0; i < preceptorIds.length; i++) {
			await db.insertInto('preceptor_team_members').values({
				id: nanoid(),
				team_id: teamId,
				preceptor_id: preceptorIds[i],
				role: i === 0 ? 'lead' : 'member',
				priority: i + 1,
			}).execute();
		}
	}

	return preceptorIds;
}

/**
 * Creates a single test preceptor with detailed options
 */
export async function createTestPreceptor(
	db: Kysely<DB>,
	options: {
		name?: string;
		email?: string;
		healthSystemId?: string;
		siteId?: string;
		maxStudents?: number;
		isGlobalFallbackOnly?: boolean;
	} = {}
): Promise<string> {
	const id = nanoid();
	const values: any = {
		id,
		name: options.name ?? `Dr. Test ${id.slice(0, 6)}`,
		email: options.email ?? `preceptor-${id}@test.edu`,
	};

	if (options.maxStudents !== undefined) {
		values.max_students = options.maxStudents;
	}
	if (options.healthSystemId) {
		values.health_system_id = options.healthSystemId;
	}
	if (options.isGlobalFallbackOnly) {
		values.is_global_fallback_only = 1;
	}

	await db.insertInto('preceptors').values(values).execute();

	// If siteId is provided, create the site association via junction table
	if (options.siteId) {
		await db.insertInto('preceptor_sites').values({
			preceptor_id: id,
			site_id: options.siteId,
		}).execute();
	}

	return id;
}

/**
 * Creates a test health system with sites
 */
export async function createTestHealthSystem(
	db: Kysely<DB>,
	name: string,
	siteCount: number = 1
) {
	const healthSystemId = nanoid();
	await db
		.insertInto('health_systems')
		.values({
			id: healthSystemId,
			name,
			location: 'Test City',
					})
		.execute();

	const siteIds: string[] = [];
	for (let i = 0; i < siteCount; i++) {
		const siteId = nanoid();
		await db
			.insertInto('sites')
			.values({
				id: siteId,
				health_system_id: healthSystemId,
				name: `${name} - Site ${i + 1}`,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.execute();

		siteIds.push(siteId);
	}

	return { healthSystemId, siteIds };
}

/**
 * Creates a clerkship requirement
 */
export async function createTestRequirement(
	db: Kysely<DB>,
	clerkshipId: string,
	options: {
		requirementType: 'inpatient' | 'outpatient' | 'elective';
		requiredDays: number;
		assignmentStrategy?: 'team_continuity' | 'continuous_single' | 'continuous_team' | 'block_based' | 'daily_rotation';
		healthSystemRule?: 'enforce_same_system' | 'prefer_same_system' | 'no_preference';
		blockSizeDays?: number;
	}
) {
	const id = nanoid();
	await db
		.insertInto('clerkship_requirements')
		.values({
			id,
			clerkship_id: clerkshipId,
			requirement_type: options.requirementType,
			required_days: options.requiredDays,
			override_mode: options.assignmentStrategy || options.healthSystemRule ? 'override_fields' : 'inherit',
			override_assignment_strategy: options.assignmentStrategy,
			override_health_system_rule: options.healthSystemRule,
			override_block_length_days: options.blockSizeDays,
					})
		.execute();

	return id;
}

/**
 * Creates a capacity rule for a preceptor
 */
export async function createCapacityRule(
	db: Kysely<DB>,
	preceptorId: string,
	options: {
		maxStudentsPerDay: number;
		maxStudentsPerYear?: number;
		clerkshipId?: string;
		requirementType?: 'inpatient' | 'outpatient' | 'elective';
	}
) {
	const id = nanoid();
	await db
		.insertInto('preceptor_capacity_rules')
		.values({
			id,
			preceptor_id: preceptorId,
			max_students_per_day: options.maxStudentsPerDay,
			max_students_per_year: options.maxStudentsPerYear ?? 20,
			clerkship_id: options.clerkshipId,
			requirement_type: options.requirementType,
					})
		.execute();

	return id;
}

/**
 * Team member configuration for createTestTeam
 */
export interface TeamMemberConfig {
	preceptorId: string;
	priority?: number;
	isFallbackOnly?: boolean;
	role?: string;
}

/**
 * Creates a preceptor team
 *
 * Supports two modes:
 * 1. Simple mode: Pass array of preceptor IDs (string[]) - all become primary members
 * 2. Advanced mode: Pass array of TeamMemberConfig objects for fine-grained control
 */
export async function createTestTeam(
	db: Kysely<DB>,
	clerkshipId: string,
	name: string,
	members: string[] | TeamMemberConfig[],
	options?: {
		requireSameHealthSystem?: boolean;
		requireSameSite?: boolean;
		requireSameSpecialty?: boolean;
	}
) {
	const teamId = nanoid();
	await db
		.insertInto('preceptor_teams')
		.values({
			id: teamId,
			clerkship_id: clerkshipId,
			name,
			require_same_health_system: options?.requireSameHealthSystem ? 1 : 0,
			require_same_site: options?.requireSameSite ? 1 : 0,
			require_same_specialty: options?.requireSameSpecialty ? 1 : 0,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		})
		.execute();

	// Normalize members to TeamMemberConfig format
	const normalizedMembers: TeamMemberConfig[] = members.map((m, i) => {
		if (typeof m === 'string') {
			return { preceptorId: m, priority: i + 1, isFallbackOnly: false };
		}
		return { ...m, priority: m.priority ?? i + 1 };
	});

	// Add team members
	for (const member of normalizedMembers) {
		await db
			.insertInto('preceptor_team_members')
			.values({
				id: nanoid(),
				team_id: teamId,
				preceptor_id: member.preceptorId,
				priority: member.priority!,
				role: member.role ?? null,
				is_fallback_only: member.isFallbackOnly ? 1 : 0,
				created_at: new Date().toISOString(),
			})
			.execute();
	}

	return teamId;
}

/**
 * Creates a fallback chain for a preceptor
 */
export async function createFallbackChain(
	db: Kysely<DB>,
	primaryPreceptorId: string,
	fallbackPreceptorIds: string[]
) {
	const fallbackIds: string[] = [];

	for (let i = 0; i < fallbackPreceptorIds.length; i++) {
		const id = nanoid();
		await db
			.insertInto('preceptor_fallbacks')
			.values({
				id,
				primary_preceptor_id: primaryPreceptorId,
				fallback_preceptor_id: fallbackPreceptorIds[i],
				priority: i + 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.execute();

		fallbackIds.push(id);
	}

	return fallbackIds;
}

/**
 * Creates blackout dates
 * Note: BlackoutDates schema only has single dates, not ranges or preceptor_id
 */
export async function createBlackoutDates(
	db: Kysely<DB>,
	preceptorId: string,
	dateRanges: Array<{ start: Date; end: Date; reason?: string }>
) {
	const blackoutIds: string[] = [];

	// Note: Current schema doesn't support preceptor-specific blackouts or date ranges
	// This creates single-date blackout entries for each day in the range
	for (const range of dateRanges) {
		const currentDate = new Date(range.start);
		const endDate = new Date(range.end);

		while (currentDate <= endDate) {
			const id = nanoid();
			await db
				.insertInto('blackout_dates')
				.values({
					id,
					date: currentDate.toISOString().split('T')[0],
					reason: range.reason || 'Test blackout',
				})
				.execute();

			blackoutIds.push(id);
			currentDate.setDate(currentDate.getDate() + 1);
		}
	}

	return blackoutIds;
}

/**
 * Gets all assignments for a student
 */
export async function getStudentAssignments(db: Kysely<DB>, studentId: string) {
	return await db
		.selectFrom('schedule_assignments')
		.selectAll()
		.where('student_id', '=', studentId)
		.orderBy('date', 'asc')
		.execute();
}

/**
 * Gets all assignments for a clerkship
 */
export async function getClerkshipAssignments(db: Kysely<DB>, clerkshipId: string) {
	return await db
		.selectFrom('schedule_assignments')
		.selectAll()
		.where('clerkship_id', '=', clerkshipId)
		.orderBy('date', 'asc')
		.execute();
}

/**
 * Counts assignments by preceptor
 */
export async function countAssignmentsByPreceptor(db: Kysely<DB>, preceptorId: string) {
	const result = await db
		.selectFrom('schedule_assignments')
		.select(({ fn }) => [fn.count<number>('id').as('count')])
		.where('preceptor_id', '=', preceptorId)
		.executeTakeFirst();

	return result?.count || 0;
}

/**
 * Counts assignments by date range for a preceptor
 */
export async function countAssignmentsByDateRange(
	db: Kysely<DB>,
	preceptorId: string,
	startDate: Date,
	endDate: Date
) {
	const startDateStr = startDate.toISOString().split('T')[0];
	const endDateStr = endDate.toISOString().split('T')[0];

	const result = await db
		.selectFrom('schedule_assignments')
		.select(({ fn }) => [fn.count<number>('id').as('count')])
		.where('preceptor_id', '=', preceptorId)
		.where('date', '>=', startDateStr)
		.where('date', '<=', endDateStr)
		.executeTakeFirst();

	return result?.count || 0;
}

/**
 * Creates preceptor availability records for specific dates
 */
export async function createPreceptorAvailability(
	db: Kysely<DB>,
	preceptorId: string,
	siteId: string,
	dates: string[]
) {
	const values = dates.map((date) => ({
		id: nanoid(),
		preceptor_id: preceptorId,
		site_id: siteId,
		date,
		is_available: 1, // SQLite boolean
		created_at: new Date().toISOString(),
	}));

	if (values.length > 0) {
		await db.insertInto('preceptor_availability').values(values).execute();
	}
}

/**
 * Generates an array of date strings starting from a given date
 */
export function generateDateRange(startDate: string, days: number): string[] {
	const dates: string[] = [];
	const start = new Date(startDate + 'T00:00:00.000Z');
	for (let i = 0; i < days; i++) {
		const date = new Date(start);
		date.setUTCDate(start.getUTCDate() + i);
		dates.push(date.toISOString().split('T')[0]);
	}
	return dates;
}

/**
 * Clears all test data from database
 */
export async function clearAllTestData(db: Kysely<DB>) {
	// Delete in reverse dependency order
	await db.deleteFrom('schedule_assignments').execute();
	await db.deleteFrom('preceptor_team_members').execute();
	await db.deleteFrom('preceptor_teams').execute();
	await db.deleteFrom('preceptor_fallbacks').execute();
	await db.deleteFrom('preceptor_capacity_rules').execute();
	await db.deleteFrom('preceptor_availability').execute();
	await db.deleteFrom('blackout_dates').execute();
	await db.deleteFrom('clerkship_electives').execute();
	await db.deleteFrom('clerkship_requirements').execute();
	await db.deleteFrom('preceptor_sites').execute();
	await db.deleteFrom('sites').execute();
	await db.deleteFrom('health_systems').execute();
	await db.deleteFrom('preceptors').execute();
	await db.deleteFrom('students').execute();
	await db.deleteFrom('clerkships').execute();
}
