/**
 * Step 17 — override persistence, review listing, side effects and past-date
 * protection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import {
	createManualAssignment,
	createManualAssignmentsBulk,
	applyOverrideSideEffects,
	listOverrides,
	groupOverrides,
	parseCodes,
	deleteAssignment,
	getAssignmentById
} from './assignment-service';

const SCHEDULE = 'sched-1';
const STUDENT = 'stu-1';
const STUDENT2 = 'stu-2';
const PRECEPTOR = 'prec-1';
const CLERKSHIP = 'clerk-1';
const SITE = 'site-1';

const RANGE_START = '2030-01-01';
const RANGE_END = '2030-12-31';
const TODAY = '2030-03-10';
const FUTURE = '2030-03-20';
const PAST = '2030-03-01';

const base = { student_id: STUDENT, preceptor_id: PRECEPTOR, clerkship_id: CLERKSHIP };

async function seed(db: Kysely<DB>) {
	const ts = new Date().toISOString();
	await db
		.insertInto('scheduling_periods')
		.values({
			id: SCHEDULE,
			name: 'Test',
			start_date: RANGE_START,
			end_date: RANGE_END,
			created_at: ts,
			updated_at: ts
		})
		.execute();
	await db
		.insertInto('health_systems')
		.values({ id: 'hs-1', name: 'Metro Health', created_at: ts, updated_at: ts })
		.execute();
	await db
		.insertInto('sites')
		.values({ id: SITE, name: 'North', health_system_id: 'hs-1', created_at: ts, updated_at: ts })
		.execute();
	await db
		.insertInto('students')
		.values([
			{ id: STUDENT, name: 'Alice', email: 'a@x.com', created_at: ts, updated_at: ts },
			{ id: STUDENT2, name: 'Bob', email: 'b@x.com', created_at: ts, updated_at: ts }
		])
		.execute();
	await db
		.insertInto('schedule_students')
		.values([
			{ id: 'ss-1', schedule_id: SCHEDULE, student_id: STUDENT, created_at: ts },
			{ id: 'ss-2', schedule_id: SCHEDULE, student_id: STUDENT2, created_at: ts }
		])
		.execute();
	await db
		.insertInto('preceptors')
		.values({
			id: PRECEPTOR,
			name: 'Dr P',
			email: 'p@x.com',
			max_students: 1,
			created_at: ts,
			updated_at: ts
		})
		.execute();
	await db
		.insertInto('clerkships')
		.values({
			id: CLERKSHIP,
			name: 'Pediatrics',
			clerkship_type: 'outpatient',
			required_days: 2,
			created_at: ts,
			updated_at: ts
		})
		.execute();
}

describe('override persistence on create', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db);
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('stores no override codes for a clean assignment', async () => {
		const r = await createManualAssignment(
			db,
			SCHEDULE,
			{ ...base, date: FUTURE },
			{ today: TODAY }
		);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(parseCodes(r.assignment.override_codes)).toEqual([]);
			expect(r.assignment.override_note).toBeNull();
		}
	});

	it('rejects a past date unless the code is accepted', async () => {
		const blocked = await createManualAssignment(
			db,
			SCHEDULE,
			{ ...base, date: PAST },
			{ today: TODAY }
		);
		expect(blocked.ok).toBe(false);
		if (!blocked.ok) expect(blocked.soft.some((v) => v.code === 'past_date')).toBe(true);
	});

	it('persists the accepted codes and the note', async () => {
		const r = await createManualAssignment(
			db,
			SCHEDULE,
			{
				...base,
				date: PAST,
				override_codes: ['past_date'],
				override_note: 'Student attended, recorded late'
			},
			{ today: TODAY }
		);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(parseCodes(r.assignment.override_codes)).toEqual(['past_date']);
			expect(r.assignment.override_note).toBe('Student attended, recorded late');
		}
	});

	it('only persists codes that were actually triggered', async () => {
		const r = await createManualAssignment(
			db,
			SCHEDULE,
			{
				...base,
				date: FUTURE,
				override_codes: ['past_date', 'blackout_date'],
				override_note: 'n/a'
			},
			{ today: TODAY }
		);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(parseCodes(r.assignment.override_codes)).toEqual([]);
			// No override happened, so no note is kept either.
			expect(r.assignment.override_note).toBeNull();
		}
	});

	it('still rejects when only some of the triggered codes were accepted', async () => {
		const ts = new Date().toISOString();
		await db
			.insertInto('blackout_dates')
			.values({ id: 'bo-1', schedule_id: SCHEDULE, date: PAST, created_at: ts })
			.execute();
		const r = await createManualAssignment(
			db,
			SCHEDULE,
			{ ...base, date: PAST, override_codes: ['past_date'] },
			{ today: TODAY }
		);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.soft.some((v) => v.code === 'blackout_date')).toBe(true);
	});

	it('flags over_required_days once the requirement is met', async () => {
		// required_days = 2
		await createManualAssignment(db, SCHEDULE, { ...base, date: '2030-03-20' }, { today: TODAY });
		await createManualAssignment(db, SCHEDULE, { ...base, date: '2030-03-21' }, { today: TODAY });
		const third = await createManualAssignment(
			db,
			SCHEDULE,
			{ ...base, date: '2030-03-22' },
			{ today: TODAY }
		);
		expect(third.ok).toBe(false);
		if (!third.ok) expect(third.soft.some((v) => v.code === 'over_required_days')).toBe(true);

		const accepted = await createManualAssignment(
			db,
			SCHEDULE,
			{ ...base, date: '2030-03-22', override_codes: ['over_required_days'] },
			{ today: TODAY }
		);
		expect(accepted.ok).toBe(true);
	});
});

describe('createManualAssignmentsBulk with an explicit day list', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db);
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('creates exactly the listed days', async () => {
		const r = await createManualAssignmentsBulk(
			db,
			SCHEDULE,
			{ ...base, dates: ['2030-03-20', '2030-03-25'], override_codes: ['over_required_days'] },
			{ today: TODAY }
		);
		expect(r.createdCount).toBe(2);
		expect(r.results.map((x) => x.date)).toEqual(['2030-03-20', '2030-03-25']);
	});

	it('de-duplicates and sorts the list', async () => {
		const r = await createManualAssignmentsBulk(
			db,
			SCHEDULE,
			{
				...base,
				dates: ['2030-03-25', '2030-03-20', '2030-03-25'],
				override_codes: ['over_required_days']
			},
			{ today: TODAY }
		);
		expect(r.results.map((x) => x.date)).toEqual(['2030-03-20', '2030-03-25']);
	});

	it('applies the accepted codes to every created day', async () => {
		await createManualAssignmentsBulk(
			db,
			SCHEDULE,
			{
				...base,
				dates: [PAST, '2030-03-02'],
				override_codes: ['past_date'],
				override_note: 'late'
			},
			{ today: TODAY }
		);
		const rows = await db.selectFrom('schedule_assignments').selectAll().execute();
		expect(rows).toHaveLength(2);
		expect(rows.every((r) => parseCodes(r.override_codes).includes('past_date'))).toBe(true);
	});

	it('still honours the range form when no dates are given', async () => {
		const r = await createManualAssignmentsBulk(
			db,
			SCHEDULE,
			{
				...base,
				start_date: '2030-03-20',
				end_date: '2030-03-22',
				override_codes: ['over_required_days']
			},
			{ today: TODAY }
		);
		expect(r.createdCount).toBe(3);
	});
});

describe('listOverrides', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db);
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('returns only overridden rows, with names attached', async () => {
		await createManualAssignment(db, SCHEDULE, { ...base, date: FUTURE }, { today: TODAY });
		await createManualAssignment(
			db,
			SCHEDULE,
			{ ...base, date: PAST, override_codes: ['past_date'], override_note: 'recorded late' },
			{ today: TODAY }
		);

		const overrides = await listOverrides(db, SCHEDULE);
		expect(overrides).toHaveLength(1);
		expect(overrides[0]).toMatchObject({
			date: PAST,
			studentName: 'Alice',
			clerkshipName: 'Pediatrics',
			preceptorName: 'Dr P',
			codes: ['past_date'],
			note: 'recorded late'
		});
	});

	it('does not leak overrides from another schedule', async () => {
		await createManualAssignment(
			db,
			SCHEDULE,
			{ ...base, date: PAST, override_codes: ['past_date'] },
			{ today: TODAY }
		);
		expect(await listOverrides(db, 'someone-elses-schedule')).toEqual([]);
	});
});

describe('parseCodes', () => {
	it('handles null, malformed JSON and non-arrays', () => {
		expect(parseCodes(null)).toEqual([]);
		expect(parseCodes('')).toEqual([]);
		expect(parseCodes('not json')).toEqual([]);
		expect(parseCodes('{"a":1}')).toEqual([]);
		expect(parseCodes('["past_date", 3]')).toEqual(['past_date']);
	});
});

describe('applyOverrideSideEffects', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db);
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('bump_preceptor_capacity raises max_students and touches nothing else', async () => {
		await applyOverrideSideEffects(db, [
			{ kind: 'bump_preceptor_capacity', preceptor_id: PRECEPTOR }
		]);
		const p = await db
			.selectFrom('preceptors')
			.selectAll()
			.where('id', '=', PRECEPTOR)
			.executeTakeFirst();
		expect(p?.max_students).toBe(2);
		expect(await db.selectFrom('preceptor_availability').selectAll().execute()).toEqual([]);
		expect(await db.selectFrom('schedule_assignments').selectAll().execute()).toEqual([]);
	});

	it('mark_preceptor_available inserts availability rows for the named dates only', async () => {
		await applyOverrideSideEffects(db, [
			{
				kind: 'mark_preceptor_available',
				preceptor_id: PRECEPTOR,
				site_id: SITE,
				dates: [FUTURE, '2030-03-21']
			}
		]);
		const rows = await db
			.selectFrom('preceptor_availability')
			.selectAll()
			.orderBy('date')
			.execute();
		expect(rows.map((r) => r.date)).toEqual([FUTURE, '2030-03-21']);
		expect(rows.every((r) => r.is_available === 1)).toBe(true);
	});

	it('mark_preceptor_available flips an existing unavailable row rather than duplicating it', async () => {
		const ts = new Date().toISOString();
		await db
			.insertInto('preceptor_availability')
			.values({
				id: 'av-1',
				preceptor_id: PRECEPTOR,
				site_id: SITE,
				date: FUTURE,
				is_available: 0,
				created_at: ts,
				updated_at: ts
			})
			.execute();

		await applyOverrideSideEffects(db, [
			{ kind: 'mark_preceptor_available', preceptor_id: PRECEPTOR, site_id: SITE, dates: [FUTURE] }
		]);

		const rows = await db.selectFrom('preceptor_availability').selectAll().execute();
		expect(rows).toHaveLength(1);
		expect(rows[0].is_available).toBe(1);
	});

	it('remove_conflicting_assignment deletes exactly that assignment', async () => {
		const keep = await createManualAssignment(
			db,
			SCHEDULE,
			{ ...base, date: FUTURE },
			{ today: TODAY }
		);
		const drop = await createManualAssignment(
			db,
			SCHEDULE,
			{ ...base, student_id: STUDENT2, date: FUTURE, override_codes: ['preceptor_capacity'] },
			{ today: TODAY }
		);
		if (!keep.ok || !drop.ok) throw new Error('setup failed');

		await applyOverrideSideEffects(db, [
			{ kind: 'remove_conflicting_assignment', assignment_id: drop.assignment.id! }
		]);

		expect(await getAssignmentById(db, drop.assignment.id!)).toBeNull();
		expect(await getAssignmentById(db, keep.assignment.id!)).not.toBeNull();
	});

	it('rolls the whole transaction back when a side effect fails', async () => {
		await expect(
			db.transaction().execute(async (trx) => {
				await applyOverrideSideEffects(trx, [
					{ kind: 'bump_preceptor_capacity', preceptor_id: PRECEPTOR },
					{ kind: 'remove_conflicting_assignment', assignment_id: 'does-not-exist' }
				]);
			})
		).rejects.toThrow();

		const p = await db
			.selectFrom('preceptors')
			.selectAll()
			.where('id', '=', PRECEPTOR)
			.executeTakeFirst();
		expect(p?.max_students).toBe(1);
	});
});

describe('past-dated deletion', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db);
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	async function pastAssignmentId(): Promise<string> {
		const ts = new Date().toISOString();
		// Insert directly so we are not fighting create-time validation here.
		await db
			.insertInto('schedule_assignments')
			.values({
				id: 'past-1',
				student_id: STUDENT,
				preceptor_id: PRECEPTOR,
				clerkship_id: CLERKSHIP,
				date: '2020-01-02',
				status: 'scheduled',
				created_at: ts,
				updated_at: ts
			})
			.execute();
		return 'past-1';
	}

	it('is blocked without force', async () => {
		const id = await pastAssignmentId();
		await expect(deleteAssignment(db, id)).rejects.toThrow(/past/i);
		expect(await getAssignmentById(db, id)).not.toBeNull();
	});

	it('succeeds with force', async () => {
		const id = await pastAssignmentId();
		await deleteAssignment(db, id, true);
		expect(await getAssignmentById(db, id)).toBeNull();
	});
});

describe('listOverrides — active/resolved re-evaluation', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db);
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	async function insertAssignment(
		id: string,
		studentId: string,
		date: string,
		codes: string[],
		preceptorId = PRECEPTOR
	) {
		const ts = new Date().toISOString();
		await db
			.insertInto('schedule_assignments')
			.values({
				id,
				student_id: studentId,
				preceptor_id: preceptorId,
				clerkship_id: CLERKSHIP,
				site_id: SITE,
				date,
				override_codes: JSON.stringify(codes),
				status: 'scheduled',
				created_at: ts,
				updated_at: ts
			})
			.execute();
	}

	it('marks not_onboarded resolved once the student has onboarded', async () => {
		await db
			.updateTable('preceptors')
			.set({ health_system_id: 'hs-1' })
			.where('id', '=', PRECEPTOR)
			.execute();
		await insertAssignment('a1', STUDENT, FUTURE, ['not_onboarded']);

		const active = await listOverrides(db, SCHEDULE);
		expect(active).toHaveLength(1);
		expect(active[0].status).toBe('active');

		// Onboard the student → the exception no longer applies.
		const ts = new Date().toISOString();
		await db
			.insertInto('student_health_system_onboarding')
			.values({
				id: 'onb1',
				student_id: STUDENT,
				health_system_id: 'hs-1',
				is_completed: 1,
				created_at: ts,
				updated_at: ts
			})
			.execute();

		expect(await listOverrides(db, SCHEDULE)).toHaveLength(0);
		const withResolved = await listOverrides(db, SCHEDULE, { includeResolved: true });
		expect(withResolved).toHaveLength(1);
		expect(withResolved[0].status).toBe('resolved');
	});

	it('flips a capacity override to resolved when max_students is raised', async () => {
		await insertAssignment('a1', STUDENT, FUTURE, ['preceptor_capacity']);
		await insertAssignment('a2', STUDENT2, FUTURE, ['preceptor_capacity']);

		expect(await listOverrides(db, SCHEDULE)).toHaveLength(2);
		expect((await listOverrides(db, SCHEDULE)).every((o) => o.status === 'active')).toBe(true);

		await db
			.updateTable('preceptors')
			.set({ max_students: 2 })
			.where('id', '=', PRECEPTOR)
			.execute();

		expect(await listOverrides(db, SCHEDULE)).toHaveLength(0);
		expect(await listOverrides(db, SCHEDULE, { includeResolved: true })).toHaveLength(2);
	});

	it('keeps a non-re-evaluable code (past_date) active', async () => {
		await insertAssignment('a1', STUDENT, PAST, ['past_date']);
		const active = await listOverrides(db, SCHEDULE);
		expect(active).toHaveLength(1);
		expect(active[0].status).toBe('active');
	});
});

describe('groupOverrides', () => {
	const rec = (date: string, over: Partial<Parameters<typeof groupOverrides>[0][number]> = {}) => ({
		assignmentId: `a-${date}`,
		date,
		studentId: 's1',
		studentName: 'Alice',
		clerkshipId: 'c1',
		clerkshipName: 'Peds',
		preceptorId: 'p1',
		preceptorName: 'Dr P',
		codes: ['preceptor_capacity'],
		note: null,
		createdAt: '',
		status: 'active' as const,
		...over
	});

	it('collapses four consecutive days into one row', () => {
		const groups = groupOverrides(
			['2030-03-03', '2030-03-04', '2030-03-05', '2030-03-06'].map((d) => rec(d))
		);
		expect(groups).toHaveLength(1);
		expect(groups[0].days).toBe(4);
		expect(groups[0].startDate).toBe('2030-03-03');
		expect(groups[0].endDate).toBe('2030-03-06');
		expect(groups[0].assignmentIds).toHaveLength(4);
	});

	it('does not merge across different codes or preceptors', () => {
		const groups = groupOverrides([
			rec('2030-03-03'),
			rec('2030-03-04', { codes: ['blackout_date'] }),
			rec('2030-03-05', { preceptorId: 'p2' })
		]);
		expect(groups).toHaveLength(3);
	});

	it('splits a non-consecutive gap into separate rows', () => {
		const groups = groupOverrides([rec('2030-03-03'), rec('2030-03-05')]);
		expect(groups).toHaveLength(2);
	});
});
