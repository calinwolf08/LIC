// @coverage @req(R7.1) @req(R7.2) @req(R7.3) @finding(P8-c)
/**
 * J3.10 — Capacity override side-effects through the browser (e2e plan Phase 3).
 *
 * J3.3 drives the `mark_preceptor_available` side effect end to end; the other
 * two side effects the override conversation offers were, until now, only tested
 * at the service/integration layer. This closes that gap (coverage doc §8, gap
 * #1) by taking both capacity branches through the real dialog:
 *
 *   - **Raise the limit** (`bump_preceptor_capacity`): a preceptor at capacity is
 *     double-booked "for good" — the create raises `max_students`, and because
 *     the side effect is applied before validation, both students end up cleanly
 *     assigned on the day.
 *   - **Move the other student off** (`remove_conflicting_assignment`): the
 *     occupant is removed so the new student takes the slot — the capacity limit
 *     is left untouched and the occupant's row for that day is gone.
 *
 * Both use the known-clean pairing (Alice/Bob onboarded at Dr. Amanda Smith's
 * health system for Family Medicine, per J3.3/J3.4). Amanda's per-day limit is
 * set to 1 so a second student on the same day trips `preceptor_capacity`; the
 * original limit is restored afterwards since preceptors are global (not
 * schedule-scoped).
 */

import { test, expect, apiOf, assignmentsForSchedule } from '../../fixtures';
import { AssignmentDialog } from '../../pages';
import { populatedSandbox } from './helpers';
import { freeWeekdayForStudents } from '../phase-4/helpers';
import type { Kysely } from 'kysely';
import type { DB } from '$lib/db/types';

const PRECEPTOR = 'Dr. Amanda Smith';
const CLERKSHIP = 'Family Medicine';

/** A weekday on which the preceptor has NO assignment on ANY schedule (capacity
 * is counted globally) and none of `studentIds` is booked either. */
async function freeDayForPreceptorAndStudents(
	db: Kysely<DB>,
	preceptorId: string,
	studentIds: string[],
	atLeast: number
): Promise<string> {
	const precDates = await db
		.selectFrom('schedule_assignments')
		.select('date')
		.where('preceptor_id', '=', preceptorId)
		.execute();
	return freeWeekdayForStudents(
		db,
		studentIds,
		atLeast,
		precDates.map((r) => r.date)
	);
}

/** Read a preceptor's current per-day student limit. */
async function maxStudents(db: Kysely<DB>, preceptorId: string): Promise<number> {
	const row = await db
		.selectFrom('preceptors')
		.select('max_students')
		.where('id', '=', preceptorId)
		.executeTakeFirst();
	return row?.max_students ?? 0;
}

/** The site Amanda serves (from her materialised availability) — the clean site
 * a Family Medicine assignment with her lands on. site_id is required on create. */
async function preceptorSite(api: ReturnType<typeof apiOf>, preceptorId: string): Promise<string> {
	const avail = await api.get<Array<{ site_id: string }>>(
		`/api/preceptors/${preceptorId}/availability`
	);
	const siteId = (avail.data ?? [])[0]?.site_id;
	expect(siteId, 'preceptor has materialised availability at a site').toBeTruthy();
	return siteId;
}

test.describe('J3.10 manual scheduling — capacity side-effects', { tag: ['@stage1'] }, () => {
	test('"raise the limit" double-books for good: capacity is bumped and both days assigned', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(150000);
		const roster = await populatedSandbox(asAdmin, `J3.10rl ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		const amanda = roster.preceptors.find((p) => p.name === PRECEPTOR)!;
		const alice = roster.students.find((s) => s.name === 'Alice Johnson')!;
		const bob = roster.students.find((s) => s.name === 'Bob Williams')!;
		const fm = roster.clerkships.find((c) => c.name === CLERKSHIP)!;

		const originalMax = await maxStudents(db, amanda.id);
		try {
			// Pin Amanda's per-day limit to 1 so a second student trips capacity.
			expect((await api.patch(`/api/preceptors/${amanda.id}`, { max_students: 1 })).ok).toBe(true);
			const site = await preceptorSite(api, amanda.id);
			const day = await freeDayForPreceptorAndStudents(db, amanda.id, [alice.id, bob.id], 12);

			// First student fills the single slot cleanly (via the API).
			expect(
				(
					await api.post('/api/schedules/assignments', {
						student_id: alice.id,
						preceptor_id: amanda.id,
						clerkship_id: fm.id,
						site_id: site,
						date: day
					})
				).ok
			).toBe(true);

			// Second student on the same day → capacity conversation. Take the
			// "double-book this day" → "raise the limit" branch.
			await asAdmin.goto(`/students/${bob.id}`);
			const dialog = new AssignmentDialog(asAdmin);
			await dialog.open();
			await dialog.selectClerkship(CLERKSHIP);
			await dialog.selectPreceptor(PRECEPTOR);
			await dialog.pickDay(day);
			await dialog.expectWarning(/already has a student/i);
			await dialog.submitAndExpectCreated({
				prefer: [/double-book this day/i, /raise the limit/i]
			});

			// Both students are assigned on the day...
			const rows = await assignmentsForSchedule(db, roster.sandbox.id);
			const onDay = rows.filter((r) => r.date === day);
			expect(onDay.map((r) => r.student_id).sort()).toEqual([alice.id, bob.id].sort());

			// ...and the limit was raised for good (1 → 2).
			expect(await maxStudents(db, amanda.id)).toBe(2);
		} finally {
			await api.patch(`/api/preceptors/${amanda.id}`, { max_students: originalMax });
		}
	});

	test('"move the other student off" frees the slot: occupant removed, limit unchanged', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(150000);
		const roster = await populatedSandbox(asAdmin, `J3.10mv ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);

		const amanda = roster.preceptors.find((p) => p.name === PRECEPTOR)!;
		const alice = roster.students.find((s) => s.name === 'Alice Johnson')!;
		const bob = roster.students.find((s) => s.name === 'Bob Williams')!;
		const fm = roster.clerkships.find((c) => c.name === CLERKSHIP)!;

		const originalMax = await maxStudents(db, amanda.id);
		try {
			expect((await api.patch(`/api/preceptors/${amanda.id}`, { max_students: 1 })).ok).toBe(true);
			const site = await preceptorSite(api, amanda.id);
			const day = await freeDayForPreceptorAndStudents(db, amanda.id, [alice.id, bob.id], 12);

			// Alice occupies the only slot.
			const created = await api.post<{ id?: string; assignment?: { id: string } }>(
				'/api/schedules/assignments',
				{
					student_id: alice.id,
					preceptor_id: amanda.id,
					clerkship_id: fm.id,
					site_id: site,
					date: day
				}
			);
			expect(created.ok).toBe(true);
			const aliceRowId = created.data?.assignment?.id ?? created.data?.id;
			expect(aliceRowId).toBeTruthy();

			// Bob on the same day → capacity conversation. Take the "move Alice off"
			// branch instead of double-booking.
			await asAdmin.goto(`/students/${bob.id}`);
			const dialog = new AssignmentDialog(asAdmin);
			await dialog.open();
			await dialog.selectClerkship(CLERKSHIP);
			await dialog.selectPreceptor(PRECEPTOR);
			await dialog.pickDay(day);
			await dialog.expectWarning(/already has a student/i);
			await dialog.submitAndExpectCreated({ prefer: [/move .* off/i] });

			// Bob has the slot; Alice's row for that day is gone.
			const rows = await assignmentsForSchedule(db, roster.sandbox.id);
			const onDay = rows.filter((r) => r.date === day);
			expect(onDay.map((r) => r.student_id)).toEqual([bob.id]);
			expect(rows.some((r) => r.id === aliceRowId)).toBe(false);

			// The limit was NOT raised — this branch resolves by moving, not bumping.
			expect(await maxStudents(db, amanda.id)).toBe(1);
		} finally {
			await api.patch(`/api/preceptors/${amanda.id}`, { max_students: originalMax });
		}
	});
});
