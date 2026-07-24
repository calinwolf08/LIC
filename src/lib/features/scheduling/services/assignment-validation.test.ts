import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import {
	validateAssignmentCandidate,
	validateCandidateWithContext,
	type ValidationContext
} from './assignment-validation';
import {
	createManualAssignment,
	createManualAssignmentsBulk,
	setAssignmentLock
} from '$lib/features/schedules/services/assignment-service';

const SCHEDULE = 'sched-1';
const STUDENT = 'stu-1';
const STUDENT2 = 'stu-2';
const PRECEPTOR = 'prec-1';
const CLERKSHIP = 'clerk-1';

async function seed(db: Kysely<DB>) {
	const ts = new Date().toISOString();
	await db
		.insertInto('scheduling_periods')
		.values({
			id: SCHEDULE,
			name: 'Test',
			start_date: '2025-01-01',
			end_date: '2025-12-31',
			created_at: ts,
			updated_at: ts
		})
		.execute();
	await db
		.insertInto('students')
		.values([
			{ id: STUDENT, name: 'A', email: 'a@x.com', created_at: ts, updated_at: ts },
			{ id: STUDENT2, name: 'B', email: 'b@x.com', created_at: ts, updated_at: ts }
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
			name: 'Medicine',
			clerkship_type: 'outpatient',
			required_days: 10,
			created_at: ts,
			updated_at: ts
		})
		.execute();
}

const base = { student_id: STUDENT, preceptor_id: PRECEPTOR, clerkship_id: CLERKSHIP };

describe('validateAssignmentCandidate (DB-backed)', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db);
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('accepts a clean candidate', async () => {
		const r = await validateAssignmentCandidate(db, SCHEDULE, { ...base, date: '2025-03-03' });
		expect(r.valid).toBe(true);
		expect(r.hard).toHaveLength(0);
		expect(r.soft).toHaveLength(0);
	});

	it('flags missing entities as hard', async () => {
		const r = await validateAssignmentCandidate(db, SCHEDULE, {
			...base,
			student_id: 'nope',
			date: '2025-03-03'
		});
		expect(r.valid).toBe(false);
		expect(r.hard.some((v) => v.code === 'entity_missing')).toBe(true);
	});

	it('flags student double-booking as hard', async () => {
		await createManualAssignment(db, SCHEDULE, { ...base, date: '2025-03-03' });
		const r = await validateAssignmentCandidate(db, SCHEDULE, { ...base, date: '2025-03-03' });
		expect(r.valid).toBe(false);
		expect(r.hard.some((v) => v.code === 'student_double_booked')).toBe(true);
	});

	it('flags a blackout date as soft', async () => {
		await db
			.insertInto('blackout_dates')
			.values({ id: 'bo-1', date: '2025-03-04', created_at: new Date().toISOString() })
			.execute();
		const r = await validateAssignmentCandidate(db, SCHEDULE, { ...base, date: '2025-03-04' });
		expect(r.valid).toBe(true);
		expect(r.soft.some((v) => v.code === 'blackout_date')).toBe(true);
	});

	it('flags a date outside the schedule range as soft', async () => {
		const r = await validateAssignmentCandidate(db, SCHEDULE, { ...base, date: '2030-01-01' });
		expect(r.soft.some((v) => v.code === 'outside_schedule')).toBe(true);
	});

	it('flags preceptor capacity as soft (different student, same slot)', async () => {
		await createManualAssignment(db, SCHEDULE, { ...base, date: '2025-03-05' });
		const r = await validateAssignmentCandidate(db, SCHEDULE, {
			student_id: STUDENT2,
			preceptor_id: PRECEPTOR,
			clerkship_id: CLERKSHIP,
			date: '2025-03-05'
		});
		expect(r.soft.some((v) => v.code === 'preceptor_capacity')).toBe(true);
	});
});

describe('createManualAssignment', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db);
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('creates a clean assignment with source=manual', async () => {
		const r = await createManualAssignment(db, SCHEDULE, { ...base, date: '2025-03-03' });
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.assignment.source).toBe('manual');
			expect(r.assignment.locked).toBe(0);
			expect(r.warnings).toHaveLength(0);
		}
	});

	it('rejects a hard conflict even with force', async () => {
		await createManualAssignment(db, SCHEDULE, { ...base, date: '2025-03-03' });
		const r = await createManualAssignment(
			db,
			SCHEDULE,
			{ ...base, date: '2025-03-03' },
			{ force: true }
		);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.hard.some((v) => v.code === 'student_double_booked')).toBe(true);
	});

	it('rejects a soft violation without force', async () => {
		const r = await createManualAssignment(db, SCHEDULE, { ...base, date: '2030-01-01' });
		expect(r.ok).toBe(false);
	});

	it('creates a soft-violating assignment with force and returns warnings', async () => {
		const r = await createManualAssignment(
			db,
			SCHEDULE,
			{ ...base, date: '2030-01-01' },
			{ force: true }
		);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.warnings.some((v) => v.code === 'outside_schedule')).toBe(true);
	});

	it('respects the locked flag', async () => {
		const r = await createManualAssignment(db, SCHEDULE, {
			...base,
			date: '2025-03-03',
			locked: true
		});
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.assignment.locked).toBe(1);
	});
});

describe('createManualAssignmentsBulk', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db);
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('creates one assignment per in-range weekday', async () => {
		// 2025-03-03 is a Monday; Mon/Wed/Fri over one week.
		const r = await createManualAssignmentsBulk(db, SCHEDULE, {
			...base,
			start_date: '2025-03-03',
			end_date: '2025-03-09',
			weekdays: [1, 3, 5]
		});
		expect(r.createdCount).toBe(3);
		expect(r.results.filter((x) => x.created)).toHaveLength(3);
	});

	it('skips dates the student is already booked (hard conflict)', async () => {
		await createManualAssignment(db, SCHEDULE, { ...base, date: '2025-03-03' });
		const r = await createManualAssignmentsBulk(db, SCHEDULE, {
			...base,
			start_date: '2025-03-03',
			end_date: '2025-03-05'
		});
		const conflict = r.results.find((x) => x.date === '2025-03-03');
		expect(conflict?.created).toBe(false);
		expect(conflict?.skipped).toBe('hard_conflict');
	});
});

describe('setAssignmentLock', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db);
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('toggles the lock flag', async () => {
		const created = await createManualAssignment(db, SCHEDULE, { ...base, date: '2025-03-03' });
		if (!created.ok) throw new Error('setup failed');
		const locked = await setAssignmentLock(db, created.assignment.id!, true);
		expect(locked.locked).toBe(1);
		const unlocked = await setAssignmentLock(db, created.assignment.id!, false);
		expect(unlocked.locked).toBe(0);
	});
});

describe('validateCandidateWithContext (pure, for Step 10)', () => {
	function ctx(overrides: Partial<ValidationContext> = {}): ValidationContext {
		return {
			scheduleStart: '2025-01-01',
			scheduleEnd: '2025-12-31',
			preceptorMaxStudents: new Map([[PRECEPTOR, 1]]),
			preceptorUnavailable: new Map(),
			preceptorHealthSystem: new Map(),
			clerkshipSites: new Map(),
			studentOnboarded: new Map(),
			blackoutDates: new Set(),
			existingStudentIds: new Set([STUDENT, STUDENT2]),
			existingPreceptorIds: new Set([PRECEPTOR]),
			existingClerkshipIds: new Set([CLERKSHIP]),
			...overrides
		};
	}

	it('accepts a clean candidate', () => {
		const r = validateCandidateWithContext({ ...base, date: '2025-03-03' }, ctx(), new Map());
		expect(r.valid).toBe(true);
		expect(r.soft).toHaveLength(0);
	});

	it('detects double-booking from the existing map (hard)', () => {
		const existing = new Map([[`${STUDENT}:2025-03-03`, 'other-assignment']]);
		const r = validateCandidateWithContext({ ...base, date: '2025-03-03' }, ctx(), existing);
		expect(r.valid).toBe(false);
		expect(r.hard.some((v) => v.code === 'student_double_booked')).toBe(true);
	});

	it('flags blackout + outside-range as soft', () => {
		const r = validateCandidateWithContext(
			{ ...base, date: '2030-06-06' },
			ctx({ blackoutDates: new Set(['2030-06-06']) }),
			new Map()
		);
		expect(r.soft.some((v) => v.code === 'blackout_date')).toBe(true);
		expect(r.soft.some((v) => v.code === 'outside_schedule')).toBe(true);
	});

	it('flags preceptor_unavailable from the context', () => {
		const r = validateCandidateWithContext(
			{ ...base, date: '2025-03-03' },
			ctx({ preceptorUnavailable: new Map([[PRECEPTOR, new Set(['2025-03-03'])]]) }),
			new Map()
		);
		expect(r.soft.some((v) => v.code === 'preceptor_unavailable')).toBe(true);
	});

	it('flags site_not_allowed only when an allowlist exists and excludes the site', () => {
		const withSite = { ...base, site_id: 'site-x', date: '2025-03-03' };
		// Empty allowlist → no restriction
		expect(
			validateCandidateWithContext(withSite, ctx(), new Map()).soft.some(
				(v) => v.code === 'site_not_allowed'
			)
		).toBe(false);
		// Allowlist excludes the site → violation
		expect(
			validateCandidateWithContext(
				withSite,
				ctx({ clerkshipSites: new Map([[CLERKSHIP, new Set(['site-y'])]]) }),
				new Map()
			).soft.some((v) => v.code === 'site_not_allowed')
		).toBe(true);
		// Allowlist includes the site → no violation
		expect(
			validateCandidateWithContext(
				withSite,
				ctx({ clerkshipSites: new Map([[CLERKSHIP, new Set(['site-x'])]]) }),
				new Map()
			).soft.some((v) => v.code === 'site_not_allowed')
		).toBe(false);
	});

	it('flags not_onboarded unless the student is onboarded to the preceptor health system', () => {
		const withHs = ctx({ preceptorHealthSystem: new Map([[PRECEPTOR, 'hs-1']]) });
		// Not onboarded → violation
		expect(
			validateCandidateWithContext({ ...base, date: '2025-03-03' }, withHs, new Map()).soft.some(
				(v) => v.code === 'not_onboarded'
			)
		).toBe(true);
		// Onboarded → no violation
		expect(
			validateCandidateWithContext(
				{ ...base, date: '2025-03-03' },
				ctx({
					preceptorHealthSystem: new Map([[PRECEPTOR, 'hs-1']]),
					studentOnboarded: new Map([[STUDENT, new Set(['hs-1'])]])
				}),
				new Map()
			).soft.some((v) => v.code === 'not_onboarded')
		).toBe(false);
	});

	it('treats entity_missing as hard and short-circuits other checks', () => {
		const r = validateCandidateWithContext(
			{ ...base, preceptor_id: 'ghost', date: '2030-01-01' },
			ctx(),
			new Map()
		);
		expect(r.valid).toBe(false);
		expect(r.hard.some((v) => v.code === 'entity_missing')).toBe(true);
		// outside_schedule not evaluated because entity check short-circuits
		expect(r.soft).toHaveLength(0);
	});

	it('excludeId prevents an assignment from double-booking itself', () => {
		const existing = new Map([[`${STUDENT}:2025-03-03`, 'self']]);
		const r = validateCandidateWithContext(
			{ ...base, date: '2025-03-03', excludeId: 'self' },
			ctx(),
			existing
		);
		expect(r.hard.some((v) => v.code === 'student_double_booked')).toBe(false);
	});

	it('boundary dates at schedule start/end are in range', () => {
		expect(
			validateCandidateWithContext({ ...base, date: '2025-01-01' }, ctx(), new Map()).soft.some(
				(v) => v.code === 'outside_schedule'
			)
		).toBe(false);
		expect(
			validateCandidateWithContext({ ...base, date: '2025-12-31' }, ctx(), new Map()).soft.some(
				(v) => v.code === 'outside_schedule'
			)
		).toBe(false);
		expect(
			validateCandidateWithContext({ ...base, date: '2024-12-31' }, ctx(), new Map()).soft.some(
				(v) => v.code === 'outside_schedule'
			)
		).toBe(true);
	});
});

describe('validateAssignmentCandidate — edge cases (DB-backed)', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db);
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('does not flag capacity when exactly at max (only when over)', async () => {
		// max_students = 1. One existing assignment on the date fills capacity for
		// a *different* student, so the next candidate is at/over → flagged.
		await createManualAssignment(db, SCHEDULE, { ...base, date: '2025-03-05' });
		const atLimit = await validateAssignmentCandidate(db, SCHEDULE, {
			student_id: STUDENT2,
			preceptor_id: PRECEPTOR,
			clerkship_id: CLERKSHIP,
			date: '2025-03-05'
		});
		expect(atLimit.soft.some((v) => v.code === 'preceptor_capacity')).toBe(true);

		// A fresh date with no existing assignment is under capacity → not flagged.
		const under = await validateAssignmentCandidate(db, SCHEDULE, {
			student_id: STUDENT2,
			preceptor_id: PRECEPTOR,
			clerkship_id: CLERKSHIP,
			date: '2025-03-06'
		});
		expect(under.soft.some((v) => v.code === 'preceptor_capacity')).toBe(false);
	});

	it('excludeId lets an edit re-validate its own slot without capacity/self conflicts', async () => {
		const created = await createManualAssignment(db, SCHEDULE, { ...base, date: '2025-03-07' });
		if (!created.ok) throw new Error('setup');
		const r = await validateAssignmentCandidate(db, SCHEDULE, {
			...base,
			date: '2025-03-07',
			excludeId: created.assignment.id!
		});
		expect(r.hard.some((v) => v.code === 'student_double_booked')).toBe(false);
		expect(r.soft.some((v) => v.code === 'preceptor_capacity')).toBe(false);
	});

	it('flags not_onboarded when an onboarding row exists but is incomplete', async () => {
		const ts = new Date().toISOString();
		await db
			.insertInto('health_systems')
			.values({ id: 'hs-1', name: 'HS', created_at: ts, updated_at: ts })
			.execute();
		await db
			.updateTable('preceptors')
			.set({ health_system_id: 'hs-1' })
			.where('id', '=', PRECEPTOR)
			.execute();
		await db
			.insertInto('student_health_system_onboarding')
			.values({
				id: 'ob',
				student_id: STUDENT,
				health_system_id: 'hs-1',
				is_completed: 0,
				created_at: ts,
				updated_at: ts
			})
			.execute();
		const r = await validateAssignmentCandidate(db, SCHEDULE, { ...base, date: '2025-03-03' });
		expect(r.soft.some((v) => v.code === 'not_onboarded')).toBe(true);
	});

	it('accumulates multiple soft violations at once', async () => {
		const ts = new Date().toISOString();
		await db
			.insertInto('blackout_dates')
			.values({ id: 'bo', date: '2030-06-06', created_at: ts })
			.execute();
		// Out of range + blackout together.
		const r = await validateAssignmentCandidate(db, SCHEDULE, { ...base, date: '2030-06-06' });
		expect(r.soft.map((v) => v.code).sort()).toEqual(
			expect.arrayContaining(['blackout_date', 'outside_schedule'])
		);
	});
});
