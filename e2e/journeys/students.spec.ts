import { test, expect } from '@playwright/test';
import { login, ADMIN } from './helpers';

/**
 * Student journeys (seeded admin): create, edit via the Details tab, delete, and
 * see the duplicate-email guard.
 */

function uniqEmail() {
	return `e2e_student_${Date.now()}_${Math.floor(Math.random() * 1e5)}@example.com`;
}

test('students: create, edit, and delete', async ({ page }) => {
	await login(page, ADMIN);

	const name = `E2E Student ${Date.now()}`;
	const renamed = `${name} Jr`;
	const email = uniqEmail();

	// --- Create ---
	await page.goto('/students');
	await expect(page.getByRole('heading', { name: 'Students' })).toBeVisible();
	await page.getByRole('link', { name: 'Add Student' }).click();
	await expect(page).toHaveURL(/\/students\/new/);
	await page.locator('#name').fill(name);
	await page.locator('#email').fill(email);
	await page.getByRole('button', { name: /^create$/i }).click();

	await expect(page).toHaveURL(/\/students$/);
	await expect(page.getByRole('button', { name })).toBeVisible();

	// --- Edit via the Details tab ---
	await page.getByRole('button', { name }).click();
	await expect(page.getByRole('tab', { name: 'Details' })).toBeVisible();
	await page.getByRole('tab', { name: 'Details' }).click();
	await page.locator('#name').fill(renamed);
	await page.getByRole('button', { name: /^update$/i }).click();
	await expect(page.getByText('Student updated')).toBeVisible({ timeout: 10000 });

	// --- Delete from the list ---
	await page.goto('/students');
	const row = page.locator('tr', { hasText: renamed });
	await expect(row).toBeVisible();
	await row.getByRole('button', { name: 'Delete' }).click();
	const dialog = page.locator('div.fixed', { hasText: 'Delete Student' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^delete$/i }).click();
	await expect(page.locator('tr', { hasText: renamed })).toHaveCount(0);
});

test('students: duplicate email is rejected', async ({ page }) => {
	await login(page, ADMIN);

	const email = uniqEmail();

	// Create once.
	await page.goto('/students/new');
	await page.locator('#name').fill(`E2E Dup A ${Date.now()}`);
	await page.locator('#email').fill(email);
	await page.getByRole('button', { name: /^create$/i }).click();
	await expect(page).toHaveURL(/\/students$/);

	// Same email again → conflict surfaced inline, stays on the form.
	await page.goto('/students/new');
	await page.locator('#name').fill(`E2E Dup B ${Date.now()}`);
	await page.locator('#email').fill(email);
	await page.getByRole('button', { name: /^create$/i }).click();

	await expect(page).toHaveURL(/\/students\/new/);
	await expect(page.getByText(/already exists/i)).toBeVisible();
});
