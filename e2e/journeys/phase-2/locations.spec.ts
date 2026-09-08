/**
 * J2.1 — Locations hierarchy with dependencies (e2e plan Phase 2).
 *
 * The health-system → site → preceptor chain, deleted bottom-up. A site linked
 * to a preceptor cannot be deleted (the API refuses, surfaced in-context); a
 * health system with a site cannot be deleted (the confirm dialog names the
 * dependency and disables the button). Removing the dependency unblocks each
 * delete. Runs in a sandbox so the seeded locations are never touched.
 */

import { test, expect } from '../../fixtures';
import { openDialog, openCustomModal } from './helpers';

test.describe('J2.1 locations & dependencies', { tag: ['@stage1'] }, () => {
	test('build HS → site → preceptor, then delete bottom-up with dependency blocks', async ({
		asAdmin,
		sandbox
	}) => {
		test.setTimeout(120000);
		await sandbox.create(asAdmin, { name: `Loc ${Date.now()}` });
		const stamp = Date.now();
		const hs = `HS ${stamp}`;
		const site = `Site ${stamp}`;
		const preceptor = `Dr. Loc ${stamp}`;

		// --- Add a health system (dialog from the list) ---
		await asAdmin.goto('/locations');
		let dialog = await openDialog(asAdmin, 'Add health system');
		await dialog.locator('#name').fill(hs);
		await dialog.getByRole('button', { name: 'Create' }).click();
		await expect(asAdmin.locator('tr', { hasText: hs })).toBeVisible();

		// --- Add a site in that health system ---
		await asAdmin.getByRole('tab', { name: 'Sites' }).click();
		dialog = await openDialog(asAdmin, 'Add site');
		await dialog.locator('#name').fill(site);
		await dialog.locator('#health_system_id').selectOption({ label: hs });
		await dialog.getByRole('button', { name: 'Create Site' }).click();
		await expect(asAdmin.locator('tr', { hasText: site })).toBeVisible();

		// A duplicate site name in the same health system is refused in-context.
		dialog = await openDialog(asAdmin, 'Add site');
		await dialog.locator('#name').fill(site);
		await dialog.locator('#health_system_id').selectOption({ label: hs });
		await dialog.getByRole('button', { name: 'Create Site' }).click();
		await expect(dialog.getByText(/already exists/i)).toBeVisible({ timeout: 10000 });
		await dialog.getByRole('button', { name: /cancel/i }).click();

		// --- Add a preceptor linked to that site (via the wizard) ---
		await asAdmin.goto('/preceptors/new');
		await asAdmin.locator('#name').fill(preceptor);
		await asAdmin.locator('#email').fill(`loc_prec_${stamp}@example.com`);
		await asAdmin.locator('#max_students').fill('2');
		await asAdmin.getByRole('button', { name: /next/i }).click();
		await asAdmin.locator('#health_system_id').selectOption({ label: hs });
		const siteCheckbox = asAdmin.getByRole('checkbox').first();
		await expect(siteCheckbox).toBeVisible();
		await siteCheckbox.check();
		await asAdmin.getByRole('button', { name: /create & continue/i }).click();
		const skip = asAdmin.getByRole('button', { name: /skip for now/i });
		const goList = asAdmin.getByRole('button', { name: /go to preceptors list/i });
		await expect(skip.or(goList)).toBeVisible({ timeout: 15000 });
		if (await skip.isVisible().catch(() => false)) await skip.click();
		else await goList.click();

		// --- Deleting the site is blocked: its dialog names the preceptor and
		// disables the confirm (the dialog pre-checks dependencies). ---
		await asAdmin.goto('/locations?tab=sites');
		const siteRow = asAdmin.locator('tr', { hasText: site });
		await expect(siteRow).toBeVisible();
		let siteModal = await openCustomModal(
			asAdmin,
			siteRow.getByRole('button', { name: /delete/i }),
			'Delete Site'
		);
		await expect(siteModal.getByText(/cannot delete/i)).toBeVisible({ timeout: 10000 });
		await expect(siteModal.getByText(/preceptor/i)).toBeVisible();
		await expect(siteModal.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
		await siteModal.getByRole('button', { name: 'Cancel' }).click();

		// --- Deleting the health system is blocked: the row's Delete button is
		// disabled and its tooltip names the dependencies. ---
		await asAdmin.getByRole('tab', { name: 'Health systems' }).click();
		const hsRow = asAdmin.locator('tr', { hasText: hs });
		const hsDeleteBtn = hsRow.getByRole('button', { name: /delete/i });
		await expect(hsDeleteBtn).toBeDisabled();
		await expect(hsDeleteBtn).toHaveAttribute('title', /cannot delete[\s\S]*(site|preceptor)/i, {
			timeout: 10000
		});

		// --- Resolve bottom-up: delete the preceptor (from the list) to drop the
		// site link, which then unblocks the site delete. ---
		await asAdmin.goto('/preceptors');
		const precRow = asAdmin.locator('tr', { hasText: preceptor });
		await expect(precRow).toBeVisible({ timeout: 15000 });
		const precModal = await openCustomModal(
			asAdmin,
			precRow.getByRole('button', { name: 'Delete' }),
			'Delete Preceptor'
		);
		await precModal.getByRole('button', { name: 'Delete', exact: true }).click();
		await expect(asAdmin.locator('tr', { hasText: preceptor })).toHaveCount(0, { timeout: 15000 });

		// Now the site deletes cleanly (dialog shows no blocking dependency).
		await asAdmin.goto('/locations?tab=sites');
		siteModal = await openCustomModal(
			asAdmin,
			asAdmin.locator('tr', { hasText: site }).getByRole('button', { name: /delete/i }),
			'Delete Site'
		);
		const siteDeleteBtn = siteModal.getByRole('button', { name: 'Delete', exact: true });
		await expect(siteDeleteBtn).toBeEnabled({ timeout: 10000 });
		await siteDeleteBtn.click();
		await expect(asAdmin.locator('tr', { hasText: site })).toHaveCount(0, { timeout: 10000 });

		// And the health system deletes cleanly too: with no dependents the row
		// Delete button enables and opens the confirm dialog.
		await asAdmin.getByRole('tab', { name: 'Health systems' }).click();
		const hsRow2Delete = asAdmin
			.locator('tr', { hasText: hs })
			.getByRole('button', { name: /delete/i });
		await expect(hsRow2Delete).toBeEnabled({ timeout: 10000 });
		await hsRow2Delete.click();
		const hsDialog2 = asAdmin.getByRole('dialog');
		await expect(hsDialog2.getByText(/depend on this health system/i)).toHaveCount(0);
		await hsDialog2.getByRole('button', { name: 'Delete' }).click();
		await expect(asAdmin.locator('tr', { hasText: hs })).toHaveCount(0, { timeout: 10000 });
	});

	test('creating a site without a health system is refused in-context (@both: basic)', async ({
		asBasic
	}) => {
		await asBasic.goto('/locations?tab=sites');
		const dialog = await openDialog(asBasic, 'Add site');
		await dialog.locator('#name').fill(`No HS ${Date.now()}`);
		// Leave the health system unset → the form must not silently create.
		await dialog.getByRole('button', { name: 'Create Site' }).click();
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText(/health system|required/i).first()).toBeVisible({
			timeout: 10000
		});
	});
});
