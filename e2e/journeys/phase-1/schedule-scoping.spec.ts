/**
 * J1.3 — Schedule scoping is real (e2e plan Phase 1).
 *
 * A schedule owns its own membership: an entity added to schedule A but not B is
 * invisible in B, on every surface and through the API in the same session. The
 * sidebar switcher reflects a rename live. Cross-tenant activation is refused.
 *
 * Built on the seeded admin, whose Demo Schedule already has students,
 * preceptors and clerkships; we add a second sandbox schedule to compare.
 */

import { test, expect, apiOf } from '../../fixtures';

test.describe('J1.3 schedule scoping', { tag: ['@stage1', '@tenant'] }, () => {
	test('an entity in one schedule is invisible in another; rename updates the switcher live', async ({
		asAdmin,
		sandbox
	}) => {
		test.setTimeout(120000);
		const api = apiOf(asAdmin);

		// Baseline: the seeded Demo Schedule has students.
		const demoStudents = await api.get<Array<{ id: string; name: string }>>('/api/students');
		expect(demoStudents.ok).toBe(true);
		expect(demoStudents.data!.length).toBeGreaterThan(0);

		// A fresh sandbox schedule starts with NO members, even though the same
		// entities exist in the account.
		const box = await sandbox.create(asAdmin, { name: `Scoping ${Date.now()}` });
		const boxStudents = await api.get<Array<{ id: string }>>('/api/students');
		expect(boxStudents.data ?? []).toHaveLength(0);

		// The calendar in the sandbox shows nothing scheduled and no chips.
		await asAdmin.goto('/calendar?view=list');
		await expect(asAdmin.getByRole('button', { name: 'Add assignment' })).toBeVisible({
			timeout: 20000
		});
		await expect(
			asAdmin.getByText(/no assignments found|no data to display/i).first()
		).toBeVisible();

		// Rename the sandbox on the schedules page → the sidebar switcher reflects
		// it without a manual reload.
		const renamed = `${box.name} (renamed)`;
		await asAdmin.goto('/schedules');
		const card = asAdmin.locator('[data-slot="card"]', { hasText: box.name });
		await card.getByRole('button', { name: 'Edit' }).click();
		const dialog = asAdmin.getByRole('dialog');
		await dialog.locator('#edit-name').fill(renamed);
		await dialog.getByRole('button', { name: 'Save changes' }).click();
		await expect(asAdmin.getByTestId('schedule-switcher')).toContainText(renamed, {
			timeout: 15000
		});
	});

	test("cross-tenant activation of another user's schedule is refused (404)", async ({
		asAdmin,
		asBasic
	}) => {
		// Discover tenant B's active schedule id from B's own session.
		const bActive = await apiOf(asBasic).get<{ schedule?: { id: string } }>(
			'/api/user/active-schedule'
		);
		const bScheduleId = bActive.data?.schedule?.id;
		expect(bScheduleId, 'basic user should have an active schedule').toBeTruthy();

		// Admin tries to activate tenant B's schedule → refused, and admin's own
		// active schedule is unchanged.
		const before = await apiOf(asAdmin).get<{ schedule?: { id: string } }>(
			'/api/user/active-schedule'
		);
		const attempt = await apiOf(asAdmin).put('/api/user/active-schedule', {
			scheduleId: bScheduleId
		});
		expect(attempt.status).toBe(404);
		const after = await apiOf(asAdmin).get<{ schedule?: { id: string } }>(
			'/api/user/active-schedule'
		);
		expect(after.data?.schedule?.id).toBe(before.data?.schedule?.id);
	});
});
