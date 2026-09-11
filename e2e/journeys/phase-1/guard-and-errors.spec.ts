/**
 * J1.5 — Error surfacing and the unsaved-changes guard (e2e plan Phase 1).
 *
 * Errors must appear in context (inline/toast), never via a browser alert() and
 * never silently swallowed (spec R10.6). Runs on the seeded admin against a
 * sandbox so nothing seeded is disturbed.
 *
 * P1-e (spec R10.3 — unsaved-changes guard): the guard is now wired once via
 * FormShell in the app layout; forms register their dirty state through the
 * shared registry. The last test asserts navigating away from a dirty form
 * raises the in-app "Discard unsaved changes?" dialog (never a browser alert),
 * and that discarding proceeds while cancelling stays put.
 */

import { test, expect } from '../../fixtures';

test.describe('J1.5 error surfacing & unsaved changes', { tag: ['@stage1'] }, () => {
	test('a server-rejected schedule edit shows the error in the dialog, not an alert', async ({
		asAdmin,
		sandbox
	}) => {
		const box = await sandbox.create(asAdmin, { name: `Errs ${Date.now()}` });

		// Fail if the page ever raises a native dialog (alert/confirm) — R10.6.
		let nativeDialog = false;
		asAdmin.on('dialog', async (d) => {
			nativeDialog = true;
			await d.dismiss();
		});

		await asAdmin.goto('/schedules');
		const card = asAdmin.locator('[data-slot="card"]', { hasText: box.name });
		await card.getByRole('button', { name: 'Edit' }).click();
		const dialog = asAdmin.getByRole('dialog');
		// End before start → the PATCH endpoint rejects; the dialog shows the error
		// inline and stays open (no navigation, no toast success).
		await dialog.locator('#edit-start').fill('2030-06-01');
		await dialog.locator('#edit-end').fill('2030-01-01');
		await dialog.getByRole('button', { name: 'Save changes' }).click();

		await expect(dialog).toBeVisible();
		await expect(dialog.getByText(/date|invalid|before|after|failed/i).first()).toBeVisible({
			timeout: 10000
		});
		expect(nativeDialog).toBe(false);
	});

	test('a duplicate-name entity error is shown inline on its form', async ({
		asAdmin,
		sandbox
	}) => {
		await sandbox.create(asAdmin, { name: `Dup ${Date.now()}` });
		const name = `Dup Clerkship ${Date.now()}`;

		// First create succeeds.
		await asAdmin.goto('/clerkships/new');
		await asAdmin.locator('#name').fill(name);
		await asAdmin.locator('#required_days').fill('3');
		await asAdmin.getByRole('button', { name: /^create$/i }).click();
		await expect(asAdmin).toHaveURL(/\/clerkships$/, { timeout: 15000 });

		// Second create with the same name is refused in-context (no crash, no alert).
		await asAdmin.goto('/clerkships/new');
		await asAdmin.locator('#name').fill(name);
		await asAdmin.locator('#required_days').fill('3');
		await asAdmin.getByRole('button', { name: /^create$/i }).click();
		await expect(asAdmin.getByText(/already exists|duplicate|in use/i).first()).toBeVisible({
			timeout: 10000
		});
		await expect(asAdmin).toHaveURL(/\/clerkships\/new/);
	});

	// The availability builder's "Unsaved changes" indicator is exercised as part
	// of the full pattern-builder journey in Phase 2 (J2.2), where the multi-step
	// add flow is driven end to end rather than guessed at here.

	test('P1-e: navigating away from an unsaved form is guarded (R10.3)', async ({
		asAdmin,
		sandbox
	}) => {
		// Fail if the guard ever falls back to a native browser dialog (R10.6).
		let nativeDialog = false;
		asAdmin.on('dialog', async (d) => {
			nativeDialog = true;
			await d.dismiss();
		});

		await sandbox.create(asAdmin, { name: `Guard ${Date.now()}` });
		await asAdmin.goto('/students/new');
		await asAdmin.locator('#name').fill('Half Filled');
		await asAdmin.locator('#email').fill('half@example.com');

		// Navigating away via the sidebar is intercepted: the in-app discard dialog
		// appears and the page stays on the form.
		await asAdmin.getByRole('link', { name: 'Dashboard' }).click();
		const guard = asAdmin.getByRole('dialog');
		await expect(guard.getByText('Discard unsaved changes?')).toBeVisible({ timeout: 10000 });
		await expect(asAdmin).toHaveURL(/\/students\/new/);

		// Cancelling keeps the edits and stays on the form.
		await guard.getByRole('button', { name: /keep|cancel/i }).click();
		await expect(asAdmin.getByText('Discard unsaved changes?')).toHaveCount(0);
		await expect(asAdmin).toHaveURL(/\/students\/new/);
		await expect(asAdmin.locator('#name')).toHaveValue('Half Filled');

		// Trying again and discarding proceeds to the destination.
		await asAdmin.getByRole('link', { name: 'Dashboard' }).click();
		const guard2 = asAdmin.getByRole('dialog');
		await expect(guard2.getByText('Discard unsaved changes?')).toBeVisible({ timeout: 10000 });
		await guard2.getByRole('button', { name: 'Discard changes' }).click();
		await expect(asAdmin).toHaveURL(/\/dashboard/, { timeout: 10000 });

		expect(nativeDialog).toBe(false);
	});
});
