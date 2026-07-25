import { test, expect } from '@playwright/test';
import { registerNewUser, fromToday, monthStart, monthEnd } from './helpers';
import {
	openAssignmentDialog,
	selectClerkship,
	selectPreceptor,
	pickDay,
	submitAcceptingOverrides
} from './assignment-helpers';

/**
 * Step 24 — "fresh signup to first valid assignment".
 *
 * Mirrors the session that produced the Round 2 bug list: a brand-new account
 * with an empty database, setting the schedule range, building every entity,
 * onboarding the student, and making one assignment that validates cleanly.
 *
 * Unlike the seeded journeys this starts from nothing, so it catches
 * first-run-only breakage (the empty-state paths, the auto-created schedule,
 * and the range plumbing from step 15).
 */
test('fresh signup: set up a schedule and make a clean first assignment', async ({ page }) => {
	test.setTimeout(180000);

	const stamp = Date.now();
	const scheduleName = `Fresh Schedule ${stamp}`;
	const hs = `Fresh HS ${stamp}`;
	const site = `Fresh Site ${stamp}`;
	const preceptor = `Dr. Fresh ${stamp}`;
	const clerkship = `Fresh Clerkship ${stamp}`;
	const student = `Fresh Student ${stamp}`;

	await registerNewUser(page);

	// --- 1. Rename + re-range the auto-created schedule ---
	// A two-month window starting this month, so the range is deliberately much
	// narrower than a calendar year (the step 15 regression).
	await page.goto('/schedules');
	const card = page.locator('[data-slot="card"]').first();
	await card.getByRole('button', { name: 'Edit' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.locator('#edit-name').fill(scheduleName);
	await dialog.locator('#edit-start').fill(monthStart(0));
	await dialog.locator('#edit-end').fill(monthEnd(1));
	await dialog.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.locator('[data-slot="card"]', { hasText: scheduleName })).toBeVisible();

	// The sidebar switcher reflects the rename without a refresh (step 15).
	await expect(page.getByRole('button', { name: scheduleName })).toBeVisible();

	// --- 2. Location ---
	await page.goto('/locations');
	await page.getByRole('button', { name: 'Add health system' }).click();
	let d = page.getByRole('dialog');
	await d.locator('#name').fill(hs);
	await d.getByRole('button', { name: 'Create' }).click();
	await expect(page.locator('tr', { hasText: hs })).toBeVisible();

	await page.getByRole('tab', { name: 'Sites' }).click();
	await page.getByRole('button', { name: 'Add site' }).click();
	d = page.getByRole('dialog');
	await d.locator('#name').fill(site);
	await d.locator('#health_system_id').selectOption({ label: hs });
	await d.getByRole('button', { name: 'Create Site' }).click();
	await expect(page.locator('tr', { hasText: site })).toBeVisible();

	// --- 3. Preceptor (with the site, so availability is settable) ---
	await page.goto('/preceptors/new');
	await page.locator('#name').fill(preceptor);
	await page.locator('#email').fill(`fresh_prec_${stamp}@example.com`);
	await page.locator('#max_students').fill('3');
	await page.getByRole('button', { name: /next/i }).click();
	await page.locator('#health_system_id').selectOption({ label: hs });
	const siteCheckbox = page.getByRole('checkbox').first();
	await expect(siteCheckbox).toBeVisible();
	await siteCheckbox.check();
	await page.getByRole('button', { name: /create & continue/i }).click();

	// Step 3 offers a real availability builder (step 16), not a dead end.
	await expect(page.getByText(/no sites are assigned/i)).toHaveCount(0);
	await page.getByRole('button', { name: /skip for now/i }).click();
	await expect(page).toHaveURL(/\/preceptors$/);

	// --- 4. Clerkship ---
	await page.goto('/clerkships/new');
	await page.locator('#name').fill(clerkship);
	await page.locator('#required_days').fill('4');
	await page.getByRole('button', { name: /^create$/i }).click();
	await expect(page).toHaveURL(/\/clerkships$/);

	// --- 5. Student, onboarded to the health system ---
	await page.goto('/students/new');
	await page.locator('#name').fill(student);
	await page.locator('#email').fill(`fresh_stu_${stamp}@example.com`);
	await page.getByRole('button', { name: /^create$/i }).click();
	await expect(page).toHaveURL(/\/students$/);

	await page.getByRole('button', { name: student }).click();
	await page.getByRole('tab', { name: 'Onboarding' }).click();
	await page.getByLabel(hs, { exact: true }).check();
	await expect(page.getByText('Completed').first()).toBeVisible({ timeout: 10000 });

	// --- 6. One assignment that validates cleanly (onboarded + in range) ---
	await page.getByRole('tab', { name: 'Overview' }).click();
	await openAssignmentDialog(page);
	await selectClerkship(page, clerkship);
	await selectPreceptor(page, preceptor);
	await pickDay(page, fromToday(10));
	await submitAcceptingOverrides(page);
	await expect(page.getByRole('heading', { name: 'Add assignment' })).toHaveCount(0, {
		timeout: 15000
	});

	// --- 7. The calendar shows it, and the schedule is healthy ---
	await page.goto('/calendar');
	const health = page.getByTestId('schedule-health');
	await expect(health).toBeVisible();
	await expect(health.getByText('No conflicts')).toBeVisible({ timeout: 15000 });
});
