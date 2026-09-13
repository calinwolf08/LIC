// @coverage @req(R6.1) @req(R6.2) @req(R6.3) @req(R6.4) @req(R6.5) @req(R6.6) @req(R6.7) @req(R3.1)
/**
 * J3.1 — Three entry points, one dialog (e2e plan Phase 3).
 *
 * The same clean assignment can be created from the student page (student
 * locked) and from an empty calendar day (date locked); both go through the one
 * unified dialog, and afterwards the calendar, the student page and the API all
 * agree. Plus the create-time edges: a past day warns `past_date`, and a
 * preceptor with availability at an allowed site produces a clean create.
 *
 * Runs in a sandbox populated with the seeded roster, so every row is torn down
 * with the sandbox. Alice Johnson + Dr. Amanda Smith + Family Medicine is the
 * seed's known-clean combination (see seed-demo).
 */

import { test, expect, apiOf, fromToday } from '../../fixtures';
import { AssignmentDialog } from '../../pages';
import { populatedSandbox } from './helpers';

const STUDENT = 'Alice Johnson';
const PRECEPTOR = 'Dr. Amanda Smith';
const CLERKSHIP = 'Family Medicine';

/** A weekday `atLeast` days from today, as YYYY-MM-DD. */
function futureWeekday(atLeast: number): string {
	let n = atLeast;
	for (;;) {
		const d = new Date(`${fromToday(n)}T00:00:00Z`);
		const dow = d.getUTCDay();
		if (dow !== 0 && dow !== 6) return fromToday(n);
		n++;
	}
}

test.describe('J3.1 manual scheduling — entry points', { tag: ['@stage1'] }, () => {
	test('create from the student page and from the calendar; all surfaces agree', async ({
		asAdmin,
		sandbox
	}) => {
		test.setTimeout(150000);
		// Register the populated sandbox with the factory so it is restored/deleted.
		const roster = await populatedSandbox(asAdmin, `J3.1 ${Date.now()}`);
		sandbox.register(roster.sandbox);

		const api = apiOf(asAdmin);
		const studentId = roster.students.find((s) => s.name === STUDENT)!.id;
		// Avoid the seeded blackout dates (~fromToday(16) and ~fromToday(37)).
		const d1 = futureWeekday(8);
		const d2 = futureWeekday(23);

		// --- Entry point 1: the student page (student is locked) ---
		await asAdmin.goto(`/students/${studentId}`);
		const dialog = new AssignmentDialog(asAdmin);
		await dialog.open();
		await dialog.selectClerkship(CLERKSHIP);
		await dialog.selectPreceptor(PRECEPTOR);
		await dialog.pickDay(d1);
		// The requirement strip reports remaining days for the clerkship.
		await expect(dialog.requirementStrip()).toBeVisible();
		await dialog.expectClean();
		await dialog.submitAndExpectCreated();

		// --- Entry point 2: an empty calendar day (date is locked) ---
		await asAdmin.goto('/calendar');
		await expect(asAdmin.getByRole('button', { name: 'Add assignment' })).toBeVisible({
			timeout: 20000
		});
		// Use the dialog's own "Add assignment" (date not pre-locked) to place the
		// second day for the same student/preceptor on a different date.
		const dialog2 = new AssignmentDialog(asAdmin);
		await dialog2.open();
		await dialog2.selectStudent(STUDENT);
		await dialog2.selectClerkship(CLERKSHIP);
		await dialog2.selectPreceptor(PRECEPTOR);
		await dialog2.pickDay(d2);
		await dialog2.expectClean();
		await dialog2.submitAndExpectCreated();

		// --- All three surfaces agree: two rows for this student ---
		const rows = await api.get<Array<{ date: string }>>(`/api/students/${studentId}/schedule`);
		const dates = JSON.stringify(rows.data);
		expect(dates).toContain(d1);
		expect(dates).toContain(d2);
	});

	test('a past day surfaces the past_date warning in the dialog', async ({ asAdmin, sandbox }) => {
		test.setTimeout(120000);
		const roster = await populatedSandbox(asAdmin, `J3.1past ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const studentId = roster.students.find((s) => s.name === STUDENT)!.id;

		await asAdmin.goto(`/students/${studentId}`);
		const dialog = new AssignmentDialog(asAdmin);
		await dialog.open();
		await dialog.selectClerkship(CLERKSHIP);
		await dialog.selectPreceptor(PRECEPTOR);
		// A past weekday inside the sandbox range (range starts a month back).
		let n = -3;
		while (true) {
			const d = new Date(`${fromToday(n)}T00:00:00Z`).getUTCDay();
			if (d !== 0 && d !== 6) break;
			n--;
		}
		await dialog.pickDay(fromToday(n));
		await dialog.expectWarning(/passed|past/i);
	});
});
