import { test, expect } from '@playwright/test';
import { login, ADMIN } from './helpers';

/**
 * Preceptor journeys (seeded admin): create through the 3-step wizard and then
 * remove the preceptor from the list.
 */

test('preceptors: create through the wizard, then delete', async ({ page }) => {
	await login(page, ADMIN);

	const name = `Dr. E2E ${Date.now()}`;
	const email = `e2e_preceptor_${Date.now()}@example.com`;

	await page.goto('/preceptors');
	await page.getByRole('button', { name: 'Add Preceptor' }).click();
	await expect(page).toHaveURL(/\/preceptors\/new/);

	// Step 1: basic info.
	await expect(page.getByRole('heading', { name: 'Basic Information' })).toBeVisible();
	await page.locator('#name').fill(name);
	await page.locator('#email').fill(email);
	await page.getByRole('button', { name: /next/i }).click();

	// Step 2: sites are optional — create the preceptor without one.
	await expect(page.getByRole('heading', { name: 'Health System & Sites' })).toBeVisible();
	await page.getByRole('button', { name: /create & continue/i }).click();

	// Step 3: created; with no sites we're offered a link to the list.
	await expect(page.getByText(`${name}`)).toBeVisible({ timeout: 15000 });
	await page.getByRole('button', { name: /go to preceptors list/i }).click();
	await expect(page).toHaveURL(/\/preceptors$/);

	// The new preceptor is listed.
	const row = page.locator('tr', { hasText: name });
	await expect(row).toBeVisible();

	// --- Delete ---
	await row.getByRole('button', { name: 'Delete' }).click();
	const dialog = page.locator('div.fixed', { hasText: 'Delete Preceptor' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^delete$/i }).click();
	await expect(page.locator('tr', { hasText: name })).toHaveCount(0);
});
