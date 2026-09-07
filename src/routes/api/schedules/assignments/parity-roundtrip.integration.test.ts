/**
 * Parity: round-trip & editability of generated rows (06 §2.6 rules 1–2,
 * findings P-01, P-03, P-04, P-10, F-14).
 *
 * Rule 1 (round-trip): a generated row is stamped with everything a manual
 * create needs — `schedule_id`, `site_id`, `elective_id`, `source`,
 * `override_codes` — so the row's own columns reconstruct a valid manual
 * `POST` payload. An elective that belongs to another clerkship (or does not
 * exist) is a hard block, never a silent drop.
 *
 * Rule 2 (editability): a generated row is fully editable by the manual routes,
 * and every edit preserves `elective_id` and `source`. Moving a generated row
 * that carries an accepted override onto a day that re-triggers the same soft
 * code is refused unless the override is re-supplied — exactly as it would be for
 * a hand-built row, because both go through the one validator.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '$lib/db/test-utils';
import {
	insertGeneratedAssignments,
	createManualAssignment,
	setAssignmentLock,
	getAssignmentById,
	parseCodes
} from '$lib/features/schedules/services/assignment-service';
import {
	reassignToPreceptor,
	changeAssignmentDate
} from '$lib/features/schedules/services/editing-service';

const SCHED = 'sched-rt';
const HS = 'hs-rt';
const HS2 = 'hs2-rt';
const SITE = 'site-rt';
const CLERK = 'clerk-rt';
const CLERK2 = 'clerk2-rt';
const ELECT = 'elect-rt';
const ELECT_OTHER = 'elect-other-rt';
const STU = 'stu-rt';
const STU2 = 'stu2-rt';
const PREC = 'prec-rt';
const PREC2 = 'prec2-rt';
const PREC_HS2 = 'prec-hs2-rt';
const TS = '2026-01-01T00:00:00.000Z';

describe('generated rows are round-trippable and editable like manual rows', () => {
	let db: Kysely<DB>;

	beforeEach(async () => {
		db = await createTestDatabaseWithMigrations();

		await db
			.insertInto('scheduling_periods')
			.values({
				id: SCHED,
				name: 'RT',
				start_date: '2026-01-01',
				end_date: '2026-12-31',
				created_at: TS,
				updated_at: TS
			})
			.execute();
		for (const id of [HS, HS2]) {
			await db
				.insertInto('health_systems')
				.values({ id, name: id, created_at: TS, updated_at: TS })
				.execute();
		}
		await db
			.insertInto('sites')
			.values({ id: SITE, name: 'Site', health_system_id: HS, created_at: TS, updated_at: TS })
			.execute();
		for (const [id, name] of [
			[CLERK, 'IM'],
			[CLERK2, 'Surgery']
		]) {
			await db
				.insertInto('clerkships')
				.values({
					id,
					name,
					clerkship_type: 'outpatient',
					required_days: 5,
					created_at: TS,
					updated_at: TS
				})
				.execute();
		}
		// A required elective on CLERK, and an elective on the other clerkship (to
		// prove the belongs-to-clerkship rule).
		await db
			.insertInto('clerkship_electives')
			.values([
				{
					id: ELECT,
					clerkship_id: CLERK,
					name: 'Cardiology',
					minimum_days: 2,
					is_required: 1,
					created_at: TS,
					updated_at: TS
				},
				{
					id: ELECT_OTHER,
					clerkship_id: CLERK2,
					name: 'Ortho',
					minimum_days: 2,
					is_required: 1,
					created_at: TS,
					updated_at: TS
				}
			])
			.execute();

		for (const id of [STU, STU2]) {
			await db
				.insertInto('students')
				.values({ id, name: id, email: `${id}@x.com`, created_at: TS, updated_at: TS })
				.execute();
		}
		await db
			.insertInto('preceptors')
			.values([
				{
					id: PREC,
					name: PREC,
					email: `${PREC}@x.com`,
					max_students: 2,
					health_system_id: HS,
					created_at: TS,
					updated_at: TS
				},
				{
					id: PREC2,
					name: PREC2,
					email: `${PREC2}@x.com`,
					max_students: 2,
					health_system_id: HS,
					created_at: TS,
					updated_at: TS
				},
				{
					id: PREC_HS2,
					name: PREC_HS2,
					email: `${PREC_HS2}@x.com`,
					max_students: 2,
					health_system_id: HS2,
					created_at: TS,
					updated_at: TS
				}
			])
			.execute();

		// Both students onboarded at HS (so HS assignments are clean); nobody is
		// onboarded at HS2, so a move onto PREC_HS2 re-triggers `not_onboarded`.
		for (const sid of [STU, STU2]) {
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

		await db
			.insertInto('schedule_students')
			.values([
				{ id: 'ss-1', schedule_id: SCHED, student_id: STU, created_at: TS },
				{ id: 'ss-2', schedule_id: SCHED, student_id: STU2, created_at: TS }
			])
			.execute();
		await db
			.insertInto('schedule_preceptors')
			.values([
				{ id: 'sp-1', schedule_id: SCHED, preceptor_id: PREC, created_at: TS },
				{ id: 'sp-2', schedule_id: SCHED, preceptor_id: PREC2, created_at: TS },
				{ id: 'sp-3', schedule_id: SCHED, preceptor_id: PREC_HS2, created_at: TS }
			])
			.execute();
	});

	afterEach(async () => {
		await cleanupTestDatabase(db);
	});

	it('stamps a generated row so its own columns reconstruct a valid manual create (rule 1)', async () => {
		const { inserted } = await insertGeneratedAssignments(db, SCHED, [
			{
				studentId: STU,
				preceptorId: PREC,
				clerkshipId: CLERK,
				date: '2026-10-05',
				siteId: SITE,
				electiveId: ELECT,
				overrideCodes: ['not_onboarded'] // a bypassed auto day, like a manual override
			}
		]);
		expect(inserted).toHaveLength(1);
		const gen = inserted[0];

		// F-14 / P-10: every field a round-trip needs is present.
		expect(gen.source).toBe('generated');
		expect(gen.schedule_id).toBe(SCHED);
		expect(gen.site_id).toBe(SITE);
		expect(gen.elective_id).toBe(ELECT);
		expect(parseCodes(gen.override_codes)).toEqual(['not_onboarded']);

		// Build the equivalent manual payload from the generated row's OWN columns
		// (for a second student, to avoid a same-student/day double-book) and assert
		// the created row matches field for field (P-01).
		const created = await createManualAssignment(db, SCHED, {
			student_id: STU2,
			preceptor_id: gen.preceptor_id,
			clerkship_id: gen.clerkship_id,
			site_id: gen.site_id,
			elective_id: gen.elective_id,
			date: gen.date
		});
		expect(created.ok).toBe(true);
		if (!created.ok) return;
		const man = created.assignment;
		expect({
			preceptor_id: man.preceptor_id,
			clerkship_id: man.clerkship_id,
			site_id: man.site_id,
			elective_id: man.elective_id,
			date: man.date
		}).toEqual({
			preceptor_id: PREC,
			clerkship_id: CLERK,
			site_id: SITE,
			elective_id: ELECT,
			date: '2026-10-05'
		});
	});

	it('rejects an elective from another clerkship rather than dropping it silently (rule 1 / P-01)', async () => {
		const wrongClerkship = await createManualAssignment(db, SCHED, {
			student_id: STU,
			preceptor_id: PREC,
			clerkship_id: CLERK,
			site_id: SITE,
			elective_id: ELECT_OTHER, // belongs to CLERK2, not CLERK
			date: '2026-10-06'
		});
		expect(wrongClerkship.ok).toBe(false);

		const unknownElective = await createManualAssignment(db, SCHED, {
			student_id: STU,
			preceptor_id: PREC,
			clerkship_id: CLERK,
			site_id: SITE,
			elective_id: 'does-not-exist',
			date: '2026-10-07'
		});
		expect(unknownElective.ok).toBe(false);
	});

	it('lets the manual edit paths move, reassign and lock a generated row while preserving elective_id and source (rule 2)', async () => {
		const { inserted } = await insertGeneratedAssignments(db, SCHED, [
			{
				studentId: STU,
				preceptorId: PREC,
				clerkshipId: CLERK,
				date: '2026-10-10',
				siteId: SITE,
				electiveId: ELECT
			}
		]);
		const id = inserted[0].id!;

		// Move (change date) — a clean future slot.
		const moved = await changeAssignmentDate(db, id, '2026-10-11', false);
		expect(moved.valid).toBe(true);
		let row = await getAssignmentById(db, id);
		expect(row!.date).toBe('2026-10-11');
		expect(row!.elective_id).toBe(ELECT);
		expect(row!.source).toBe('generated');

		// Reassign to another same-system preceptor.
		const reassigned = await reassignToPreceptor(db, id, PREC2, false);
		expect(reassigned.valid).toBe(true);
		row = await getAssignmentById(db, id);
		expect(row!.preceptor_id).toBe(PREC2);
		expect(row!.elective_id).toBe(ELECT);
		expect(row!.source).toBe('generated');

		// Lock and unlock.
		let locked = await setAssignmentLock(db, id, true);
		expect(locked.locked).toBe(1);
		expect(locked.source).toBe('generated');
		expect(locked.elective_id).toBe(ELECT);
		locked = await setAssignmentLock(db, id, false);
		expect(locked.locked).toBe(0);
	});

	it('enforces the same soft code on an edit as on create, and accepts the re-supplied override (rule 2 / P-03/P-04)', async () => {
		const { inserted } = await insertGeneratedAssignments(db, SCHED, [
			{
				studentId: STU,
				preceptorId: PREC,
				clerkshipId: CLERK,
				date: '2026-10-15',
				siteId: SITE,
				electiveId: ELECT
			}
		]);
		const id = inserted[0].id!;

		// Reassign onto a preceptor whose health system the student is NOT onboarded
		// at. With soft violations blocking and no override supplied → refused with
		// the same code create would report.
		const refused = await reassignToPreceptor(db, id, PREC_HS2, false, { blockOnSoft: true });
		expect(refused.valid).toBe(false);
		expect(refused.soft.map((v) => v.code)).toContain('not_onboarded');

		// Same reassign with the override accepted → allowed, and the code is
		// persisted on the (still generated) row exactly like a manual override.
		const accepted = await reassignToPreceptor(db, id, PREC_HS2, false, {
			blockOnSoft: true,
			overrideCodes: ['not_onboarded']
		});
		expect(accepted.valid).toBe(true);
		const row = await getAssignmentById(db, id);
		expect(row!.preceptor_id).toBe(PREC_HS2);
		expect(row!.source).toBe('generated');
		expect(parseCodes(row!.override_codes)).toContain('not_onboarded');
	});
});
