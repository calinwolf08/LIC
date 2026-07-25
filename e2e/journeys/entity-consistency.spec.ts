import { test, expect } from '@playwright/test';
import { login, ADMIN, SEED_SCHEDULE } from './helpers';

/**
 * Steps 22 & 23 — entity consistency ("Manage" + read-only overviews) and the
 * navigation cleanup (Schedules folds into the switcher).
 */

test('sidebar drops "Schedules"; the switcher offers "Manage schedules"', async ({ page }) => {
	await login(page, ADMIN);
	await page.goto('/dashboard');

	// The sidebar nav no longer has a Schedules item, but the others remain.
	await expect(page.locator('nav a[href="/schedules"]')).toHaveCount(0);
	await expect(page.locator('nav a[href="/calendar"]')).toHaveCount(1);
	await expect(page.locator('nav a[href="/students"]')).toHaveCount(1);

	// The schedule switcher exposes "Manage schedules" → /schedules.
	await page.getByRole('button', { name: SEED_SCHEDULE.name }).click();
	const manage = page.getByRole('link', { name: 'Manage schedules' });
	await expect(manage).toBeVisible();
	await manage.click();
	await expect(page).toHaveURL(/\/schedules$/);
});

test('sites: Manage opens a detail page (no edit popup), editable on Details', async ({ page }) => {
	await login(page, ADMIN);

	const name = `E2E MSite ${Date.now()}`;
	const renamed = `${name} edited`;

	// Create a site via the (create-only) dialog on /locations.
	await page.goto('/locations');
	await page.getByRole('tab', { name: 'Sites' }).click();
	await page.getByRole('button', { name: 'Add site' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.locator('#name').fill(name);
	await dialog.locator('#health_system_id').selectOption({ label: 'Metro Health Network' });
	await dialog.getByRole('button', { name: 'Create Site' }).click();

	const row = page.locator('tr', { hasText: name });
	await expect(row).toBeVisible();

	// Manage navigates to the detail page — there is no row-level edit dialog.
	await expect(row.getByRole('button', { name: 'Edit' })).toHaveCount(0);
	await row.getByRole('button', { name: 'Manage' }).click();
	await expect(page).toHaveURL(/\/sites\/[^/]+$/);

	// Overview shows the details read-only, with a route to editing.
	await expect(page.getByRole('heading', { name: 'Site details' })).toBeVisible();
	await page.getByRole('button', { name: 'Edit details' }).click();

	// Details tab edits the record. Assert on the persisted name in the page
	// header rather than the success toast, which auto-dismisses.
	await page.locator('#name').fill(renamed);
	await page.getByRole('button', { name: 'Update Site' }).click();
	await expect(page.getByRole('heading', { name: renamed })).toBeVisible({ timeout: 10000 });

	// Clean up via the danger zone.
	await page.getByRole('tab', { name: 'Details' }).click();
	await page.getByRole('button', { name: 'Delete site' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Delete site' }).click();
	await expect(page).toHaveURL(/\/locations/);
});

test('sites: creating without a health system shows an inline error, not a silent failure', async ({
	page
}) => {
	await login(page, ADMIN);

	// A site belongs to a health system. Submitting without one used to hit a
	// NOT NULL/FK violation and return an opaque 500, so the dialog just sat
	// there with no explanation.
	await page.goto('/locations');
	await page.getByRole('tab', { name: 'Sites' }).click();
	await page.getByRole('button', { name: 'Add site' }).click();

	const dialog = page.getByRole('dialog');
	await dialog.locator('#name').fill(`E2E NoHS ${Date.now()}`);
	await dialog.getByRole('button', { name: 'Create Site' }).click();

	// The dialog stays open (nothing was created) and says what is wrong.
	// `exact` avoids matching the "Select a health system…" placeholder option.
	await expect(dialog.getByText('Select a health system', { exact: true })).toBeVisible({
		timeout: 10000
	});
	await expect(dialog.getByRole('button', { name: 'Create Site' })).toBeVisible();

	// The API rejects it as a validation error, not a server error.
	const res = await page.request.post('/api/sites', {
		data: { name: `E2E NoHS API ${Date.now()}`, health_system_id: '' }
	});
	expect(res.status()).toBe(400);
});

test('student overview shows identity read-only with a route to Details', async ({ page }) => {
	await login(page, ADMIN);

	// Open a seeded student.
	await page.goto('/students');
	await page.locator('table tbody tr').first().locator('button').first().click();
	await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();

	// The Overview surfaces name + email read-only.
	await expect(page.getByRole('heading', { name: 'Student details' })).toBeVisible();

	// "Edit details" switches to the editable Details tab.
	await page.getByRole('button', { name: 'Edit details' }).click();
	await expect(page.getByRole('tab', { name: 'Details', selected: true })).toBeVisible();
	await expect(page.locator('#email')).toBeVisible();
});

test('entity lists use "Manage" (not "View"/"Configure")', async ({ page }) => {
	await login(page, ADMIN);

	await page.goto('/students');
	await expect(page.locator('table tbody tr').first().getByRole('button', { name: 'Manage' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'View' })).toHaveCount(0);

	await page.goto('/clerkships');
	await expect(page.locator('table tbody tr').first().getByRole('button', { name: 'Manage' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Configure' })).toHaveCount(0);
});
