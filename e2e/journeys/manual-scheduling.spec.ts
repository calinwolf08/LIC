import { test, expect } from '@playwright/test';
import { login, ADMIN } from './helpers';

/**
 * Manual scheduling journey (seeded admin): open a student, add an assignment
 * from their page, and see it on their schedule.
 */
test('manual scheduling: add an assignment from a student page', async ({ page }) => {
	await login(page, ADMIN);

	// Open the first student.
	await page.goto('/students');
	await expect(page.getByRole('heading', { name: 'Students' })).toBeVisible();
	const firstStudent = page.locator('table tbody tr').first().locator('button').first();
	await firstStudent.click();
	await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();

	// Open the create-assignment dialog.
	await page.getByRole('button', { name: 'Add assignment' }).first().click();
	await expect(page.getByRole('heading', { name: 'Add assignment' })).toBeVisible();

	// Wait for the async option lists to load (can be slow on a cold server),
	// then choose a clerkship + preceptor (student is pre-filled & locked).
	await expect(page.locator('#ca-clerkship option')).not.toHaveCount(1, { timeout: 20000 });
	await expect(page.locator('#ca-preceptor option')).not.toHaveCount(1, { timeout: 20000 });
	await page.locator('#ca-clerkship').selectOption({ index: 1 });
	await page.locator('#ca-preceptor').selectOption({ index: 1 });
	// Vary the offset so re-runs against a non-fresh DB don't double-book the
	// same student on the same date (still well within the year-long schedule).
	const offsetDays = 30 + (Date.now() % 180);
	const iso = new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
	await page.locator('#ca-date').fill(iso);

	// Let the debounced dry-run validation settle, then submit. Seeded students
	// aren't onboarded, so a soft warning ("Create anyway") is expected.
	await page.waitForTimeout(700);
	const anyway = page.getByRole('button', { name: /create anyway/i });
	if (await anyway.count()) {
		await anyway.click();
	} else {
		await page.getByRole('button', { name: /^create$/i }).click();
	}

	// A success toast appears.
	await expect(page.getByText(/assignment created/i)).toBeVisible({ timeout: 15000 });

	// The Schedule tab lists the new assignment.
	await page.getByRole('tab', { name: 'Schedule' }).click();
	await expect(page.locator('table tbody tr')).not.toHaveCount(0);
});
