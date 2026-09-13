// @coverage @req(R6.5) @req(R6.6)
// @coverage @finding(G8)
/**
 * J3.5 — Edit lifecycle of a hand-built day (e2e plan Phase 3).
 *
 * Create → move (change date) → reassign (change preceptor) → delete, all
 * through the student page's Schedule tab (list view), with the API confirming
 * each step. The list view is where each assignment row carries its own Edit and
 * Remove buttons; it is reached by opening the Schedule tab and switching to the
 * list toggle. Runs in a populated sandbox on Alice Johnson (no other rows there).
 */

import { test, expect, apiOf, fromToday } from '../../fixtures';
import { AssignmentDialog } from '../../pages';
import { populatedSandbox } from './helpers';

// Pediatrics Team A is two preceptors (Sarah Wilson, Michael Lee) at the SAME
// site (Community Hospital), so the reassign step stays on one site — the
// cascading picker offers the second preceptor without a site change. Alice is
// onboarded at every health system, so the create is clean.
const STUDENT = 'Alice Johnson';
const CLERKSHIP = 'Pediatrics';
const PRECEPTOR = 'Dr. Sarah Wilson';
const PRECEPTOR2 = 'Dr. Michael Lee';

function futureWeekday(atLeast: number): string {
	let n = atLeast;
	for (;;) {
		const dow = new Date(`${fromToday(n)}T00:00:00Z`).getUTCDay();
		if (dow !== 0 && dow !== 6) return fromToday(n);
		n++;
	}
}

test.describe('J3.5 manual scheduling — edit lifecycle', { tag: ['@stage1'] }, () => {
	test('create → move → reassign → delete, with the API agreeing at each step', async ({
		asAdmin,
		sandbox
	}) => {
		test.setTimeout(180000);
		const roster = await populatedSandbox(asAdmin, `J3.5 ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asAdmin);
		const studentId = roster.students.find((s) => s.name === STUDENT)!.id;
		const d1 = futureWeekday(8);
		const d2 = futureWeekday(9);

		// The student-schedule endpoint returns assignments in camelCase.
		type Assignment = { id: string; date: string; preceptorId: string };
		const scheduleFor = async (): Promise<Assignment[]> => {
			const res = await api.get<{ assignments: Assignment[] }>(
				`/api/students/${studentId}/schedule`
			);
			return res.data?.assignments ?? [];
		};

		// The list view is where each row carries its own Edit / Remove buttons.
		// EntityTabs does not restore the active tab from the URL, so reach the
		// Schedule tab by click; the list/calendar toggle is restored from `?view`.
		const gotoScheduleList = async () => {
			await asAdmin.goto(`/students/${studentId}?view=list`);
			await asAdmin.getByRole('tab', { name: 'Schedule' }).click();
			// If the calendar view is showing, switch to the list.
			const listToggle = asAdmin.getByRole('button', { name: 'List', exact: true });
			if (await listToggle.isVisible().catch(() => false)) await listToggle.click();
		};
		const rowEdit = () =>
			asAdmin.getByRole('row', { name: /Pediatrics/i }).getByRole('button', { name: 'Edit' });
		const rowRemove = () =>
			asAdmin.getByRole('row', { name: /Pediatrics/i }).getByRole('button', { name: 'Remove' });

		// --- Create a clean day ---
		await gotoScheduleList();
		let dialog = new AssignmentDialog(asAdmin);
		await dialog.open();
		await dialog.selectClerkship(CLERKSHIP);
		await dialog.selectPreceptor(PRECEPTOR);
		await dialog.pickDay(d1);
		await dialog.expectClean();
		await dialog.submitAndExpectCreated();

		let rows = await scheduleFor();
		expect(rows).toHaveLength(1);
		expect(rows[0].date).toBe(d1);
		const id = rows[0].id;

		// --- Move: Edit the row and pick a different clean day ---
		await gotoScheduleList();
		await expect(rowEdit()).toBeVisible({ timeout: 15000 });
		await rowEdit().click();
		dialog = new AssignmentDialog(asAdmin);
		await dialog.waitUntilOpen();
		await dialog.pickDay(d2);
		await dialog.submit(); // clean move
		await expect(asAdmin.getByText(/assignment updated/i).first()).toBeVisible({ timeout: 15000 });
		await expect(async () => {
			rows = await scheduleFor();
			expect(rows.find((r) => r.id === id)?.date ?? rows[0]?.date).toBe(d2);
		}).toPass({ timeout: 15000 });

		// --- Reassign: change the preceptor (accept any resulting override) ---
		// Both Pediatrics preceptors share Community Hospital, so the second is
		// offered without a site change.
		await gotoScheduleList();
		await expect(rowEdit()).toBeVisible({ timeout: 15000 });
		await rowEdit().click();
		dialog = new AssignmentDialog(asAdmin);
		await dialog.waitUntilOpen();
		await dialog.selectPreceptor(PRECEPTOR2);
		await dialog.submit({ prefer: [/assign anyway/i, /just this exception/i] });
		await expect(asAdmin.getByText(/assignment updated/i).first()).toBeVisible({ timeout: 15000 });
		const preceptor2Id = roster.preceptors.find((p) => p.name === PRECEPTOR2)!.id;
		await expect(async () => {
			rows = await scheduleFor();
			expect(rows[0]?.preceptorId).toBe(preceptor2Id);
		}).toPass({ timeout: 15000 });

		// --- Delete: Remove the row ---
		await gotoScheduleList();
		await expect(rowRemove()).toBeVisible({ timeout: 15000 });
		await rowRemove().click();
		const confirm = asAdmin
			.getByRole('dialog')
			.getByRole('button', { name: /remove|delete|confirm/i });
		if (await confirm.isVisible().catch(() => false)) await confirm.click();
		await expect(async () => {
			const r = await scheduleFor();
			expect(r).toHaveLength(0);
		}).toPass({ timeout: 15000 });
	});
});
