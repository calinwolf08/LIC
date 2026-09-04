/**
 * Phase 1b behaviour tests: elective_id end to end (P-01), single insert path
 * with skip reporting (P-09/P-10), per-elective requirement tracking (P-01),
 * and the single-validator edit envelope + lock semantics (P-03/P-08).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import {
	createManualAssignment,
	insertGeneratedAssignments,
	insertAssignments
} from './assignment-service';
import { reassignToPreceptor, updateAssignmentChecked } from './editing-service';
import { getStudentStatuses } from '$lib/features/scheduling/services/requirement-status';

const SCHED = 'sched-1';
const STU = 'stu-1';
const HS = 'hs-1';
const SITE = 'site-1';
const CLERK = 'clerk-1';
const OTHER_CLERK = 'clerk-2';
const PREC = 'prec-1';
const PREC2 = 'prec-2';
const ELECTIVE = 'elec-1';
const OTHER_ELECTIVE = 'elec-2';

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
		.values({ id: STU, name: 'Stu', email: 's@x.com', created_at: ts, updated_at: ts })
		.execute();
	await db
		.insertInto('health_systems')
		.values({ id: HS, name: 'HS', created_at: ts, updated_at: ts })
		.execute();
	await db
		.insertInto('sites')
		.values({ id: SITE, name: 'Site', health_system_id: HS, created_at: ts, updated_at: ts })
		.execute();
	await db
		.insertInto('clerkships')
		.values([
			{
				id: CLERK,
				name: 'Med',
				clerkship_type: 'outpatient',
				required_days: 20,
				created_at: ts,
				updated_at: ts
			},
			{
				id: OTHER_CLERK,
				name: 'Surg',
				clerkship_type: 'inpatient',
				required_days: 10,
				created_at: ts,
				updated_at: ts
			}
		])
		.execute();
	for (const p of [PREC, PREC2]) {
		await db
			.insertInto('preceptors')
			.values({
				id: p,
				name: p,
				email: `${p}@x.com`,
				max_students: 1,
				health_system_id: HS,
				created_at: ts,
				updated_at: ts
			})
			.execute();
	}
	await db
		.insertInto('clerkship_electives')
		.values([
			{
				id: ELECTIVE,
				clerkship_id: CLERK,
				name: 'Cardio',
				minimum_days: 5,
				is_required: 1,
				override_mode: 'inherit',
				created_at: ts,
				updated_at: ts
			},
			{
				id: OTHER_ELECTIVE,
				clerkship_id: OTHER_CLERK,
				name: 'Ortho',
				minimum_days: 3,
				is_required: 0,
				override_mode: 'inherit',
				created_at: ts,
				updated_at: ts
			}
		])
		.execute();
	// Onboard the student so not_onboarded does not block the manual create.
	await db
		.insertInto('student_health_system_onboarding')
		.values({
			id: 'onb-1',
			student_id: STU,
			health_system_id: HS,
			is_completed: 1,
			created_at: ts,
			updated_at: ts
		})
		.execute();
	// Scope junctions
	await db
		.insertInto('schedule_students')
		.values({ id: 'ss', schedule_id: SCHED, student_id: STU, created_at: ts })
		.execute();
	await db
		.insertInto('schedule_clerkships')
		.values([
			{ id: 'sc1', schedule_id: SCHED, clerkship_id: CLERK, created_at: ts },
			{ id: 'sc2', schedule_id: SCHED, clerkship_id: OTHER_CLERK, created_at: ts }
		])
		.execute();
	await db
		.insertInto('schedule_preceptors')
		.values([
			{ id: 'sp1', schedule_id: SCHED, preceptor_id: PREC, created_at: ts },
			{ id: 'sp2', schedule_id: SCHED, preceptor_id: PREC2, created_at: ts }
		])
		.execute();
}

describe('Phase 1b — elective_id and single insert', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db);
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('persists elective_id on a manual assignment that belongs to the clerkship', async () => {
		const res = await createManualAssignment(
			db,
			SCHED,
			{
				student_id: STU,
				preceptor_id: PREC,
				clerkship_id: CLERK,
				site_id: SITE,
				elective_id: ELECTIVE,
				date: '2025-06-02'
			},
			{ today: '2025-01-01' }
		);
		expect(res.ok).toBe(true);
		if (res.ok) expect(res.assignment.elective_id).toBe(ELECTIVE);
	});

	it('hard-rejects an elective from a different clerkship (P-01)', async () => {
		const res = await createManualAssignment(
			db,
			SCHED,
			{
				student_id: STU,
				preceptor_id: PREC,
				clerkship_id: CLERK,
				site_id: SITE,
				elective_id: OTHER_ELECTIVE,
				date: '2025-06-03'
			},
			{ today: '2025-01-01' }
		);
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.hard.some((v) => v.code === 'entity_missing')).toBe(true);
	});

	it('reports the blocking assignment id for a skipped generated slot (P-09)', async () => {
		const [manual] = await insertAssignments(db, [
			{
				schedule_id: SCHED,
				student_id: STU,
				preceptor_id: PREC,
				clerkship_id: CLERK,
				date: '2025-06-04',
				source: 'manual'
			}
		]);
		const { inserted, skipped } = await insertGeneratedAssignments(db, SCHED, [
			{ studentId: STU, preceptorId: PREC2, clerkshipId: CLERK, date: '2025-06-04' }
		]);
		expect(inserted).toHaveLength(0);
		expect(skipped).toHaveLength(1);
		expect(skipped[0].blockedBy).toBe(manual.id);
	});

	it('tracks per-elective progress separately from clerkship days (P-01)', async () => {
		// 2 elective days + 1 plain clerkship day.
		await insertAssignments(db, [
			{
				schedule_id: SCHED,
				student_id: STU,
				preceptor_id: PREC,
				clerkship_id: CLERK,
				elective_id: ELECTIVE,
				date: '2025-06-05',
				source: 'manual'
			},
			{
				schedule_id: SCHED,
				student_id: STU,
				preceptor_id: PREC,
				clerkship_id: CLERK,
				elective_id: ELECTIVE,
				date: '2025-06-06',
				source: 'manual'
			},
			{
				schedule_id: SCHED,
				student_id: STU,
				preceptor_id: PREC,
				clerkship_id: CLERK,
				date: '2025-06-09',
				source: 'manual'
			}
		]);
		const statuses = await getStudentStatuses(db, SCHED, '2025-01-01');
		const student = statuses.find((s) => s.student_id === STU)!;
		const med = student.per_clerkship.find((c) => c.clerkship_id === CLERK)!;
		expect(med.scheduled).toBe(3); // clerkship total counts all days
		const cardio = med.electives.find((e) => e.elective_id === ELECTIVE)!;
		expect(cardio.required).toBe(5);
		expect(cardio.scheduled).toBe(2); // only elective-tagged days
		expect(cardio.unscheduled).toBe(3);
	});
});

describe('Phase 1b — single-validator edits and lock semantics', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db);
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('reassign runs the single validator and keeps a clean move valid (P-03)', async () => {
		const [a1] = await insertAssignments(db, [
			{
				schedule_id: SCHED,
				student_id: STU,
				preceptor_id: PREC,
				clerkship_id: CLERK,
				date: '2025-06-10',
				source: 'manual'
			}
		]);
		// Reassigning to another in-schedule preceptor (no date change) is valid;
		// past_date is surfaced as a soft warning, not a block (calendar path).
		const ok = await reassignToPreceptor(db, a1.id as string, PREC2, false, {
			today: '2025-01-01'
		});
		expect(ok.valid).toBe(true);
		expect(ok.assignment?.preceptor_id).toBe(PREC2);
	});

	it('a human may move a locked assignment; the edit path does not check locked (P-08)', async () => {
		const [locked] = await insertAssignments(db, [
			{
				schedule_id: SCHED,
				student_id: STU,
				preceptor_id: PREC,
				clerkship_id: CLERK,
				date: '2025-06-12',
				source: 'generated',
				locked: true
			}
		]);
		const res = await updateAssignmentChecked(
			db,
			locked.id as string,
			{ date: '2025-06-13' },
			{ force: true }
		);
		expect(res.valid).toBe(true);
		if (res.valid) expect(res.assignment?.date).toBe('2025-06-13');
	});
});
