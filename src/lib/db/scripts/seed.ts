#!/usr/bin/env tsx

/**
 * Database Seed Script
 *
 * Populates the database with test data including:
 * - Test user (admin@example.com / password123)
 * - Test schedule owned by the user
 * - Sample entities associated with the schedule
 *
 * Run with: npm run db:seed
 *
 * This script is idempotent - running it multiple times is safe.
 */

import { createDB } from '../connection';
import { auth } from '../../auth';
import { nanoid } from 'nanoid';
import type { Kysely } from 'kysely';
import type { DB } from '../types';

const TEST_USER = {
	email: 'admin@example.com',
	password: 'password123',
	name: 'Admin User',
};

const TEST_SCHEDULE = {
	name: 'Demo Schedule 2025',
	startDate: '2025-01-06',
	endDate: '2025-06-30',
};

// Helper to get or create entity
async function getOrCreate<T extends { id: string }>(
	db: Kysely<DB>,
	table: any,
	uniqueField: string,
	uniqueValue: string,
	createData: any
): Promise<T> {
	const existing = await db
		.selectFrom(table)
		.selectAll()
		.where(uniqueField as any, '=', uniqueValue)
		.executeTakeFirst();

	if (existing) {
		return existing as T;
	}

	await db.insertInto(table).values(createData).execute();
	return createData as T;
}

// Helper to ensure schedule association exists
async function ensureScheduleAssociation(
	db: Kysely<DB>,
	junctionTable: any,
	scheduleId: string,
	entityIdField: string,
	entityId: string,
	timestamp: string
) {
	const existing = await db
		.selectFrom(junctionTable)
		.select('id')
		.where('schedule_id', '=', scheduleId)
		.where(entityIdField as any, '=', entityId)
		.executeTakeFirst();

	if (!existing) {
		await db.insertInto(junctionTable).values({
			id: nanoid(),
			schedule_id: scheduleId,
			[entityIdField]: entityId,
			created_at: timestamp,
		}).execute();
	}
}

async function seed(db: Kysely<DB>) {
	const timestamp = new Date().toISOString();

	// Step 1: Create test user
	console.log('Creating test user...');
	let userId: string;

	const existingUser = await db
		.selectFrom('user')
		.select('id')
		.where('email', '=', TEST_USER.email)
		.executeTakeFirst();

	if (existingUser) {
		console.log(`  User ${TEST_USER.email} already exists`);
		userId = existingUser.id;
	} else {
		try {
			const result = await auth.api.signUpEmail({
				body: {
					email: TEST_USER.email,
					password: TEST_USER.password,
					name: TEST_USER.name,
				},
			});

			if (!result.user) {
				throw new Error('Failed to create user');
			}

			userId = result.user.id;
			console.log(`  Created user: ${TEST_USER.email}`);
		} catch (error: any) {
			const user = await db
				.selectFrom('user')
				.select('id')
				.where('email', '=', TEST_USER.email)
				.executeTakeFirst();

			if (user) {
				userId = user.id;
				console.log(`  User ${TEST_USER.email} already exists (from auth)`);
			} else {
				throw error;
			}
		}
	}

	// Step 2: Create test schedule
	console.log('\nCreating test schedule...');
	let scheduleId: string;

	const existingSchedule = await db
		.selectFrom('scheduling_periods')
		.select('id')
		.where('user_id', '=', userId)
		.executeTakeFirst();

	if (existingSchedule) {
		console.log(`  Schedule already exists for user`);
		scheduleId = existingSchedule.id!;
	} else {
		const orphanSchedule = await db
			.selectFrom('scheduling_periods')
			.select('id')
			.where('user_id', 'is', null)
			.executeTakeFirst();

		if (orphanSchedule) {
			scheduleId = orphanSchedule.id!;
			await db
				.updateTable('scheduling_periods')
				.set({
					user_id: userId,
					name: TEST_SCHEDULE.name,
					start_date: TEST_SCHEDULE.startDate,
					end_date: TEST_SCHEDULE.endDate,
					year: 2025,
					is_active: 1,
					updated_at: timestamp,
				})
				.where('id', '=', scheduleId)
				.execute();
			console.log(`  Claimed orphan schedule`);
		} else {
			scheduleId = nanoid();
			await db
				.insertInto('scheduling_periods')
				.values({
					id: scheduleId,
					name: TEST_SCHEDULE.name,
					start_date: TEST_SCHEDULE.startDate,
					end_date: TEST_SCHEDULE.endDate,
					year: 2025,
					is_active: 1,
					user_id: userId,
					created_at: timestamp,
					updated_at: timestamp,
				})
				.execute();
			console.log(`  Created schedule: ${TEST_SCHEDULE.name}`);
		}
	}

	// Set as user's active schedule
	await db
		.updateTable('user')
		.set({ active_schedule_id: scheduleId })
		.where('id', '=', userId)
		.execute();

	// Step 3: Create Health Systems
	console.log('\nCreating health systems...');
	const healthSystemIds: string[] = [];

	const healthSystemsData = [
		{ name: 'Metro Health Network', location: 'Downtown Metro Area', description: 'Large urban health network' },
		{ name: 'Community Care Partners', location: 'Suburban Region', description: 'Community-focused healthcare' },
	];

	for (const data of healthSystemsData) {
		let hs = await db.selectFrom('health_systems').selectAll().where('name', '=', data.name).executeTakeFirst();

		if (!hs) {
			const id = nanoid();
			await db.insertInto('health_systems').values({ id, ...data, created_at: timestamp, updated_at: timestamp }).execute();
			healthSystemIds.push(id);
		} else {
			healthSystemIds.push(hs.id!);
		}

		await ensureScheduleAssociation(db, 'schedule_health_systems', scheduleId, 'health_system_id', healthSystemIds[healthSystemIds.length - 1], timestamp);
	}
	console.log(`  Created/found ${healthSystemIds.length} health systems`);

	// Step 4: Create Sites
	console.log('\nCreating sites...');
	const siteIds: string[] = [];

	const sitesData = [
		{ name: 'Metro General Hospital', health_system_id: healthSystemIds[0], address: '123 Main St' },
		{ name: 'Metro Family Clinic', health_system_id: healthSystemIds[0], address: '456 Oak Ave' },
		{ name: 'Community Hospital', health_system_id: healthSystemIds[1], address: '789 Elm Rd' },
		{ name: 'Suburban Primary Care', health_system_id: healthSystemIds[1], address: '321 Pine St' },
	];

	for (const data of sitesData) {
		let site = await db.selectFrom('sites').selectAll().where('name', '=', data.name).executeTakeFirst();

		if (!site) {
			const id = nanoid();
			await db.insertInto('sites').values({ id, ...data, created_at: timestamp, updated_at: timestamp }).execute();
			siteIds.push(id);
		} else {
			siteIds.push(site.id!);
		}

		await ensureScheduleAssociation(db, 'schedule_sites', scheduleId, 'site_id', siteIds[siteIds.length - 1], timestamp);
	}
	console.log(`  Created/found ${siteIds.length} sites`);

	// Step 5: Create Clerkships
	console.log('\nCreating clerkships...');
	const clerkshipIds: string[] = [];

	const clerkshipsData = [
		{ name: 'Family Medicine', specialty: 'Family Medicine', clerkship_type: 'outpatient', required_days: 28 },
		{ name: 'Internal Medicine', specialty: 'Internal Medicine', clerkship_type: 'inpatient', required_days: 28 },
		{ name: 'Pediatrics', specialty: 'Pediatrics', clerkship_type: 'outpatient', required_days: 28 },
		{ name: 'Surgery', specialty: 'Surgery', clerkship_type: 'inpatient', required_days: 28 },
		{ name: 'OB/GYN', specialty: 'OB/GYN', clerkship_type: 'inpatient', required_days: 28 },
		{ name: 'Psychiatry', specialty: 'Psychiatry', clerkship_type: 'outpatient', required_days: 14 },
	];

	for (const data of clerkshipsData) {
		let clerkship = await db.selectFrom('clerkships').selectAll().where('name', '=', data.name).executeTakeFirst();

		if (!clerkship) {
			const id = nanoid();
			await db.insertInto('clerkships').values({ id, ...data, created_at: timestamp, updated_at: timestamp }).execute();
			clerkshipIds.push(id);
		} else {
			clerkshipIds.push(clerkship.id!);
		}

		await ensureScheduleAssociation(db, 'schedule_clerkships', scheduleId, 'clerkship_id', clerkshipIds[clerkshipIds.length - 1], timestamp);
	}
	console.log(`  Created/found ${clerkshipIds.length} clerkships`);

	// Step 6: Create clerkship requirements
	console.log('\nCreating clerkship requirements...');
	for (let i = 0; i < clerkshipIds.length; i++) {
		const existing = await db.selectFrom('clerkship_requirements').select('id').where('clerkship_id', '=', clerkshipIds[i]).executeTakeFirst();
		if (!existing) {
			await db.insertInto('clerkship_requirements').values({
				id: nanoid(),
				clerkship_id: clerkshipIds[i],
				requirement_type: clerkshipsData[i].clerkship_type,
				required_days: clerkshipsData[i].required_days,
				override_mode: 'override_section',
				override_assignment_strategy: 'team_continuity',
				created_at: timestamp,
				updated_at: timestamp,
			}).execute();
		}
	}
	console.log(`  Created/found ${clerkshipIds.length} clerkship requirements`);

	// Step 7: Create Students
	console.log('\nCreating students...');
	const studentIds: string[] = [];

	const studentsData = [
		{ name: 'Alice Johnson', email: 'ajohnson@medschool.edu' },
		{ name: 'Bob Williams', email: 'bwilliams@medschool.edu' },
		{ name: 'Carol Martinez', email: 'cmartinez@medschool.edu' },
		{ name: 'David Kim', email: 'dkim@medschool.edu' },
		{ name: 'Emma Thompson', email: 'ethompson@medschool.edu' },
		{ name: 'Frank Garcia', email: 'fgarcia@medschool.edu' },
		{ name: 'Grace Lee', email: 'glee@medschool.edu' },
		{ name: 'Henry Brown', email: 'hbrown@medschool.edu' },
		{ name: 'Ivy Wilson', email: 'iwilson@medschool.edu' },
		{ name: 'Jack Davis', email: 'jdavis@medschool.edu' },
	];

	for (const data of studentsData) {
		let student = await db.selectFrom('students').selectAll().where('email', '=', data.email).executeTakeFirst();

		if (!student) {
			const id = nanoid();
			await db.insertInto('students').values({ id, ...data, created_at: timestamp, updated_at: timestamp }).execute();
			studentIds.push(id);
		} else {
			studentIds.push(student.id!);
		}

		await ensureScheduleAssociation(db, 'schedule_students', scheduleId, 'student_id', studentIds[studentIds.length - 1], timestamp);
	}
	console.log(`  Created/found ${studentIds.length} students`);

	// Step 8: Create Preceptors
	console.log('\nCreating preceptors...');
	const preceptorIds: string[] = [];

	const preceptorsData = [
		{ name: 'Dr. Amanda Smith', email: 'asmith@metro.edu', health_system_id: healthSystemIds[0], siteIndex: 0 },
		{ name: 'Dr. James Brown', email: 'jbrown@metro.edu', health_system_id: healthSystemIds[0], siteIndex: 1 },
		{ name: 'Dr. Maria Garcia', email: 'mgarcia@metro.edu', health_system_id: healthSystemIds[0], siteIndex: 0 },
		{ name: 'Dr. Robert Chen', email: 'rchen@metro.edu', health_system_id: healthSystemIds[0], siteIndex: 1 },
		{ name: 'Dr. Sarah Wilson', email: 'swilson@community.edu', health_system_id: healthSystemIds[1], siteIndex: 2 },
		{ name: 'Dr. Michael Lee', email: 'mlee@community.edu', health_system_id: healthSystemIds[1], siteIndex: 2 },
		{ name: 'Dr. Jennifer Park', email: 'jpark@community.edu', health_system_id: healthSystemIds[1], siteIndex: 3 },
		{ name: 'Dr. David Miller', email: 'dmiller@community.edu', health_system_id: healthSystemIds[1], siteIndex: 3 },
	];

	for (const data of preceptorsData) {
		const { siteIndex, ...preceptorData } = data;
		let preceptor = await db.selectFrom('preceptors').selectAll().where('email', '=', data.email).executeTakeFirst();

		if (!preceptor) {
			const id = nanoid();
			await db.insertInto('preceptors').values({ id, ...preceptorData, max_students: 2, created_at: timestamp, updated_at: timestamp }).execute();
			preceptorIds.push(id);

			// Add site association
			await db.insertInto('preceptor_sites').values({ preceptor_id: id, site_id: siteIds[siteIndex], created_at: timestamp }).execute();

			// Add capacity rule
			await db.insertInto('preceptor_capacity_rules').values({
				id: nanoid(),
				preceptor_id: id,
				max_students_per_day: 2,
				max_students_per_year: 50,
				created_at: timestamp,
				updated_at: timestamp,
			}).execute();

			// Add availability pattern
			await db.insertInto('preceptor_availability_patterns').values({
				id: nanoid(),
				preceptor_id: id,
				site_id: siteIds[siteIndex],
				pattern_type: 'weekly',
				config: JSON.stringify({ daysOfWeek: [1, 2, 3, 4, 5] }),
				date_range_start: TEST_SCHEDULE.startDate,
				date_range_end: TEST_SCHEDULE.endDate,
				is_available: 1,
				enabled: 1,
				specificity: 1,
				created_at: timestamp,
				updated_at: timestamp,
			}).execute();
		} else {
			preceptorIds.push(preceptor.id!);
		}

		await ensureScheduleAssociation(db, 'schedule_preceptors', scheduleId, 'preceptor_id', preceptorIds[preceptorIds.length - 1], timestamp);
	}
	console.log(`  Created/found ${preceptorIds.length} preceptors`);

	// Step 9: Create Teams
	console.log('\nCreating teams...');
	const teamIds: string[] = [];

	const teamsData = [
		{ name: 'Family Medicine Team A', clerkshipIndex: 0, preceptorIndices: [0, 1] },
		{ name: 'Internal Medicine Team A', clerkshipIndex: 1, preceptorIndices: [2, 3] },
		{ name: 'Pediatrics Team A', clerkshipIndex: 2, preceptorIndices: [4, 5] },
		{ name: 'Surgery Team A', clerkshipIndex: 3, preceptorIndices: [6, 7] },
	];

	for (const data of teamsData) {
		let team = await db.selectFrom('preceptor_teams').selectAll().where('name', '=', data.name).executeTakeFirst();

		if (!team) {
			const teamId = nanoid();
			await db.insertInto('preceptor_teams').values({
				id: teamId,
				name: data.name,
				clerkship_id: clerkshipIds[data.clerkshipIndex],
				require_same_health_system: 0,
				require_same_site: 0,
				require_same_specialty: 0,
				requires_admin_approval: 0,
				created_at: timestamp,
				updated_at: timestamp,
			}).execute();

			// Add team members
			for (let i = 0; i < data.preceptorIndices.length; i++) {
				await db.insertInto('preceptor_team_members').values({
					id: nanoid(),
					team_id: teamId,
					preceptor_id: preceptorIds[data.preceptorIndices[i]],
					role: i === 0 ? 'lead' : 'member',
					priority: i + 1,
					is_fallback_only: 0,
					created_at: timestamp,
				}).execute();
			}

			teamIds.push(teamId);
		} else {
			teamIds.push(team.id!);
		}

		await ensureScheduleAssociation(db, 'schedule_teams', scheduleId, 'team_id', teamIds[teamIds.length - 1], timestamp);
	}
	console.log(`  Created/found ${teamIds.length} teams`);

	// Summary
	console.log('\n' + '='.repeat(50));
	console.log('SEED COMPLETED SUCCESSFULLY');
	console.log('='.repeat(50));
	console.log('\nTest User Credentials:');
	console.log(`  Email:    ${TEST_USER.email}`);
	console.log(`  Password: ${TEST_USER.password}`);
	console.log('\nTest Schedule:');
	console.log(`  Name:  ${TEST_SCHEDULE.name}`);
	console.log(`  Range: ${TEST_SCHEDULE.startDate} to ${TEST_SCHEDULE.endDate}`);
	console.log('\nEntities Created:');
	console.log(`  - ${healthSystemIds.length} Health Systems`);
	console.log(`  - ${siteIds.length} Sites`);
	console.log(`  - ${clerkshipIds.length} Clerkships`);
	console.log(`  - ${studentIds.length} Students`);
	console.log(`  - ${preceptorIds.length} Preceptors`);
	console.log(`  - ${teamIds.length} Teams`);
	console.log('\nAll entities are associated with the test schedule.');
}

async function main() {
	console.log('Starting database seed...\n');

	const db = createDB();

	try {
		await seed(db);
	} finally {
		await db.destroy();
	}
}

main().catch((error) => {
	console.error('Seed failed:', error);
	process.exit(1);
});
