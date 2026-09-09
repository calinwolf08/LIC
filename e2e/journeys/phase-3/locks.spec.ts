/**
 * J3.8 — Locks are a Stage 2 (entitled) capability (e2e plan Phase 3).
 *
 * Entitled tier: the dialog offers a lock control; a locked manual day persists
 * `locked = 1`, shows the 🔒 in the list, and can be unlocked again.
 *
 * Basic tier: there is no lock control in the dialog, and the API silently
 * ignores a `locked` field on an update (locking is gated on `autogen`).
 */

import { test, expect, apiOf, fromToday, assignmentsForSchedule } from '../../fixtures';
import { AssignmentDialog } from '../../pages';
import { populatedSandbox } from './helpers';

function futureWeekday(atLeast: number): string {
	let n = atLeast;
	for (;;) {
		const dow = new Date(`${fromToday(n)}T00:00:00Z`).getUTCDay();
		if (dow !== 0 && dow !== 6) return fromToday(n);
		n++;
	}
}

test.describe('J3.8 manual scheduling — locks per tier', { tag: ['@stage2'] }, () => {
	test('entitled: a manual day can be locked and unlocked', async ({ asAdmin, sandbox, db }) => {
		test.setTimeout(180000);
		const roster = await populatedSandbox(asAdmin, `J3.8 lock ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const studentId = roster.students.find((s) => s.name === 'Alice Johnson')!.id;
		const day = futureWeekday(8);

		// Reach the Schedule tab's list view (rows carry Edit + the 🔒 marker).
		const gotoScheduleList = async () => {
			await asAdmin.goto(`/students/${studentId}?view=list`);
			await asAdmin.getByRole('tab', { name: 'Schedule' }).click();
			const listToggle = asAdmin.getByRole('button', { name: 'List', exact: true });
			if (await listToggle.isVisible().catch(() => false)) await listToggle.click();
		};
		const row = () => asAdmin.getByRole('row', { name: /Family Medicine/i });

		// --- Create a locked day ---
		await gotoScheduleList();
		let dialog = new AssignmentDialog(asAdmin);
		await dialog.open();
		expect(await dialog.hasLockControl(), 'entitled tier shows the lock control').toBe(true);
		await dialog.selectClerkship('Family Medicine');
		await dialog.selectPreceptor('Dr. Amanda Smith');
		await dialog.pickDay(day);
		await dialog.expectClean();
		await dialog.setLock(true);
		await dialog.submitAndExpectCreated();

		// DB: the row is locked; the list shows the 🔒.
		let rows = await assignmentsForSchedule(db, roster.sandbox.id);
		expect(rows.find((r) => r.date === day)?.locked).toBe(1);
		await gotoScheduleList();
		await expect(row()).toContainText('🔒');

		// --- Unlock via the edit dialog ---
		await row().getByRole('button', { name: 'Edit' }).click();
		dialog = new AssignmentDialog(asAdmin);
		await dialog.waitUntilOpen();
		await dialog.setLock(false);
		await dialog.submit();
		await expect(asAdmin.getByText(/assignment updated/i).first()).toBeVisible({ timeout: 15000 });
		await expect(async () => {
			rows = await assignmentsForSchedule(db, roster.sandbox.id);
			expect(rows.find((r) => r.date === day)?.locked).toBe(0);
		}).toPass({ timeout: 15000 });
	});

	test('basic: no lock control, and the API ignores a locked update', async ({
		asBasic,
		sandbox,
		db
	}) => {
		test.setTimeout(180000);
		// Basic tier's roster is the (isolated) Tenant B schedule.
		const roster = await populatedSandbox(asBasic, `J3.8 basic ${Date.now()}`);
		sandbox.register(roster.sandbox);
		const api = apiOf(asBasic);
		const student = roster.students[0];
		const preceptor = roster.preceptors[0];
		const clerkship = roster.clerkships[0];
		const site = roster.sites[0];
		const day = futureWeekday(8);

		// The dialog offers no lock control without the entitlement.
		await asBasic.goto(`/students/${student.id}`);
		const dialog = new AssignmentDialog(asBasic);
		await dialog.open();
		expect(await dialog.hasLockControl(), 'basic tier has no lock control').toBe(false);
		await dialog.cancel();

		// Create an assignment through the API (accept any soft codes it trips).
		const created = await api.post('/api/schedules/assignments', {
			student_id: student.id,
			preceptor_id: preceptor.id,
			clerkship_id: clerkship.id,
			site_id: site.id,
			date: day,
			override_codes: ['preceptor_unavailable', 'not_onboarded', 'no_availability_record']
		});
		expect(
			created.ok,
			`basic create failed: ${JSON.stringify(created.error ?? created.data)}`
		).toBe(true);

		const rows = await assignmentsForSchedule(db, roster.sandbox.id);
		const rowId = rows.find((r) => r.date === day)?.id;
		expect(rowId).toBeTruthy();

		// PATCH with locked:true — silently ignored for a non-entitled caller.
		await api.patch(`/api/schedules/assignments/${rowId}`, { locked: true });
		const after = await api.get<{ locked: number }>(`/api/schedules/assignments/${rowId}`);
		expect(after.data?.locked).toBe(0);
	});
});
