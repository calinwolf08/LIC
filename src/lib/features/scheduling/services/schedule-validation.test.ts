import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import {
	validateSchedule,
	loadValidationInputs,
	evaluateAssignments,
	type ValidationInputs,
	type ValidationAssignment
} from './schedule-validation';
import type { ValidationContext } from './assignment-validation';
import { getSetupChecklist } from './readiness';
import { mutualExclusionKey } from './mutual-exclusion';

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
			.values({ id: 'bo', schedule_id: SCHED, date: '2025-03-04', created_at: new Date().toISOString() })
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
		// ONE finding for the over-subscribed preceptor-day, referencing both
		// assignments — not one finding per assignment.
		expect(r.counts['preceptor_capacity']).toBe(1);
		const cap = r.byPreceptor[PREC]?.filter((v) => v.code === 'preceptor_capacity') ?? [];
		expect(cap).toHaveLength(1);
		expect(cap[0].assignment_ids.sort()).toEqual(['a1', 'a2']);
		expect(r.byDate['2025-03-03']?.some((v) => v.code === 'preceptor_capacity')).toBe(true);
		// The top-level pill (violations.length) equals the sum of the by-code counts.
		expect(r.violations.length).toBe(
			Object.values(r.counts).reduce((a, b) => a + b, 0)
		);
	});

	it('emits one capacity finding per day (four double-booked days ⇒ 4, not 8)', async () => {
		const ts = new Date().toISOString();
		await db
			.insertInto('students')
			.values({ id: 'stu-2', name: 'Bob', email: 'b@x.com', created_at: ts, updated_at: ts })
			.execute();
		await db
			.insertInto('schedule_students')
			.values({ id: 'ss2', schedule_id: SCHED, student_id: 'stu-2', created_at: ts })
			.execute();
		await db
			.insertInto('student_health_system_onboarding')
			.values({ id: 'ob2', student_id: 'stu-2', health_system_id: HS, is_completed: 1, created_at: ts, updated_at: ts })
			.execute();

		const days = ['2025-03-03', '2025-03-04', '2025-03-05', '2025-03-06'];
		let n = 0;
		for (const d of days) {
			await addAssignment(db, `a${n++}`, d);
			await db
				.insertInto('schedule_assignments')
				.values({
					id: `b${n++}`,
					student_id: 'stu-2',
					preceptor_id: PREC,
					clerkship_id: CLERK,
					date: d,
					status: 'scheduled',
					created_at: ts,
					updated_at: ts
				})
				.execute();
		}

		const r = await validateSchedule(db, SCHED);
		expect(r.counts['preceptor_capacity']).toBe(4);
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

	// --- session_clash (L1: half-day sessions) -----------------------------
	const PREC2 = 'prec-2';
	async function onboardAndAddSecondPreceptor(db: Kysely<DB>) {
		const ts = new Date().toISOString();
		await db
			.insertInto('student_health_system_onboarding')
			.values({
				id: 'ob',
				student_id: STU,
				health_system_id: HS,
				is_completed: 1,
				created_at: ts,
				updated_at: ts
			})
			.execute();
		await db
			.insertInto('preceptors')
			.values({
				id: PREC2,
				name: 'P2',
				email: 'p2@x.com',
				max_students: 1,
				health_system_id: HS,
				created_at: ts,
				updated_at: ts
			})
			.execute();
		await db
			.insertInto('schedule_preceptors')
			.values({ id: 'sp2', schedule_id: SCHED, preceptor_id: PREC2, created_at: ts })
			.execute();
	}
	async function addAssignmentX(
		db: Kysely<DB>,
		id: string,
		date: string,
		preceptorId: string,
		session: string
	) {
		const ts = new Date().toISOString();
		await db
			.insertInto('schedule_assignments')
			.values({
				id,
				student_id: STU,
				preceptor_id: preceptorId,
				clerkship_id: CLERK,
				date,
				status: 'scheduled',
				session,
				created_at: ts,
				updated_at: ts
			})
			.execute();
	}

	it('flags one session_clash per clashing student-day, referencing every day', async () => {
		await onboardAndAddSecondPreceptor(db);
		// Two full days on one date (distinct preceptors, so capacity does not fire).
		await addAssignmentX(db, 'a1', '2025-03-03', PREC, 'full');
		await addAssignmentX(db, 'a2', '2025-03-03', PREC2, 'full');
		const r = await validateSchedule(db, SCHED);
		expect(r.counts['session_clash']).toBe(1);
		const finding = r.byStudent[STU]?.find((v) => v.code === 'session_clash');
		expect(finding?.assignment_ids.slice().sort()).toEqual(['a1', 'a2']);
		expect(r.byDate['2025-03-03']?.some((v) => v.code === 'session_clash')).toBe(true);
	});

	it('does not flag a morning + afternoon on the same day (AM + PM)', async () => {
		await onboardAndAddSecondPreceptor(db);
		await addAssignmentX(db, 'a1', '2025-03-03', PREC, 'am');
		await addAssignmentX(db, 'a2', '2025-03-03', PREC2, 'pm');
		const r = await validateSchedule(db, SCHED);
		expect(r.counts['session_clash']).toBeUndefined();
	});

	// --- mutual_exclusion (L2) ---------------------------------------------
	async function addMutualExclusion(db: Kysely<DB>, x: string, y: string) {
		const [a, b] = x <= y ? [x, y] : [y, x];
		await db
			.insertInto('preceptor_mutual_exclusions')
			.values({ id: `me-${a}-${b}`, preceptor_a_id: a, preceptor_b_id: b, created_at: new Date().toISOString() })
			.execute();
	}

	it('flags mutual_exclusion when two excluded preceptors share a student-day', async () => {
		await onboardAndAddSecondPreceptor(db);
		// AM + PM so there is no session clash; the two preceptors are mutually exclusive.
		await addAssignmentX(db, 'a1', '2025-03-03', PREC, 'am');
		await addAssignmentX(db, 'a2', '2025-03-03', PREC2, 'pm');
		await addMutualExclusion(db, PREC, PREC2);
		const r = await validateSchedule(db, SCHED);
		expect(r.counts['mutual_exclusion']).toBe(1);
		expect(r.counts['session_clash']).toBeUndefined();
		const finding = r.byStudent[STU]?.find((v) => v.code === 'mutual_exclusion');
		expect(finding?.assignment_ids.slice().sort()).toEqual(['a1', 'a2']);
	});

	it('does not flag mutual_exclusion without a rule', async () => {
		await onboardAndAddSecondPreceptor(db);
		await addAssignmentX(db, 'a1', '2025-03-03', PREC, 'am');
		await addAssignmentX(db, 'a2', '2025-03-03', PREC2, 'pm');
		const r = await validateSchedule(db, SCHED);
		expect(r.counts['mutual_exclusion']).toBeUndefined();
	});

	// --- Block-week conflict (L3) ------------------------------------------------
	const BLOCK = 'clerk-block';
	async function addBlockClerkship(db: Kysely<DB>) {
		const ts = new Date().toISOString();
		await db
			.insertInto('clerkships')
			.values({
				id: BLOCK,
				name: 'Inpatient',
				clerkship_type: 'inpatient',
				required_days: 5,
				scheduling_kind: 'block',
				created_at: ts,
				updated_at: ts
			})
			.execute();
		await db
			.insertInto('schedule_clerkships')
			.values({ id: 'sc-block', schedule_id: SCHED, clerkship_id: BLOCK, created_at: ts })
			.execute();
	}
	async function addBlockAssignment(db: Kysely<DB>, id: string, date: string) {
		const ts = new Date().toISOString();
		await db
			.insertInto('schedule_assignments')
			.values({
				id,
				student_id: STU,
				preceptor_id: PREC,
				clerkship_id: BLOCK,
				date,
				status: 'scheduled',
				created_at: ts,
				updated_at: ts
			})
			.execute();
	}

	it('flags a scattered day in a week consumed by a block, one finding per day', async () => {
		await addBlockClerkship(db);
		// Block on Mon 2025-01-06 consumes that whole week…
		await addBlockAssignment(db, 'b1', '2025-01-06');
		// …a scattered (outpatient) day on Wed 2025-01-08 conflicts.
		await addAssignment(db, 's1', '2025-01-08');
		const r = await validateSchedule(db, SCHED);
		expect(r.counts['block_week_conflict']).toBe(1);
		const finding = r.byStudent[STU]?.find((v) => v.code === 'block_week_conflict');
		expect(finding?.date).toBe('2025-01-08');
		// The block day itself is not flagged as a conflict.
		expect(r.byDate['2025-01-06']?.some((v) => v.code === 'block_week_conflict')).toBeFalsy();
	});

	it('does not flag a scattered day in a free week (partial-week boundary)', async () => {
		await addBlockClerkship(db);
		await addBlockAssignment(db, 'b1', '2025-01-06'); // week of 2025-01-06
		await addAssignment(db, 's1', '2025-01-13'); // next Monday, different week
		const r = await validateSchedule(db, SCHED);
		expect(r.counts['block_week_conflict']).toBeUndefined();
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

	it('autogen-ready stays pending until a clerkship has a workable preceptor (F-28)', async () => {
		// The seed schedule has a clerkship and a preceptor but no availability, so
		// no clerkship has a workable preceptor yet.
		let items = await getSetupChecklist(db, SCHED, true);
		let byId = Object.fromEntries(items.map((i) => [i.id, i]));
		expect(byId['autogen-ready'].done).toBe(false);
		expect(byId['autogen-ready'].count).toBe(1); // one clerkship without a preceptor

		// Materialise availability for the schedule's preceptor at a site, in range.
		const ts = new Date().toISOString();
		await db
			.insertInto('sites')
			.values({ id: 'site-1', name: 'Clinic', health_system_id: HS, created_at: ts, updated_at: ts })
			.execute();
		await db
			.insertInto('preceptor_availability')
			.values({
				id: 'av-1',
				preceptor_id: PREC,
				site_id: 'site-1',
				date: '2025-03-03',
				is_available: 1,
				created_at: ts,
				updated_at: ts
			})
			.execute();

		items = await getSetupChecklist(db, SCHED, true);
		byId = Object.fromEntries(items.map((i) => [i.id, i]));
		// The clerkship now has an eligible preceptor with availability in range.
		expect(byId['autogen-ready'].done).toBe(true);
		expect(byId['autogen-ready'].count).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// The pure in-memory evaluator (no DB). This is the half the manual planner's
// "dry run" reuses: it must apply every whole-schedule rule to an arbitrary
// assignment list — committed rows or hypothetical pins — identically.
// ---------------------------------------------------------------------------

/** A ValidationInputs with wide-open context; tests tighten only what they exercise. */
function inputsOf(
	assignments: ValidationAssignment[],
	overrides: {
		ctx?: Partial<ValidationContext>;
		exclusionKeys?: Set<string>;
		clerkshipKind?: Map<string, 'block' | 'scattered'>;
	} = {}
): ValidationInputs {
	return {
		assignments,
		ctx: {
			scheduleStart: '2025-01-01',
			scheduleEnd: '2025-12-31',
			preceptorMaxStudents: new Map(),
			preceptorUnavailable: new Map(),
			preceptorHealthSystem: new Map(),
			clerkshipSites: new Map(),
			studentOnboarded: new Map([['stu-1', new Set(['hs-1'])]]),
			blackoutDates: new Set(),
			existingStudentIds: new Set(['stu-1']),
			existingPreceptorIds: new Set(['p1', 'p2']),
			existingClerkshipIds: new Set(['block', 'scatter']),
			preceptorInPinch: new Map(),
			preceptorPreferredDates: new Map(),
			preceptorDateOccupancy: new Map(),
			...overrides.ctx
		},
		exclusionKeys: overrides.exclusionKeys ?? new Set(),
		clerkshipKind: overrides.clerkshipKind ?? new Map()
	};
}

function clinical(
	id: string,
	date: string,
	over: Partial<ValidationAssignment> = {}
): ValidationAssignment {
	return {
		id,
		student_id: 'stu-1',
		preceptor_id: 'p1',
		clerkship_id: 'scatter',
		site_id: 'site-1',
		date,
		credit_value: 1,
		session: 'full',
		kind: 'clinical',
		...over
	};
}

describe('evaluateAssignments (pure, no DB)', () => {
	it('returns an empty result for no assignments', () => {
		expect(evaluateAssignments(inputsOf([]))).toEqual({
			violations: [],
			byDate: {},
			byStudent: {},
			byPreceptor: {},
			counts: {}
		});
	});

	it('flags a session clash for two full-day assignments on one student-date', () => {
		const r = evaluateAssignments(
			inputsOf([
				clinical('a', '2025-03-03', { preceptor_id: 'p1' }),
				clinical('b', '2025-03-03', { preceptor_id: 'p2' })
			])
		);
		expect(r.counts['session_clash']).toBe(1);
		// AM + PM on one date is NOT a clash.
		const ok = evaluateAssignments(
			inputsOf([
				clinical('a', '2025-03-04', { session: 'am', preceptor_id: 'p1' }),
				clinical('b', '2025-03-04', { session: 'pm', preceptor_id: 'p2' })
			])
		);
		expect(ok.counts['session_clash'] ?? 0).toBe(0);
	});

	it('flags mutual exclusion only when the pair is marked excluded', () => {
		const pins = [
			clinical('a', '2025-03-05', { session: 'am', preceptor_id: 'p1' }),
			clinical('b', '2025-03-05', { session: 'pm', preceptor_id: 'p2' })
		];
		// No exclusion → clean (and AM/PM means no session clash either).
		expect(evaluateAssignments(inputsOf(pins)).counts['mutual_exclusion'] ?? 0).toBe(0);
		// With the pair excluded → one finding.
		const r = evaluateAssignments(
			inputsOf(pins, { exclusionKeys: new Set([mutualExclusionKey('p1', 'p2')]) })
		);
		expect(r.counts['mutual_exclusion']).toBe(1);
	});

	it('flags a scattered day that lands in a block week', () => {
		const r = evaluateAssignments(
			inputsOf(
				[
					clinical('blk', '2025-03-03', { clerkship_id: 'block' }), // Mon of a block week
					clinical('sct', '2025-03-05', { clerkship_id: 'scatter' }) // Wed same week
				],
				{
					clerkshipKind: new Map([
						['block', 'block'],
						['scatter', 'scattered']
					])
				}
			)
		);
		expect(r.counts['block_week_conflict']).toBe(1);
	});

	it('flags one capacity finding per over-subscribed preceptor-day', () => {
		const r = evaluateAssignments(
			inputsOf(
				[
					clinical('a', '2025-03-06', { student_id: 'stu-1', preceptor_id: 'p1' }),
					clinical('b', '2025-03-06', { student_id: 'stu-2', preceptor_id: 'p1' })
				],
				{ ctx: { preceptorMaxStudents: new Map([['p1', 1]]) } }
			)
		);
		expect(r.counts['preceptor_capacity']).toBe(1);
	});
});

describe('load + evaluate seam (the planner dry-run contract)', () => {
	let db: Kysely<DB>;
	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();
		await seed(db);
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
		await addAssignment(db, 'committed-1', '2025-03-03');
	});
	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('validateSchedule == evaluateAssignments(loadValidationInputs(...))', async () => {
		const viaWrapper = await validateSchedule(db, SCHED);
		const viaParts = evaluateAssignments(await loadValidationInputs(db, SCHED));
		expect(viaParts).toEqual(viaWrapper);
	});

	it('a hypothetical pin layered on loaded inputs surfaces a new conflict the committed set did not', async () => {
		const inputs = await loadValidationInputs(db, SCHED);
		// Committed schedule is clean (onboarded, in range, under capacity).
		expect(evaluateAssignments(inputs).violations).toHaveLength(0);

		// Layer a tentative pin that double-books the student on the committed day.
		const pin: ValidationAssignment = {
			id: 'pin-1',
			student_id: STU,
			preceptor_id: PREC,
			clerkship_id: CLERK,
			site_id: null,
			date: '2025-03-03',
			credit_value: 1,
			session: 'full',
			kind: 'clinical'
		};
		const withPin = evaluateAssignments({ ...inputs, assignments: [...inputs.assignments, pin] });
		expect(withPin.counts['session_clash']).toBe(1);
		// The committed inputs themselves are untouched (pure evaluation).
		expect(evaluateAssignments(inputs).violations).toHaveLength(0);
	});
});
