import { test, expect, type Page } from '@playwright/test';
import { login, ADMIN } from './helpers';

/**
 * Assignment + validation journeys (seeded admin). The seeded active schedule
 * ("My Schedule") runs 2026-07-01 → 2027-06-30, so in-range dates live in that
 * window. Freshly-created students are not onboarded to any health system, so a
 * fresh in-range assignment against a seeded preceptor raises exactly one soft
 * warning (not_onboarded) — which lets us verify revalidation once onboarding is
 * done.
 */

/** A random in-range date, varied so re-runs don't double-book a student. */
function inRangeDate() {
	const day = 6 + (Date.now() % 20); // 2026-09-06 .. 2026-09-25
	return `2026-09-${String(day).padStart(2, '0')}`;
}

async function openCreateDialog(page: Page, clerkshipIdx = 1, preceptorIdx = 1, date?: string) {
	await page.getByRole('button', { name: 'Add assignment' }).first().click();
	await expect(page.getByRole('heading', { name: 'Add assignment' })).toBeVisible();
	await expect(page.locator('#ca-clerkship option')).not.toHaveCount(1, { timeout: 20000 });
	await expect(page.locator('#ca-preceptor option')).not.toHaveCount(1, { timeout: 20000 });
	await page.locator('#ca-clerkship').selectOption({ index: clerkshipIdx });
	await page.locator('#ca-preceptor').selectOption({ index: preceptorIdx });
	await page.locator('#ca-date').fill(date ?? inRangeDate());
	await page.waitForTimeout(700); // debounced dry-run
}

async function createStudent(page: Page, name: string, email: string) {
	await page.goto('/students/new');
	await page.locator('#name').fill(name);
	await page.locator('#email').fill(email);
	await page.getByRole('button', { name: /^create$/i }).click();
	await expect(page).toHaveURL(/\/students$/);
}

test('assignment: create with a warning then remove it from the schedule', async ({ page }) => {
	await login(page, ADMIN);

	// A dedicated student keeps this test independent of others' assignments.
	const name = `E2E Assign ${Date.now()}`;
	await createStudent(page, name, `e2e_assign_${Date.now()}@example.com`);
	await page.getByRole('button', { name }).click();
	await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();

	const date = inRangeDate();
	await openCreateDialog(page, 1, 1, date);

	// The not-onboarded soft warning is shown; submit anyway.
	await expect(page.getByText(/has not completed onboarding/i)).toBeVisible();
	await page.getByRole('button', { name: /create anyway/i }).click();
	await expect(page.getByText(/assignment created/i)).toBeVisible({ timeout: 15000 });

	// It shows on the Schedule tab; remove it.
	await page.getByRole('tab', { name: 'Schedule' }).click();
	const row = page.locator('table tbody tr', { hasText: date });
	await expect(row).toBeVisible();
	await row.getByRole('button', { name: 'Remove' }).click();
	const confirm = page.getByRole('dialog');
	await expect(confirm.getByText('Remove assignment?')).toBeVisible();
	await confirm.getByRole('button', { name: 'Remove' }).click();
	await expect(page.locator('table tbody tr', { hasText: date })).toHaveCount(0);
});

test('assignment: completing onboarding clears the not-onboarded warning (revalidation)', async ({
	page
}) => {
	await login(page, ADMIN);

	const name = `E2E Onboard ${Date.now()}`;
	await createStudent(page, name, `e2e_onboard_${Date.now()}@example.com`);
	await page.getByRole('button', { name }).click();
	await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();

	// Before onboarding: the warning is present.
	await openCreateDialog(page, 1, 1, '2026-09-04');
	await expect(page.getByText(/has not completed onboarding/i)).toBeVisible();
	await page.getByRole('button', { name: 'Cancel' }).click();

	// Complete onboarding for every health system.
	await page.getByRole('tab', { name: 'Onboarding' }).click();
	const checkboxes = page.locator('input[type="checkbox"]');
	const count = await checkboxes.count();
	expect(count).toBeGreaterThan(0);
	for (let i = 0; i < count; i++) {
		const cb = checkboxes.nth(i);
		if (!(await cb.isChecked())) {
			await cb.check();
			await expect(page.getByText('Completed').first()).toBeVisible({ timeout: 10000 });
		}
	}

	// Reopen on a fresh in-range date: no onboarding warning, conflicts clear.
	await openCreateDialog(page, 1, 1, '2026-09-05');
	await expect(page.getByText(/has not completed onboarding/i)).toHaveCount(0);
	await expect(page.getByText('No conflicts.')).toBeVisible();
});
