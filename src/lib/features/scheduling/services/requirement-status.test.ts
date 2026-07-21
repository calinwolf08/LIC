import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import { getStudentStatuses, completionPercent } from './requirement-status';

const SCHED = 'sched-1';
const STU = 'stu-1';
const CLERK = 'clerk-1';
const PREC = 'prec-1';
const TODAY = '2025-06-01';

async function seed(db: Kysely<DB>) {
	const ts = new Date().toISOString();
	await db
		.insertInto('scheduling_periods')
		.values({ id: SCHED, name: 'T', start_date: '2025-01-01', end_date: '2025-12-31', created_at: ts, updated_at: ts })
		.execute();
	await db.insertInto('students').values({ id: STU, name: 'A', email: 'a@x.com', created_at: ts, updated_at: ts }).execute();
	await db
		.insertInto('clerkships')
		.values({ id: CLERK, name: 'Medicine', clerkship_type: 'outpatient', required_days: 3, created_at: ts, updated_at: ts })
		.execute();
	await db.insertInto('preceptors').values({ id: PREC, name: 'P', email: 'p@x.com', max_students: 5, created_at: ts, updated_at: ts }).execute();
	await db.insertInto('schedule_students').values({ id: 'ss-1', schedule_id: SCHED, student_id: STU, created_at: ts }).execute();
	await db.insertInto('schedule_clerkships').values({ id: 'sc-1', schedule_id: SCHED, clerkship_id: CLERK, created_at: ts }).execute();
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

describe('getStudentStatuses', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db);
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('reports all-unscheduled with no assignments (state=none)', async () => {
		const [status] = await getStudentStatuses(db, SCHED, TODAY);
		expect(status.overall).toMatchObject({ required: 3, completed: 0, scheduled: 0, unscheduled: 3 });
		expect(status.scheduling_state).toBe('none');
	});

	it('splits completed vs scheduled by today', async () => {
		await addAssignment(db, 'a-past', '2025-05-01'); // completed
		await addAssignment(db, 'a-future', '2025-07-01'); // scheduled
		const [status] = await getStudentStatuses(db, SCHED, TODAY);
		const c = status.per_clerkship[0];
		expect(c.completed).toBe(1);
		expect(c.scheduled).toBe(1);
		expect(c.unscheduled).toBe(1);
		expect(status.scheduling_state).toBe('partial');
		expect(completionPercent(status.overall)).toBe(67);
	});

	it('reports full when all required days are covered', async () => {
		await addAssignment(db, 'a1', '2025-05-01');
		await addAssignment(db, 'a2', '2025-05-02');
		await addAssignment(db, 'a3', '2025-07-02');
		const [status] = await getStudentStatuses(db, SCHED, TODAY);
		expect(status.overall.unscheduled).toBe(0);
		expect(status.scheduling_state).toBe('full');
	});

	it('counts over-scheduling but still reports full', async () => {
		for (let i = 1; i <= 5; i++) await addAssignment(db, `a${i}`, `2025-05-0${i}`);
		const [status] = await getStudentStatuses(db, SCHED, TODAY);
		expect(status.per_clerkship[0].over_scheduled).toBe(2);
		expect(status.scheduling_state).toBe('full');
	});

	// Note: the DB enforces UNIQUE(student_id, date), so a student can never be
	// double-booked; conflict_count from this path is therefore always 0. Real
	// soft conflicts (unavailable preceptor, blackout, capacity) come from
	// validateSchedule (Step 10).
	it('reports zero conflicts for a normal schedule', async () => {
		await addAssignment(db, 'a1', '2025-05-05');
		const [status] = await getStudentStatuses(db, SCHED, TODAY);
		expect(status.conflict_count).toBe(0);
	});
});
