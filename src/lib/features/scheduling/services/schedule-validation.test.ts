import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import { validateSchedule } from './schedule-validation';
import { getSetupChecklist } from './readiness';

const SCHED = 'sched-1';
const STU = 'stu-1';
const PREC = 'prec-1';
const CLERK = 'clerk-1';
const HS = 'hs-1';

async function seed(db: Kysely<DB>) {
	const ts = new Date().toISOString();
	await db
		.insertInto('scheduling_periods')
		.values({
			id: SCHED,
			name: 'Demo',
			start_date: '2025-01-01',
			end_date: '2025-12-31',
			created_at: ts,
			updated_at: ts
		})
		.execute();
	await db
		.insertInto('students')
		.values({ id: STU, name: 'A', email: 'a@x.com', created_at: ts, updated_at: ts })
		.execute();
	await db
		.insertInto('health_systems')
		.values({ id: HS, name: 'General', created_at: ts, updated_at: ts })
		.execute();
	await db
		.insertInto('preceptors')
		.values({
			id: PREC,
			name: 'P',
			email: 'p@x.com',
			max_students: 1,
			health_system_id: HS,
			created_at: ts,
			updated_at: ts
		})
		.execute();
	await db
		.insertInto('clerkships')
		.values({
			id: CLERK,
			name: 'Med',
			clerkship_type: 'outpatient',
			required_days: 5,
			created_at: ts,
			updated_at: ts
		})
		.execute();
	await db
		.insertInto('schedule_students')
		.values({ id: 'ss', schedule_id: SCHED, student_id: STU, created_at: ts })
		.execute();
	await db
		.insertInto('schedule_clerkships')
		.values({ id: 'sc', schedule_id: SCHED, clerkship_id: CLERK, created_at: ts })
		.execute();
	await db
		.insertInto('schedule_preceptors')
		.values({ id: 'sp', schedule_id: SCHED, preceptor_id: PREC, created_at: ts })
		.execute();
}

async function addAssignment(db: Kysely<DB>, id: string, date: string) {
	const ts = new Date().toISOString();
	await db
		.insertInto('schedule_assignments')
		.values({
			id,
			student_id: STU,
			preceptor_id: PREC,
			clerkship_id: CLERK,
			date,
			status: 'scheduled',
			created_at: ts,
			updated_at: ts
		})
		.execute();
}

describe('validateSchedule', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db);
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('returns empty for a schedule with no assignments', async () => {
		const r = await validateSchedule(db, SCHED);
		expect(r.violations).toHaveLength(0);
	});

	it('flags a not-onboarded soft violation for an in-range assignment', async () => {
		// Student is not onboarded to the preceptor's health system.
		await addAssignment(db, 'a1', '2025-03-03');
		const r = await validateSchedule(db, SCHED);
		expect(r.counts['not_onboarded']).toBe(1);
		expect(r.byStudent[STU]?.some((v) => v.code === 'not_onboarded')).toBe(true);
		expect(r.byDate['2025-03-03']).toBeTruthy();
	});

	it('flags blackout and outside-schedule violations', async () => {
		await db
			.insertInto('blackout_dates')
			.values({ id: 'bo', date: '2025-03-04', created_at: new Date().toISOString() })
			.execute();
		await addAssignment(db, 'a1', '2025-03-04'); // blackout
		await addAssignment(db, 'a2', '2030-01-01'); // outside range
		const r = await validateSchedule(db, SCHED);
		expect(r.counts['blackout_date']).toBe(1);
		expect(r.counts['outside_schedule']).toBe(1);
	});

	it('does not flag an onboarded, in-range assignment', async () => {
		await db
			.insertInto('student_health_system_onboarding')
			.values({
				id: 'ob',
				student_id: STU,
				health_system_id: HS,
				is_completed: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.execute();
		await addAssignment(db, 'a1', '2025-03-03');
		const r = await validateSchedule(db, SCHED);
		expect(r.violations).toHaveLength(0);
	});

	it('flags preceptor over-capacity when two students share a slot (max 1)', async () => {
		const ts = new Date().toISOString();
		// Onboard STU so the only violation is capacity.
		await db
			.insertInto('student_health_system_onboarding')
			.values({
				id: 'ob1',
				student_id: STU,
				health_system_id: HS,
				is_completed: 1,
				created_at: ts,
				updated_at: ts
			})
			.execute();
		// Second student, onboarded too.
		await db
			.insertInto('students')
			.values({ id: 'stu-2', name: 'B', email: 'b@x.com', created_at: ts, updated_at: ts })
			.execute();
		await db
			.insertInto('schedule_students')
			.values({ id: 'ss2', schedule_id: SCHED, student_id: 'stu-2', created_at: ts })
			.execute();
		await db
			.insertInto('student_health_system_onboarding')
			.values({
				id: 'ob2',
				student_id: 'stu-2',
				health_system_id: HS,
				is_completed: 1,
				created_at: ts,
				updated_at: ts
			})
			.execute();
		// Two assignments, same preceptor + date (max_students = 1).
		await addAssignment(db, 'a1', '2025-03-03');
		await db
			.insertInto('schedule_assignments')
			.values({
				id: 'a2',
				student_id: 'stu-2',
				preceptor_id: PREC,
				clerkship_id: CLERK,
				date: '2025-03-03',
				status: 'scheduled',
				created_at: ts,
				updated_at: ts
			})
			.execute();

		const r = await validateSchedule(db, SCHED);
		// Both assignments on that date are over capacity.
		expect(r.counts['preceptor_capacity']).toBe(2);
		expect(r.byPreceptor[PREC]?.filter((v) => v.code === 'preceptor_capacity')).toHaveLength(2);
		expect(r.byDate['2025-03-03']?.some((v) => v.code === 'preceptor_capacity')).toBe(true);
	});

	it('indexes violations by date, student, and preceptor', async () => {
		await addAssignment(db, 'a1', '2025-03-03'); // not_onboarded soft
		const r = await validateSchedule(db, SCHED);
		expect(Object.keys(r.byDate)).toContain('2025-03-03');
		expect(Object.keys(r.byStudent)).toContain(STU);
		expect(Object.keys(r.byPreceptor)).toContain(PREC);
		// Each index entry carries the assignment id.
		expect(r.byStudent[STU][0].assignment_id).toBe('a1');
	});

	it('does not double-book-flag a single assignment against itself', async () => {
		await addAssignment(db, 'a1', '2025-03-03');
		const r = await validateSchedule(db, SCHED);
		expect(r.violations.some((v) => v.code === 'student_double_booked')).toBe(false);
	});
});

describe('getSetupChecklist', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db);
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('marks students/clerkships/preceptors done, availability + locations pending', async () => {
		const items = await getSetupChecklist(db, SCHED, false);
		const byId = Object.fromEntries(items.map((i) => [i.id, i]));
		expect(byId['students'].done).toBe(true);
		expect(byId['clerkships'].done).toBe(true);
		expect(byId['preceptors'].done).toBe(true);
		expect(byId['availability'].done).toBe(false); // no availability rows
		expect(byId['locations'].done).toBe(false); // no schedule_sites/health_systems junctions
		// non-entitled: no autogen item
		expect(byId['autogen-ready']).toBeUndefined();
	});

	it('includes the autogen item for entitled users', async () => {
		const items = await getSetupChecklist(db, SCHED, true);
		expect(items.some((i) => i.id === 'autogen-ready')).toBe(true);
	});
});
