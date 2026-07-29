/**
 * The demo seed scenario must produce internally-consistent data and actually
 * demonstrate the Round 3 features it claims (step 36). These tests run the real
 * `seedAdminAssignments` against a migrated in-memory DB, then assert on the
 * data and on the services that read it.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { nanoid } from 'nanoid';
import type { Kysely } from 'kysely';
import type { DB } from '../types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '../test-utils';
import { seedAdminAssignments, CAPACITY_DEMO_EMAIL, type AdminSeedRefs } from './seed-demo';
import { TEST_SCHEDULE } from './seed-schedule';
import { validateSchedule } from '$lib/features/scheduling/services/schedule-validation';
import {
	listOverrides,
	groupOverrides
} from '$lib/features/schedules/services/assignment-service';

const ts = '2026-01-01T00:00:00.000Z';

/**
 * Build the minimum a demo seed needs: a schedule, one health system, six
 * clerkships, three site-linked preceptors and six schedule-member students.
 */
async function buildFixture(db: Kysely<DB>): Promise<AdminSeedRefs> {
	const scheduleId = nanoid();
	await db
		.insertInto('scheduling_periods')
		.values({
			id: scheduleId,
			name: TEST_SCHEDULE.name,
			start_date: TEST_SCHEDULE.startDate,
			end_date: TEST_SCHEDULE.endDate,
			is_active: 0,
			user_id: nanoid(),
			created_at: ts,
			updated_at: ts
		})
		.execute();

	const hsId = nanoid();
	await db
		.insertInto('health_systems')
		.values({ id: hsId, name: 'Metro', created_at: ts, updated_at: ts })
		.execute();

	// Six clerkships; index 5 (psychiatry) needs required_days 14 for "complete".
	const clerkshipIds: string[] = [];
	const required = [28, 28, 28, 28, 28, 14];
	for (let i = 0; i < 6; i++) {
		const id = nanoid();
		clerkshipIds.push(id);
		await db
			.insertInto('clerkships')
			.values({
				id,
				name: `Clerkship ${i}`,
				clerkship_type: 'outpatient',
				required_days: required[i],
				created_at: ts,
				updated_at: ts
			})
			.execute();
		await db
			.insertInto('schedule_clerkships')
			.values({ id: nanoid(), schedule_id: scheduleId, clerkship_id: id, created_at: ts })
			.execute();
	}

	// Three preceptors, each linked to its own site.
	const preceptorIds: string[] = [];
	for (let i = 0; i < 3; i++) {
		const siteId = nanoid();
		await db
			.insertInto('sites')
			.values({ id: siteId, name: `Site ${i}`, health_system_id: hsId, created_at: ts, updated_at: ts })
			.execute();
		const preceptorId = nanoid();
		preceptorIds.push(preceptorId);
		await db
			.insertInto('preceptors')
			.values({
				id: preceptorId,
				name: `Dr. ${i}`,
				email: `dr${i}@metro.edu`,
				health_system_id: hsId,
				max_students: 2,
				created_at: ts,
				updated_at: ts
			})
			.execute();
		await db
			.insertInto('preceptor_sites')
			.values({ preceptor_id: preceptorId, site_id: siteId, created_at: ts })
			.execute();
		await db
			.insertInto('schedule_preceptors')
			.values({ id: nanoid(), schedule_id: scheduleId, preceptor_id: preceptorId, created_at: ts })
			.execute();
	}

	// Six students, all schedule members.
	const studentIds: string[] = [];
	for (let i = 0; i < 6; i++) {
		const id = nanoid();
		studentIds.push(id);
		await db
			.insertInto('students')
			.values({ id, name: `Student ${i}`, email: `s${i}@medschool.edu`, created_at: ts, updated_at: ts })
			.execute();
		await db
			.insertInto('schedule_students')
			.values({ id: nanoid(), schedule_id: scheduleId, student_id: id, created_at: ts })
			.execute();
	}

	return { scheduleId, studentIds, preceptorIds, clerkshipIds, healthSystemIds: [hsId], timestamp: ts };
}

describe('seedAdminAssignments — data integrity', () => {
	let db: Kysely<DB>;
	let refs: AdminSeedRefs;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		refs = await buildFixture(db);
		await seedAdminAssignments(db, refs);
	});

	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('every seeded assignment has a site linked to its preceptor', async () => {
		const assignments = await db
			.selectFrom('schedule_assignments')
			.select(['id', 'preceptor_id', 'site_id', 'student_id'])
			.execute();

		expect(assignments.length).toBeGreaterThan(0);

		for (const a of assignments) {
			expect(a.site_id).not.toBeNull();
			const link = await db
				.selectFrom('preceptor_sites')
				.select('site_id')
				.where('preceptor_id', '=', a.preceptor_id)
				.where('site_id', '=', a.site_id!)
				.executeTakeFirst();
			expect(link, `assignment ${a.id} site must be linked to its preceptor`).toBeDefined();
		}
	});

	it('every assignment student is a member of the owning schedule', async () => {
		const assignments = await db
			.selectFrom('schedule_assignments')
			.select('student_id')
			.execute();
		for (const a of assignments) {
			const member = await db
				.selectFrom('schedule_students')
				.select('id')
				.where('schedule_id', '=', refs.scheduleId)
				.where('student_id', '=', a.student_id)
				.executeTakeFirst();
			expect(member).toBeDefined();
		}
	});

	it('is idempotent — re-running does not change row counts', async () => {
		const count = async (table: 'schedule_assignments' | 'preceptors') =>
			Number(
				(
					await db
						.selectFrom(table)
						.select((eb) => eb.fn.countAll().as('n'))
						.executeTakeFirstOrThrow()
				).n
			);

		const assignmentsBefore = await count('schedule_assignments');
		const preceptorsBefore = await count('preceptors');

		await seedAdminAssignments(db, refs);

		expect(await count('schedule_assignments')).toBe(assignmentsBefore);
		expect(await count('preceptors')).toBe(preceptorsBefore);
	});

	it('creates its marker preceptor exactly once', async () => {
		const markers = await db
			.selectFrom('preceptors')
			.select('id')
			.where('email', '=', CAPACITY_DEMO_EMAIL)
			.execute();
		expect(markers).toHaveLength(1);
	});
});

describe('seedAdminAssignments — demonstrates the features it claims', () => {
	let db: Kysely<DB>;
	let refs: AdminSeedRefs;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		refs = await buildFixture(db);
		await seedAdminAssignments(db, refs);
	});

	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('validateSchedule reports exactly 4 preceptor_capacity findings (not 8)', async () => {
		const result = await validateSchedule(db, refs.scheduleId);
		expect(result.counts.preceptor_capacity).toBe(4);
	});

	it('listOverrides shows the capacity override active and the onboarded one resolved', async () => {
		const all = await listOverrides(db, refs.scheduleId, { includeResolved: true });

		const capacity = all.filter((o) => o.codes.includes('preceptor_capacity'));
		expect(capacity.length).toBeGreaterThan(0);
		expect(capacity.every((o) => o.status === 'active')).toBe(true);

		const onboarded = all.filter((o) => o.codes.includes('not_onboarded'));
		expect(onboarded).toHaveLength(1);
		expect(onboarded[0].status).toBe('resolved');

		// The default (active-only) view hides the resolved override.
		const active = await listOverrides(db, refs.scheduleId);
		expect(active.some((o) => o.codes.includes('not_onboarded'))).toBe(false);
	});

	it('groupOverrides collapses each capacity run into one 4-day row', async () => {
		const records = await listOverrides(db, refs.scheduleId);
		const grouped = groupOverrides(records);

		// The two double-booked students each collapse to a single 4-day row.
		const perStudent = grouped.filter((g) => g.codes.includes('preceptor_capacity'));
		expect(perStudent.length).toBe(2);
		for (const g of perStudent) {
			expect(g.days).toBe(4);
			expect(g.dates).toHaveLength(4);
		}
	});
});
