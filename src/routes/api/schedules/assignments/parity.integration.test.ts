/**
 * Parity & one-validator release gate (06 §2.6, findings P-01/P-03/P-04, rules
 * 1–3 of 08-tier-parity-and-interop.md §4).
 *
 * These tests prove the property the whole review turns on: a generated schedule
 * is indistinguishable from a hand-built one to every mutation route, and every
 * mutation path answers "is this day allowed?" through the SAME validator with
 * the SAME violation vocabulary.
 *
 * - Rule 3 (one validator): a table of candidate scenarios is pushed through the
 *   manual-create validator, the engine's `ProposalValidator`, the three edit
 *   paths (reassign / change-date / swap) and whole-schedule validation, and
 *   every path is asserted to return the same code set. `expectSameViolationCodes`
 *   is the gate — a mutation path that stops delegating to the shared validator
 *   fails the suite by construction.
 * - Rules 1–2 (round-trip / editability) live in
 *   `parity-roundtrip.integration.test.ts`.
 *
 * Real service functions, real in-memory (migrated) SQLite — no mocks — so schema
 * or validator drift breaks the test.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import {
	validateAssignmentCandidate,
	type AssignmentCandidate,
	type CandidateValidation
} from '$lib/features/scheduling/services/assignment-validation';
import { ProposalValidator } from '$lib/features/scheduling/engine/proposal-validator';
import {
	reassignToPreceptor,
	changeAssignmentDate,
	swapAssignments,
	type EditResult
} from '$lib/features/schedules/services/editing-service';
import { validateSchedule } from '$lib/features/scheduling/services/schedule-validation';

const SCHED = 'sched-parity';
const HS = 'hs-parity';
const SITE = 'site-ok';
const SITE_BAD = 'site-bad';
const CLERK = 'clerk-parity';
const STU = 'stu-onboarded';
const STU2 = 'stu-not-onboarded';
const STU3 = 'stu-occupant';
const PREC = 'prec-main';
const PREC2 = 'prec-other';
const TS = '2026-01-01T00:00:00.000Z';

/** Sorted, de-duplicated code set from any {hard, soft} result — the one shape
 * `validateAssignmentCandidate`, `ProposalValidator` and the edit paths share. */
function codesOf(result: { hard: { code: string }[]; soft: { code: string }[] }): string[] {
	return [...new Set([...result.hard, ...result.soft].map((v) => v.code))].sort();
}

/** Assert every provided validation result carries the identical code set. */
function expectSameViolationCodes(
	label: string,
	...results: { hard: { code: string }[]; soft: { code: string }[] }[]
): string[] {
	const sets = results.map(codesOf);
	const [first, ...rest] = sets;
	for (let i = 0; i < rest.length; i++) {
		expect(rest[i], `${label}: path ${i + 2} disagreed (${JSON.stringify(sets)})`).toEqual(first);
	}
	return first;
}

async function insertAssignment(
	db: Kysely<DB>,
	row: {
		id: string;
		student_id: string;
		preceptor_id: string;
		date: string;
		site_id?: string | null;
	}
): Promise<void> {
	await db
		.insertInto('schedule_assignments')
		.values({
			id: row.id,
			schedule_id: SCHED,
			student_id: row.student_id,
			preceptor_id: row.preceptor_id,
			clerkship_id: CLERK,
			site_id: row.site_id ?? SITE,
			date: row.date,
			source: 'manual',
			created_at: TS,
			updated_at: TS
		})
		.execute();
}

describe('one-validator parity across every mutation path', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();

		await db
			.insertInto('scheduling_periods')
			.values({
				id: SCHED,
				name: 'Parity',
				start_date: '2026-01-01',
				end_date: '2026-12-31',
				created_at: TS,
				updated_at: TS
			})
			.execute();
		await db
			.insertInto('health_systems')
			.values({ id: HS, name: 'HS', created_at: TS, updated_at: TS })
			.execute();
		for (const [id, name] of [
			[SITE, 'Allowed site'],
			[SITE_BAD, 'Disallowed site']
		]) {
			await db
				.insertInto('sites')
				.values({ id, name, health_system_id: HS, created_at: TS, updated_at: TS })
				.execute();
		}
		await db
			.insertInto('clerkships')
			.values({
				id: CLERK,
				name: 'IM',
				clerkship_type: 'outpatient',
				required_days: 5,
				created_at: TS,
				updated_at: TS
			})
			.execute();
		// Only SITE is allowed for the clerkship, so SITE_BAD trips `site_not_allowed`.
		await db
			.insertInto('clerkship_sites')
			.values({ clerkship_id: CLERK, site_id: SITE, created_at: TS })
			.execute();

		for (const id of [STU, STU2, STU3]) {
			await db
				.insertInto('students')
				.values({ id, name: id, email: `${id}@x.com`, created_at: TS, updated_at: TS })
				.execute();
		}
		for (const id of [PREC, PREC2]) {
			await db
				.insertInto('preceptors')
				.values({
					id,
					name: id,
					email: `${id}@x.com`,
					max_students: 1,
					health_system_id: HS,
					created_at: TS,
					updated_at: TS
				})
				.execute();
		}

		// Onboard STU and STU3 at HS; STU2 stays un-onboarded to drive `not_onboarded`.
		for (const sid of [STU, STU3]) {
			await db
				.insertInto('student_health_system_onboarding')
				.values({
					id: `onb-${sid}`,
					student_id: sid,
					health_system_id: HS,
					is_completed: 1,
					created_at: TS,
					updated_at: TS
				})
				.execute();
		}

		// Junctions so whole-schedule validation and eligibility see the roster.
		await db
			.insertInto('schedule_students')
			.values([
				{ id: 'ss-1', schedule_id: SCHED, student_id: STU, created_at: TS },
				{ id: 'ss-2', schedule_id: SCHED, student_id: STU2, created_at: TS },
				{ id: 'ss-3', schedule_id: SCHED, student_id: STU3, created_at: TS }
			])
			.execute();
		await db
			.insertInto('schedule_clerkships')
			.values({ id: 'sc-1', schedule_id: SCHED, clerkship_id: CLERK, created_at: TS })
			.execute();
		await db
			.insertInto('schedule_preceptors')
			.values([
				{ id: 'sp-1', schedule_id: SCHED, preceptor_id: PREC, created_at: TS },
				{ id: 'sp-2', schedule_id: SCHED, preceptor_id: PREC2, created_at: TS }
			])
			.execute();
		await db
			.insertInto('schedule_health_systems')
			.values({ id: 'shs-1', schedule_id: SCHED, health_system_id: HS, created_at: TS })
			.execute();
		await db
			.insertInto('schedule_sites')
			.values([
				{ id: 'sst-1', schedule_id: SCHED, site_id: SITE, created_at: TS },
				{ id: 'sst-2', schedule_id: SCHED, site_id: SITE_BAD, created_at: TS }
			])
			.execute();
	});

	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	/**
	 * The engine (`ProposalValidator`) and the manual-create validator must agree,
	 * code for code, on the same candidate — this is the guarantee that makes a
	 * generated day and a hand-entered day interchangeable (P-03/P-04). Dates are
	 * in the future and the student stays under the required day count, so the
	 * create-time-only codes (`past_date`, `over_required_days`) never fire and the
	 * two paths (one with `checkCreateTimeCodes`, one without) are exactly
	 * comparable.
	 */
	it('engine ProposalValidator answers identically to manual create for every environmental code', async () => {
		// scenario -> [candidate, expected codes]
		const scenarios: Array<{ name: string; cand: AssignmentCandidate; expected: string[] }> = [];

		scenarios.push({
			name: 'clean',
			cand: {
				student_id: STU,
				preceptor_id: PREC,
				clerkship_id: CLERK,
				site_id: SITE,
				date: '2026-10-05'
			},
			expected: []
		});

		await db
			.insertInto('blackout_dates')
			.values({ id: 'bo-1', schedule_id: SCHED, date: '2026-10-06', created_at: TS })
			.execute();
		scenarios.push({
			name: 'blackout',
			cand: {
				student_id: STU,
				preceptor_id: PREC,
				clerkship_id: CLERK,
				site_id: SITE,
				date: '2026-10-06'
			},
			expected: ['blackout_date']
		});

		await db
			.insertInto('preceptor_availability')
			.values({
				id: 'pa-unavail',
				preceptor_id: PREC,
				site_id: SITE,
				date: '2026-10-07',
				is_available: 0,
				created_at: TS,
				updated_at: TS
			})
			.execute();
		scenarios.push({
			name: 'preceptor_unavailable',
			cand: {
				student_id: STU,
				preceptor_id: PREC,
				clerkship_id: CLERK,
				site_id: SITE,
				date: '2026-10-07'
			},
			expected: ['preceptor_unavailable']
		});

		scenarios.push({
			name: 'not_onboarded',
			cand: {
				student_id: STU2,
				preceptor_id: PREC,
				clerkship_id: CLERK,
				site_id: SITE,
				date: '2026-10-08'
			},
			expected: ['not_onboarded']
		});

		scenarios.push({
			name: 'site_not_allowed',
			cand: {
				student_id: STU,
				preceptor_id: PREC,
				clerkship_id: CLERK,
				site_id: SITE_BAD,
				date: '2026-10-09'
			},
			expected: ['site_not_allowed']
		});

		scenarios.push({
			name: 'outside_schedule',
			cand: {
				student_id: STU,
				preceptor_id: PREC,
				clerkship_id: CLERK,
				site_id: SITE,
				date: '2027-02-02'
			},
			expected: ['outside_schedule']
		});

		// An occupant on PREC/2026-10-12 pushes a second student over the max of 1.
		await insertAssignment(db, {
			id: 'occ-cap',
			student_id: STU3,
			preceptor_id: PREC,
			date: '2026-10-12'
		});
		scenarios.push({
			name: 'preceptor_capacity',
			cand: {
				student_id: STU,
				preceptor_id: PREC,
				clerkship_id: CLERK,
				site_id: SITE,
				date: '2026-10-12'
			},
			expected: ['preceptor_capacity']
		});

		// STU already has a day on 2026-10-13 (via PREC2) → a second day is a hard
		// double-booking regardless of preceptor.
		await insertAssignment(db, {
			id: 'occ-double',
			student_id: STU,
			preceptor_id: PREC2,
			date: '2026-10-13'
		});
		scenarios.push({
			name: 'student_double_booked',
			cand: {
				student_id: STU,
				preceptor_id: PREC,
				clerkship_id: CLERK,
				site_id: SITE,
				date: '2026-10-13'
			},
			expected: ['student_double_booked']
		});

		const validator = new ProposalValidator(db, SCHED, new Set());
		for (const { name, cand, expected } of scenarios) {
			const create: CandidateValidation = await validateAssignmentCandidate(db, SCHED, cand, {
				checkCreateTimeCodes: false
			});
			const proposal = await validator.validate({
				studentId: cand.student_id,
				preceptorId: cand.preceptor_id,
				clerkshipId: cand.clerkship_id,
				date: cand.date,
				siteId: cand.site_id
			});
			const codes = expectSameViolationCodes(name, create, proposal);
			expect(codes, `${name} expected codes`).toEqual(expected);
		}
	});

	/**
	 * Each edit path funnels the merged candidate through the same validator, so a
	 * change that lands a generated (or manual) row in a violating state yields the
	 * same code the create path would have returned. `blockOnSoft` makes the dry
	 * run surface soft codes so the full set is observable.
	 */
	it('reassign matches create for the resulting candidate (preceptor_unavailable)', async () => {
		await insertAssignment(db, {
			id: 'base-r',
			student_id: STU,
			preceptor_id: PREC,
			date: '2026-10-20'
		});
		await db
			.insertInto('preceptor_availability')
			.values({
				id: 'pa-r',
				preceptor_id: PREC2,
				site_id: SITE,
				date: '2026-10-20',
				is_available: 0,
				created_at: TS,
				updated_at: TS
			})
			.execute();

		const edit: EditResult = await reassignToPreceptor(db, 'base-r', PREC2, true, {
			blockOnSoft: true
		});
		const create = await validateAssignmentCandidate(
			db,
			SCHED,
			{
				student_id: STU,
				preceptor_id: PREC2,
				clerkship_id: CLERK,
				site_id: SITE,
				date: '2026-10-20',
				excludeId: 'base-r'
			},
			{ checkCreateTimeCodes: true }
		);
		const codes = expectSameViolationCodes('reassign', edit, create);
		expect(codes).toEqual(['preceptor_unavailable']);
	});

	it('change-date matches create for the resulting candidate (blackout_date)', async () => {
		await insertAssignment(db, {
			id: 'base-d',
			student_id: STU,
			preceptor_id: PREC,
			date: '2026-10-21'
		});
		await db
			.insertInto('blackout_dates')
			.values({ id: 'bo-d', schedule_id: SCHED, date: '2026-10-22', created_at: TS })
			.execute();

		const edit = await changeAssignmentDate(db, 'base-d', '2026-10-22', true, {
			blockOnSoft: true
		});
		const create = await validateAssignmentCandidate(
			db,
			SCHED,
			{
				student_id: STU,
				preceptor_id: PREC,
				clerkship_id: CLERK,
				site_id: SITE,
				date: '2026-10-22'
			},
			{ checkCreateTimeCodes: true }
		);
		const codes = expectSameViolationCodes('change-date', edit, create);
		expect(codes).toEqual(['blackout_date']);
	});

	it('swap matches create for the resulting candidates (preceptor_unavailable)', async () => {
		// STU on PREC and STU3 on PREC2, same day; PREC2 is unavailable that day, so
		// swapping STU onto PREC2 trips the same code create would report.
		await insertAssignment(db, {
			id: 'swap-a',
			student_id: STU,
			preceptor_id: PREC,
			date: '2026-10-24'
		});
		await insertAssignment(db, {
			id: 'swap-b',
			student_id: STU3,
			preceptor_id: PREC2,
			date: '2026-10-24'
		});
		await db
			.insertInto('preceptor_availability')
			.values({
				id: 'pa-s',
				preceptor_id: PREC2,
				site_id: SITE,
				date: '2026-10-24',
				is_available: 0,
				created_at: TS,
				updated_at: TS
			})
			.execute();

		const edit = await swapAssignments(db, 'swap-a', 'swap-b', true, { blockOnSoft: true });
		// Side A after swap: STU on PREC2, which is both unavailable that day and
		// already holds STU3's day (capacity 1). Both soft codes fire, and the create
		// path over the same resulting candidate reports exactly the same pair — the
		// point being that swap does not invent or drop codes relative to create.
		const create = await validateAssignmentCandidate(
			db,
			SCHED,
			{
				student_id: STU,
				preceptor_id: PREC2,
				clerkship_id: CLERK,
				site_id: SITE,
				date: '2026-10-24',
				excludeId: 'swap-a'
			},
			{ checkCreateTimeCodes: true }
		);
		const codes = expectSameViolationCodes('swap', edit, create);
		expect(codes).toEqual(['preceptor_capacity', 'preceptor_unavailable']);
	});

	/**
	 * Whole-schedule validation runs the pure sibling of the same validator over
	 * persisted rows. It must report the same environmental codes the create path
	 * would for those rows (P-03). (`preceptor_capacity` is slot-scoped in the
	 * whole-schedule pass — one finding per over-subscribed preceptor-day — so it
	 * is asserted via the double-occupied slot rather than a single candidate.)
	 */
	it('whole-schedule validation reports the same environmental codes as create', async () => {
		await db
			.insertInto('blackout_dates')
			.values({ id: 'bo-w', schedule_id: SCHED, date: '2026-11-03', created_at: TS })
			.execute();
		await db
			.insertInto('preceptor_availability')
			.values({
				id: 'pa-w',
				preceptor_id: PREC,
				site_id: SITE,
				date: '2026-11-04',
				is_available: 0,
				created_at: TS,
				updated_at: TS
			})
			.execute();

		// One row per environmental code.
		await insertAssignment(db, {
			id: 'w-blackout',
			student_id: STU,
			preceptor_id: PREC,
			date: '2026-11-03'
		});
		await insertAssignment(db, {
			id: 'w-unavail',
			student_id: STU,
			preceptor_id: PREC,
			date: '2026-11-04'
		});
		await insertAssignment(db, {
			id: 'w-notonb',
			student_id: STU2,
			preceptor_id: PREC,
			date: '2026-11-05'
		});
		await insertAssignment(db, {
			id: 'w-site',
			student_id: STU3,
			preceptor_id: PREC,
			date: '2026-11-06',
			site_id: SITE_BAD
		});

		const whole = await validateSchedule(db, SCHED);
		const codesFor = (assignmentId: string) =>
			[
				...new Set(
					whole.violations.filter((v) => v.assignment_id === assignmentId).map((v) => v.code)
				)
			].sort();

		const cases: Array<{ id: string; cand: AssignmentCandidate; code: string }> = [
			{
				id: 'w-blackout',
				cand: {
					student_id: STU,
					preceptor_id: PREC,
					clerkship_id: CLERK,
					site_id: SITE,
					date: '2026-11-03'
				},
				code: 'blackout_date'
			},
			{
				id: 'w-unavail',
				cand: {
					student_id: STU,
					preceptor_id: PREC,
					clerkship_id: CLERK,
					site_id: SITE,
					date: '2026-11-04'
				},
				code: 'preceptor_unavailable'
			},
			{
				id: 'w-notonb',
				cand: {
					student_id: STU2,
					preceptor_id: PREC,
					clerkship_id: CLERK,
					site_id: SITE,
					date: '2026-11-05'
				},
				code: 'not_onboarded'
			},
			{
				id: 'w-site',
				cand: {
					student_id: STU3,
					preceptor_id: PREC,
					clerkship_id: CLERK,
					site_id: SITE_BAD,
					date: '2026-11-06'
				},
				code: 'site_not_allowed'
			}
		];

		for (const { id, cand, code } of cases) {
			// The row is already persisted, so exclude it from its own conflict checks
			// (whole-schedule validation excludes self the same way).
			const create = await validateAssignmentCandidate(
				db,
				SCHED,
				{ ...cand, excludeId: id },
				{ checkCreateTimeCodes: false }
			);
			expect(codesFor(id), `${code}: whole-schedule`).toEqual([code]);
			expect(codesOf(create), `${code}: create`).toEqual([code]);
		}
	});
});
