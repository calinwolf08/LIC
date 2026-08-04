import { test, expect, type Page } from '@playwright/test';
import { login, ADMIN } from './helpers';
import {
	openAssignmentDialog,
	pickDay,
	selectClerkship,
	selectPreceptor,
	submitAcceptingOverrides,
	fromToday
} from './assignment-helpers';

/**
 * Assignment + validation journeys against the unified dialog (step 18).
 *
 * Freshly-created students are not onboarded to any health system, so a clean
 * in-range assignment against a seeded preceptor raises exactly one soft
 * category (not onboarded) — which lets us verify both the override
 * conversation and that completing onboarding clears it.
 */

/** An in-range future date, varied so re-runs don't double-book a student. */
function inRangeDate(offset = 0) {
	return fromToday(20 + (Date.now() % 20) + offset);
}

async function createStudent(page: Page, name: string, email: string) {
	await page.goto('/students/new');
	await page.locator('#name').fill(name);
	await page.locator('#email').fill(email);
	await page.getByRole('button', { name: /^create$/i }).click();
	await expect(page).toHaveURL(/\/students$/);
}

async function openStudent(page: Page, name: string) {
	await page.goto('/students');
	await page.getByRole('button', { name }).click();
	await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
}

test('assignment: create with an override, then remove it from the schedule', async ({ page }) => {
	await login(page, ADMIN);

	// A dedicated student keeps this test independent of others' assignments.
	const stamp = Date.now();
	const name = `E2E Assign ${stamp}`;
	await createStudent(page, name, `e2e_assign_${stamp}@example.com`);
	await openStudent(page, name);

	const date = inRangeDate();
	await openAssignmentDialog(page);
	await selectClerkship(page, 'Internal Medicine');
	await selectPreceptor(page, 'Dr. Maria Garcia');
	await pickDay(page, date);

	// The not-onboarded category is announced before submitting…
	await expect(page.getByTestId('override-summary')).toContainText(/not onboarded/i);
	// …and confirmed explicitly.
	await submitAcceptingOverrides(page);
	await expect(page.getByText(/day\(s\) assigned/i)).toBeVisible({ timeout: 15000 });

	// It shows on the Schedule tab's list; remove it.
	await page.getByRole('tab', { name: 'Schedule' }).click();
	await page.getByRole('button', { name: 'List' }).click();
	const row = page.locator('table tbody tr', { hasText: date });
	await expect(row).toBeVisible();
	await row.getByRole('button', { name: 'Remove' }).click();
	const confirm = page.getByRole('dialog');
	await expect(confirm.getByText('Remove assignment?')).toBeVisible();
	await confirm.getByRole('button', { name: 'Remove' }).click();
	await expect(page.locator('table tbody tr', { hasText: date })).toHaveCount(0);
});

test('assignment: completing onboarding clears the not-onboarded override', async ({ page }) => {
	await login(page, ADMIN);

	const stamp = Date.now();
	const name = `E2E Onboard ${stamp}`;
	await createStudent(page, name, `e2e_onboard_${stamp}@example.com`);
	await openStudent(page, name);

	// Before onboarding: the category is listed.
	await openAssignmentDialog(page);
	await selectClerkship(page, 'Internal Medicine');
	await selectPreceptor(page, 'Dr. Maria Garcia');
	await pickDay(page, inRangeDate());
	await expect(page.getByTestId('override-summary')).toContainText(/not onboarded/i);
	await page.getByRole('button', { name: 'Cancel' }).first().click();

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

	// Reopen on a fresh in-range date: nothing left to confirm.
	await page.getByRole('tab', { name: 'Overview' }).click();
	await openAssignmentDialog(page);
	await selectClerkship(page, 'Internal Medicine');
	await selectPreceptor(page, 'Dr. Maria Garcia');
	await pickDay(page, inRangeDate(1));
	await expect(page.getByTestId('override-summary')).toHaveCount(0);
});
