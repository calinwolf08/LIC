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
 */
export async function createTestClerkship(db: Kysely<DB>, name: string, specialty: string) {
	const id = nanoid();
	await db
		.insertInto('clerkships')
		.values({
			id,
			name,
			specialty,
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
				email: `student${i + 1}@test.edu`,
			})
			.execute();

		studentIds.push(id);
	}

	return studentIds;
}

/**
 * Creates test preceptors with optional health system and site
 */
export async function createTestPreceptors(
	db: Kysely<DB>,
	count: number,
	options?: {
		specialty?: string;
		healthSystemId?: string;
		siteId?: string;
		maxStudents?: number;
	}
) {
	const preceptorIds: string[] = [];

	for (let i = 0; i < count; i++) {
		const id = nanoid();
		const values: any = {
			id,
			name: `Dr. Test Preceptor ${i + 1}`,
			email: `preceptor${i + 1}@test.edu`,
			specialty: options?.specialty || 'General',
		};

		if (options?.maxStudents !== undefined) {
			values.max_students = options.maxStudents;
		}
		if (options?.healthSystemId) {
			values.health_system_id = options.healthSystemId;
		}
		if (options?.siteId) {
			values.site_id = options.siteId;
		}

		await db.insertInto('preceptors').values(values).execute();

		preceptorIds.push(id);
	}

	return preceptorIds;
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
		assignmentStrategy?: 'continuous_single' | 'continuous_team' | 'block_based' | 'daily_rotation';
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
			override_mode: options.assignmentStrategy || options.healthSystemRule ? 'override_all' : undefined,
			override_assignment_strategy: options.assignmentStrategy || undefined,
			override_health_system_rule: options.healthSystemRule || undefined,
			override_block_size_days: options.blockSizeDays || undefined,
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
			max_students_per_year: options.maxStudentsPerYear || undefined,
			clerkship_id: options.clerkshipId || undefined,
			requirement_type: options.requirementType || undefined,
					})
		.execute();

	return id;
}

/**
 * Creates a preceptor team
 */
export async function createTestTeam(
	db: Kysely<DB>,
	clerkshipId: string,
	name: string,
	memberIds: string[],
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
					})
		.execute();

	// Add team members
	for (let i = 0; i < memberIds.length; i++) {
		await db
			.insertInto('preceptor_team_members')
			.values({
				id: nanoid(),
				team_id: teamId,
				preceptor_id: memberIds[i],
				priority: i + 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
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
 * Creates blackout dates for a preceptor
 */
export async function createBlackoutDates(
	db: Kysely<DB>,
	preceptorId: string,
	dateRanges: Array<{ start: Date; end: Date; reason?: string }>
) {
	const blackoutIds: string[] = [];

	for (const range of dateRanges) {
		const id = nanoid();
		await db
			.insertInto('blackout_dates')
			.values({
				id,
				preceptor_id: preceptorId,
				start_date: range.start,
				end_date: range.end,
				reason: range.reason || 'Test blackout',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.execute();

		blackoutIds.push(id);
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
		.orderBy('start_date', 'asc')
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
		.orderBy('start_date', 'asc')
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
	const result = await db
		.selectFrom('schedule_assignments')
		.select(({ fn }) => [fn.count<number>('id').as('count')])
		.where('preceptor_id', '=', preceptorId)
		.where('start_date', '<=', endDate)
		.where('end_date', '>=', startDate)
		.executeTakeFirst();

	return result?.count || 0;
}

/**
 * Clears all test data from database
 */
export async function clearAllTestData(db: Kysely<DB>) {
	// Delete in reverse dependency order
	await db.deleteFrom('assignments').execute();
	await db.deleteFrom('preceptor_team_members').execute();
	await db.deleteFrom('preceptor_teams').execute();
	await db.deleteFrom('preceptor_fallbacks').execute();
	await db.deleteFrom('preceptor_capacity_rules').execute();
	await db.deleteFrom('blackout_dates').execute();
	await db.deleteFrom('clerkship_electives').execute();
	await db.deleteFrom('clerkship_requirements').execute();
	await db.deleteFrom('sites').execute();
	await db.deleteFrom('health_systems').execute();
	await db.deleteFrom('preceptors').execute();
	await db.deleteFrom('students').execute();
	await db.deleteFrom('clerkships').execute();
}
