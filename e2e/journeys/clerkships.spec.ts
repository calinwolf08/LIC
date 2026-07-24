import { test, expect } from '@playwright/test';
import { login, ADMIN } from './helpers';

/**
 * Clerkship journeys (seeded admin): create via the full-page form, drill into
 * its config page, delete from the list, and see the duplicate-name guard.
 */

function uniq(prefix: string) {
	return `${prefix} ${Date.now()}_${Math.floor(Math.random() * 1e5)}`;
}

test('clerkships: create, configure, and delete', async ({ page }) => {
	await login(page, ADMIN);

	const name = uniq('E2E Clerkship');

	// --- Create ---
	await page.goto('/clerkships');
	await expect(page.getByRole('heading', { name: 'Clerkships' })).toBeVisible();
	await page.getByRole('button', { name: 'Add Clerkship' }).click();
	await expect(page).toHaveURL(/\/clerkships\/new/);
	await page.locator('#name').fill(name);
	await page.locator('#required_days').fill('7');
	await page.getByRole('button', { name: /^create$/i }).click();

	await expect(page).toHaveURL(/\/clerkships$/);
	const row = page.locator('tr', { hasText: name });
	await expect(row).toBeVisible();
	await expect(row.getByRole('cell', { name: '7', exact: true })).toBeVisible();

	// --- Configure (drill-through to the detail page) ---
	await row.getByRole('button', { name: 'Configure' }).click();
	await expect(page).toHaveURL(/\/clerkships\/[^/]+$/);
	await expect(page.getByRole('heading', { name, exact: false }).first()).toBeVisible();

	// --- Delete from the list ---
	await page.goto('/clerkships');
	const row2 = page.locator('tr', { hasText: name });
	await row2.getByRole('button', { name: 'Delete' }).click();
	const dialog = page.locator('div.fixed', { hasText: 'Delete Clerkship' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^delete$/i }).click();
	await expect(page.locator('tr', { hasText: name })).toHaveCount(0);
});

test('clerkships: duplicate name is rejected', async ({ page }) => {
	await login(page, ADMIN);

	const name = uniq('E2E Unique Clerkship');

	// Create it once.
	await page.goto('/clerkships/new');
	await page.locator('#name').fill(name);
	await page.locator('#required_days').fill('3');
	await page.getByRole('button', { name: /^create$/i }).click();
	await expect(page).toHaveURL(/\/clerkships$/);
	await expect(page.locator('tr', { hasText: name })).toBeVisible();

	// Create again with the same name → API returns a conflict, surfaced inline.
	await page.goto('/clerkships/new');
	await page.locator('#name').fill(name);
	await page.locator('#required_days').fill('3');
	await page.getByRole('button', { name: /^create$/i }).click();

	// Stays on the form and shows an error (name already exists).
	await expect(page).toHaveURL(/\/clerkships\/new/);
	await expect(page.getByText(/already exists/i)).toBeVisible();
});
