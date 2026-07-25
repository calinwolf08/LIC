import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import { previewRequirementImpact } from './requirement-preview';

const SCHEDULE = 'sched-1';
const STUDENT = 'stu-1';
const CLERKSHIP = 'clerk-1';
const PRECEPTOR = 'prec-1';
const TODAY = '2030-03-10';

async function seed(db: Kysely<DB>) {
	const ts = new Date().toISOString();
	await db
		.insertInto('scheduling_periods')
		.values({
			id: SCHEDULE,
			name: 'Test',
			start_date: '2030-01-01',
			end_date: '2030-12-31',
			created_at: ts,
			updated_at: ts
		})
		.execute();
	await db
		.insertInto('students')
		.values({ id: STUDENT, name: 'Alice', email: 'a@x.com', created_at: ts, updated_at: ts })
		.execute();
	await db
		.insertInto('preceptors')
		.values({ id: PRECEPTOR, name: 'Dr P', email: 'p@x.com', created_at: ts, updated_at: ts })
		.execute();
	await db
		.insertInto('clerkships')
		.values({
			id: CLERKSHIP,
			name: 'Pediatrics',
			clerkship_type: 'outpatient',
			required_days: 3,
			created_at: ts,
			updated_at: ts
		})
		.execute();
	await db
		.insertInto('schedule_clerkships')
		.values({ id: 'sc-1', schedule_id: SCHEDULE, clerkship_id: CLERKSHIP, created_at: ts })
		.execute();
}

async function assign(db: Kysely<DB>, id: string, date: string) {
	const ts = new Date().toISOString();
	await db
		.insertInto('schedule_assignments')
		.values({
			id,
			student_id: STUDENT,
			preceptor_id: PRECEPTOR,
			clerkship_id: CLERKSHIP,
			date,
			status: 'scheduled',
			created_at: ts,
			updated_at: ts
		})
		.execute();
}

describe('previewRequirementImpact', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db);
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('reports the full requirement as unscheduled with nothing assigned', async () => {
		const r = await previewRequirementImpact(db, SCHEDULE, STUDENT, CLERKSHIP, 0, TODAY);
		expect(r).toMatchObject({
			clerkshipName: 'Pediatrics',
			required: 3,
			completed: 0,
			scheduled: 0,
			unscheduled: 3,
			selected: 0,
			resultingTotal: 0,
			exceedsBy: 0
		});
	});

	it('splits existing assignments into completed (past) and scheduled (today onward)', async () => {
		await assign(db, 'a-1', '2030-03-05'); // past
		await assign(db, 'a-2', TODAY); // today counts as scheduled
		const r = await previewRequirementImpact(db, SCHEDULE, STUDENT, CLERKSHIP, 0, TODAY);
		expect(r.completed).toBe(1);
		expect(r.scheduled).toBe(1);
		expect(r.unscheduled).toBe(1);
	});

	it('is an exact fit when the selection covers the remainder', async () => {
		await assign(db, 'a-1', '2030-03-05');
		const r = await previewRequirementImpact(db, SCHEDULE, STUDENT, CLERKSHIP, 2, TODAY);
		expect(r.resultingTotal).toBe(3);
		expect(r.exceedsBy).toBe(0);
	});

	it('reports exceedsBy when the selection overshoots', async () => {
		await assign(db, 'a-1', '2030-03-05');
		const r = await previewRequirementImpact(db, SCHEDULE, STUDENT, CLERKSHIP, 4, TODAY);
		expect(r.resultingTotal).toBe(5);
		expect(r.exceedsBy).toBe(2);
	});

	it('reports exceedsBy correctly when the student is already over', async () => {
		await assign(db, 'a-1', '2030-03-05');
		await assign(db, 'a-2', '2030-03-06');
		await assign(db, 'a-3', '2030-03-07');
		await assign(db, 'a-4', '2030-03-08');
		const r = await previewRequirementImpact(db, SCHEDULE, STUDENT, CLERKSHIP, 1, TODAY);
		expect(r.completed).toBe(4);
		expect(r.unscheduled).toBe(0);
		expect(r.resultingTotal).toBe(5);
		expect(r.exceedsBy).toBe(2);
	});

	it('treats a negative count as zero', async () => {
		const r = await previewRequirementImpact(db, SCHEDULE, STUDENT, CLERKSHIP, -5, TODAY);
		expect(r.selected).toBe(0);
	});

	it('reports zero requirement for a clerkship outside the schedule', async () => {
		const r = await previewRequirementImpact(db, 'other-schedule', STUDENT, CLERKSHIP, 2, TODAY);
		expect(r.required).toBe(0);
		expect(r.clerkshipName).toBe('');
	});
});
