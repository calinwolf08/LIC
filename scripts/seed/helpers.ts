/**
 * Helper functions for seed scripts
 */

import { db } from './db';
import { nanoid } from 'nanoid';

/**
 * Get user by email
 */
export async function getUserByEmail(email: string) {
	return db
		.selectFrom('user')
		.selectAll()
		.where('email', '=', email)
		.executeTakeFirst();
}

/**
 * Clear all entities except users and sessions
 * Preserves scheduling_periods (schedules) but clears their generated assignments
 */
export async function clearAllEntities(userId: string) {
	// Order matters due to foreign key constraints
	// Delete in reverse dependency order

	// Clear assignments first
	await db.deleteFrom('schedule_assignments').execute();

	// Clear elective-related
	await db.deleteFrom('elective_preceptors').execute();
	await db.deleteFrom('clerkship_electives').execute();

	// Clear team-related
	await db.deleteFrom('preceptor_team_members').execute();
	await db.deleteFrom('preceptor_teams').execute();

	// Clear preceptor-related
	await db.deleteFrom('preceptor_availability').execute();
	await db.deleteFrom('preceptor_capacity_rules').execute();
	await db.deleteFrom('preceptor_fallbacks').execute();
	await db.deleteFrom('preceptors').execute();

	// Clear students
	await db.deleteFrom('students').execute();

	// Clear clerkships
	await db.deleteFrom('clerkships').execute();

	// Clear sites and health systems
	await db.deleteFrom('sites').execute();
	await db.deleteFrom('health_systems').execute();
}

/**
 * Get available scenarios with descriptions
 */
export function getAvailableScenarios(): Record<string, string> {
	return {
		'multi-team': 'Two teams with different availability, tests team aggregation',
		'capacity-limited': 'Preceptors with max_students=1, tests double-booking prevention',
		'electives': 'Multiple electives per clerkship, tests elective scheduling',
		'partial-availability': 'Preceptors with gaps in availability, tests partial scheduling',
	};
}

/**
 * Helper to generate date ranges
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
 * Generate weekdays only (Mon-Fri) from a date range
 */
export function generateWeekdaysInRange(startDate: string, endDate: string): string[] {
	const dates: string[] = [];
	const start = new Date(startDate + 'T00:00:00.000Z');
	const end = new Date(endDate + 'T00:00:00.000Z');

	const current = new Date(start);
	while (current <= end) {
		const dayOfWeek = current.getUTCDay();
		if (dayOfWeek >= 1 && dayOfWeek <= 5) {
			// Monday = 1, Friday = 5
			dates.push(current.toISOString().split('T')[0]);
		}
		current.setUTCDate(current.getUTCDate() + 1);
	}
	return dates;
}

/**
 * Generate specific weekdays (e.g., Mon/Wed/Fri) from a date range
 */
export function generateSpecificWeekdays(
	startDate: string,
	endDate: string,
	weekdays: number[] // 0=Sun, 1=Mon, ..., 6=Sat
): string[] {
	const dates: string[] = [];
	const start = new Date(startDate + 'T00:00:00.000Z');
	const end = new Date(endDate + 'T00:00:00.000Z');

	const current = new Date(start);
	while (current <= end) {
		const dayOfWeek = current.getUTCDay();
		if (weekdays.includes(dayOfWeek)) {
			dates.push(current.toISOString().split('T')[0]);
		}
		current.setUTCDate(current.getUTCDate() + 1);
	}
	return dates;
}

// ============================================================================
// Entity Creation Helpers
// ============================================================================

export async function createHealthSystem(name: string, location?: string) {
	const id = nanoid();
	const now = new Date().toISOString();

	await db
		.insertInto('health_systems')
		.values({
			id,
			name,
			location: location ?? null,
			created_at: now,
			updated_at: now,
		})
		.execute();

	return id;
}

export async function createSite(healthSystemId: string, name: string, address?: string) {
	const id = nanoid();
	const now = new Date().toISOString();

	await db
		.insertInto('sites')
		.values({
			id,
			health_system_id: healthSystemId,
			name,
			address: address ?? null,
			created_at: now,
			updated_at: now,
		})
		.execute();

	return id;
}

export async function createClerkship(
	name: string,
	options: {
		type?: string;
		requiredDays?: number;
		specialty?: string;
	} = {}
) {
	const id = nanoid();
	const now = new Date().toISOString();

	await db
		.insertInto('clerkships')
		.values({
			id,
			name,
			clerkship_type: options.type ?? 'outpatient',
			required_days: options.requiredDays ?? 20,
			specialty: options.specialty ?? null,
			created_at: now,
			updated_at: now,
		})
		.execute();

	return id;
}

export async function createElective(
	clerkshipId: string,
	name: string,
	options: {
		minimumDays?: number;
		isRequired?: boolean;
	} = {}
) {
	const id = nanoid();
	const now = new Date().toISOString();

	await db
		.insertInto('clerkship_electives')
		.values({
			id,
			clerkship_id: clerkshipId,
			name,
			minimum_days: options.minimumDays ?? 5,
			is_required: options.isRequired ? 1 : 0,
			override_mode: 'inherit',
			created_at: now,
			updated_at: now,
		})
		.execute();

	return id;
}

export async function createStudent(name: string, email: string) {
	const id = nanoid();
	const now = new Date().toISOString();

	await db
		.insertInto('students')
		.values({
			id,
			name,
			email,
			created_at: now,
			updated_at: now,
		})
		.execute();

	return id;
}

export async function createPreceptor(
	name: string,
	options: {
		healthSystemId: string;
		siteId: string;
		email?: string;
		specialty?: string;
		maxStudents?: number;
	}
) {
	const id = nanoid();
	const now = new Date().toISOString();

	await db
		.insertInto('preceptors')
		.values({
			id,
			name,
			email: options.email ?? `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
			specialty: options.specialty ?? null,
			health_system_id: options.healthSystemId,
			site_id: options.siteId,
			max_students: options.maxStudents ?? 1,
			is_active: 1,
			created_at: now,
			updated_at: now,
		})
		.execute();

	return id;
}

export async function createTeam(clerkshipId: string, name: string, preceptorIds: string[]) {
	const teamId = nanoid();
	const now = new Date().toISOString();

	await db
		.insertInto('preceptor_teams')
		.values({
			id: teamId,
			clerkship_id: clerkshipId,
			name,
			created_at: now,
			updated_at: now,
		})
		.execute();

	// Add members
	for (const preceptorId of preceptorIds) {
		await db
			.insertInto('preceptor_team_members')
			.values({
				id: nanoid(),
				team_id: teamId,
				preceptor_id: preceptorId,
				is_primary: preceptorIds.indexOf(preceptorId) === 0 ? 1 : 0,
				created_at: now,
			})
			.execute();
	}

	return teamId;
}

export async function createAvailability(preceptorId: string, siteId: string, dates: string[]) {
	const now = new Date().toISOString();

	for (const date of dates) {
		await db
			.insertInto('preceptor_availability')
			.values({
				id: nanoid(),
				preceptor_id: preceptorId,
				site_id: siteId,
				date,
				is_available: 1,
				created_at: now,
				updated_at: now,
			})
			.execute();
	}
}

export async function createCapacityRule(
	preceptorId: string,
	options: {
		maxStudentsPerDay?: number;
		maxStudentsPerYear?: number;
	} = {}
) {
	const id = nanoid();
	const now = new Date().toISOString();

	await db
		.insertInto('preceptor_capacity_rules')
		.values({
			id,
			preceptor_id: preceptorId,
			max_students_per_day: options.maxStudentsPerDay ?? 1,
			max_students_per_year: options.maxStudentsPerYear ?? 50,
			created_at: now,
			updated_at: now,
		})
		.execute();

	return id;
}

export async function linkElectivePreceptor(electiveId: string, preceptorId: string) {
	const now = new Date().toISOString();

	await db
		.insertInto('elective_preceptors')
		.values({
			id: nanoid(),
			elective_id: electiveId,
			preceptor_id: preceptorId,
			created_at: now,
		})
		.execute();
}
