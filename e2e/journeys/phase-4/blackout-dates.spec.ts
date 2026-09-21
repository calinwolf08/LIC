// @coverage @req(R8.4)
// @coverage @finding(P4-d) @finding(P4-e)
/**
 * J4.2 — Blackout dates: create, conflict, resolve (e2e plan Phase 3/4).
 *
 * Adds a blackout from the calendar (the day turns distinct in the grid), adds
 * one on a day that already has assignments (the Scheduling Conflict dialog
 * lists each student/preceptor/clerkship, matching the conflicts API, and
 * confirming DELETES those assignments — the product's chosen resolution, see
 * finding P4-c), rejects a duplicate, allows an out-of-range date, and deletes.
 *
 * NOTE: blackout dates are global, not schedule-scoped (a known tenant-isolation
 * defect, plan §1.2 / finding P4-d), so every blackout this test adds is deleted
 * again in a finally to avoid leaking into other journeys.
 */

import { test, expect, apiOf, assignmentsForSchedule } from '../../fixtures';
import { CalendarPage } from '../../pages/calendar-page';
import {
	populatedSandbox,
	createAssignment,
	freeWeekdayForStudents,
	freeWeekdayNoAssignments
} from './helpers';

test.describe('J4.2 blackout dates', { tag: ['@stage1'] }, () => {
	test('create (distinct in grid), conflict-delete, duplicate, out-of-range, delete', async ({
		asAdmin,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		const roster = await populatedSandbox(asAdmin, `J4.2 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);
		const bob = roster.students.find((s) => s.name === 'Bob Williams')!.id;
		const carol = roster.students.find((s) => s.name === 'Carol Martinez')!.id;
		const michael = roster.preceptors.find((p) => p.name === 'Dr. Michael Lee')!.id;
		const sarah = roster.preceptors.find((p) => p.name === 'Dr. Sarah Wilson')!.id;
		const peds = roster.clerkships.find((c) => c.name === 'Pediatrics')!.id;
		const community = roster.sites.find((s) => s.name === 'Community Hospital')!.id;

		// Avoid days that are already blackouts (seeded) — the test needs plain days.
		const seededBlackouts = (
			(await api.get<Array<{ date: string }>>('/api/blackout-dates')).data ?? []
		).map((b) => b.date);
		const cleanDay = await freeWeekdayNoAssignments(db, 8, seededBlackouts);
		const conflictDay = await freeWeekdayNoAssignments(db, 8, [...seededBlackouts, cleanDay]);
		const outOfRange = '2027-03-15'; // beyond the sandbox's ~3-month range
		const cleanReason = `Holiday ${Date.now()}`;
		const added = [cleanDay, conflictDay, outOfRange];

		try {
			// Two assignments on the conflict day (nobody else in the DB uses it).
			await createAssignment(asAdmin, {
				student_id: bob,
				preceptor_id: michael,
				clerkship_id: peds,
				site_id: community,
				date: conflictDay
			});
			await createAssignment(asAdmin, {
				student_id: carol,
				preceptor_id: sarah,
				clerkship_id: peds,
				site_id: community,
				date: conflictDay
			});

			const cal = new CalendarPage(asAdmin);
			await cal.goto();
			await cal.toggleBlackoutPanel();

			// --- Add a blackout on a clean day → row appears, grid marks it ---
			await asAdmin.locator('#blackout-date').fill(cleanDay);
			await asAdmin.locator('#blackout-reason').fill(cleanReason);
			await asAdmin.getByRole('button', { name: 'Add', exact: true }).click();
			await expect(asAdmin.getByText(cleanReason)).toBeVisible({ timeout: 10000 });
			await expect(async () => expect(await cal.isBlackout(cleanDay)).toBe(true)).toPass({
				timeout: 10000
			});

			// --- Add a blackout on a day with assignments → conflict dialog ---
			// The dialog rows match the conflicts API payload.
			const conflicts = await api.post<{
				count: number;
				assignments: Array<{ studentName: string }>;
			}>('/api/blackout-dates/conflicts', { date: conflictDay });
			expect(conflicts.data?.count).toBe(2);
			const apiNames = (conflicts.data?.assignments ?? []).map((a) => a.studentName).sort();
			expect(apiNames).toEqual(['Bob Williams', 'Carol Martinez']);

			await asAdmin.locator('#blackout-date').fill(conflictDay);
			await asAdmin.getByRole('button', { name: 'Add', exact: true }).click();
			await expect(asAdmin.getByRole('heading', { name: 'Scheduling Conflict' })).toBeVisible({
				timeout: 10000
			});
			await expect(asAdmin.getByRole('cell', { name: 'Bob Williams' })).toBeVisible();
			await expect(asAdmin.getByRole('cell', { name: 'Carol Martinez' })).toBeVisible();

			// Confirm → the conflicting assignments are deleted and the blackout added.
			await asAdmin.getByRole('button', { name: /delete assignments & add blackout/i }).click();
			await expect(async () => {
				const rows = await assignmentsForSchedule(db, roster.sandbox.id);
				expect(rows.filter((r) => r.date === conflictDay)).toHaveLength(0);
			}).toPass({ timeout: 10000 });
			await expect(async () => expect(await cal.isBlackout(conflictDay)).toBe(true)).toPass({
				timeout: 10000
			});

			// --- Duplicate date → inline error, no second row ---
			await asAdmin.locator('#blackout-date').fill(cleanDay);
			await asAdmin.getByRole('button', { name: 'Add', exact: true }).click();
			await expect(asAdmin.getByText(/already a blackout date/i)).toBeVisible({ timeout: 10000 });

			// --- Out-of-range date → allowed (added) ---
			await asAdmin.locator('#blackout-date').fill(outOfRange);
			await asAdmin.locator('#blackout-reason').fill('Next spring break');
			await asAdmin.getByRole('button', { name: 'Add', exact: true }).click();
			await expect(asAdmin.getByText('Next spring break')).toBeVisible({ timeout: 10000 });

			// --- Delete the clean-day blackout → row gone, grid no longer distinct ---
			const cleanRow = asAdmin
				.locator('div')
				.filter({ hasText: cleanReason })
				.filter({ has: asAdmin.getByRole('button', { name: '×' }) })
				.last();
			await cleanRow.getByRole('button', { name: '×' }).click();
			await expect(asAdmin.getByText(cleanReason)).toHaveCount(0, { timeout: 10000 });
			await expect(async () => expect(await cal.isBlackout(cleanDay)).toBe(false)).toPass({
				timeout: 10000
			});
		} finally {
			// Blackouts are global; remove any this test added.
			const all = await api.get<Array<{ id: string; date: string }>>('/api/blackout-dates');
			for (const bd of all.data ?? []) {
				if (added.includes(bd.date)) {
					await api.delete(`/api/blackout-dates/${bd.id}`).catch(() => {});
				}
			}
		}
	});
});
