import { test, expect, type Page } from '@playwright/test';
import { login, ADMIN } from './helpers';

/**
 * Locations journeys (seeded admin): health systems and sites are managed via
 * dialogs on /locations. Covers create → edit → delete for a health system, and
 * the dependency guard that blocks deleting a health system that still has sites.
 */

/** Unique suffix so parallel/re-runs against the shared DB never collide. */
function uniq(prefix: string) {
	return `${prefix} ${Date.now()}_${Math.floor(Math.random() * 1e5)}`;
}

async function openHealthSystemsTab(page: Page) {
	await page.goto('/locations');
	await expect(page.getByRole('heading', { name: 'Locations' })).toBeVisible();
	// Health systems is the default tab.
}

test('locations: create, edit, and delete a health system', async ({ page }) => {
	await login(page, ADMIN);
	await openHealthSystemsTab(page);

	const name = uniq('E2E Health System');
	const renamed = `${name} (renamed)`;

	// --- Create ---
	await page.getByRole('button', { name: 'Add health system' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByText('Add health system')).toBeVisible();
	await dialog.locator('#name').fill(name);
	await dialog.locator('#location').fill('Testville, TS');
	await dialog.getByRole('button', { name: 'Create' }).click();

	const row = page.locator('tr', { hasText: name });
	await expect(row).toBeVisible();

	// --- Edit ---
	await row.getByRole('button', { name: 'Edit' }).click();
	const editDialog = page.getByRole('dialog');
	await expect(editDialog.getByText('Edit health system')).toBeVisible();
	await editDialog.locator('#name').fill(renamed);
	await editDialog.getByRole('button', { name: 'Update' }).click();

	const renamedRow = page.locator('tr', { hasText: renamed });
	await expect(renamedRow).toBeVisible();

	// --- Delete (no dependencies, so the Delete button is enabled) ---
	const deleteBtn = renamedRow.getByRole('button', { name: 'Delete' });
	await expect(deleteBtn).toBeEnabled({ timeout: 15000 });
	await deleteBtn.click();

	const confirm = page.getByRole('dialog');
	await expect(confirm.getByText(`Delete ${renamed}?`)).toBeVisible();
	await confirm.getByRole('button', { name: 'Delete' }).click();

	await expect(page.locator('tr', { hasText: renamed })).toHaveCount(0);
});

test('locations: a health system with a site cannot be deleted', async ({ page }) => {
	await login(page, ADMIN);
	await openHealthSystemsTab(page);

	const hsName = uniq('E2E Guarded HS');
	const siteName = uniq('E2E Guarded Site');

	// Create the health system.
	await page.getByRole('button', { name: 'Add health system' }).click();
	let dialog = page.getByRole('dialog');
	await dialog.locator('#name').fill(hsName);
	await dialog.getByRole('button', { name: 'Create' }).click();
	await expect(page.locator('tr', { hasText: hsName })).toBeVisible();

	// Add a site under that health system.
	await page.getByRole('tab', { name: 'Sites' }).click();
	await page.getByRole('button', { name: 'Add site' }).click();
	dialog = page.getByRole('dialog');
	await expect(dialog.getByText('Add site')).toBeVisible();
	await dialog.locator('#name').fill(siteName);
	await dialog.locator('#health_system_id').selectOption({ label: hsName });
	await dialog.getByRole('button', { name: 'Create Site' }).click();
	await expect(page.locator('tr, li, div', { hasText: siteName }).first()).toBeVisible();

	// Back on the health systems tab, the Delete button for that HS is disabled.
	await page.getByRole('tab', { name: 'Health systems' }).click();
	const row = page.locator('tr', { hasText: hsName });
	await expect(row).toBeVisible();
	const deleteBtn = row.getByRole('button', { name: 'Delete' });
	await expect(deleteBtn).toBeDisabled({ timeout: 15000 });
	// It surfaces the dependency to the user.
	await expect(row.getByText(/site/i)).toBeVisible();
});
