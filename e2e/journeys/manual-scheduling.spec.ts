import { test, expect } from '@playwright/test';
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
 * Manual scheduling journey (seeded admin): open a student, add an assignment
 * from their page through the unified dialog, and see it on their schedule.
 */
test('manual scheduling: add an assignment from a student page', async ({ page }) => {
	await login(page, ADMIN);

	// Open the first student.
	await page.goto('/students');
	await expect(page.getByRole('heading', { name: 'Students' })).toBeVisible();
	const firstStudent = page.locator('table tbody tr').first().locator('button').first();
	await firstStudent.click();
	await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();

	await openAssignmentDialog(page);
	await selectClerkship(page, 'Internal Medicine');
	await selectPreceptor(page, 'Dr. Maria Garcia');

	// Vary the offset so re-runs against a non-fresh DB don't double-book the
	// same student on the same date (still well inside the schedule range).
	const date = fromToday(30 + (Date.now() % 120));
	await pickDay(page, date);

	// Seeded students aren't onboarded, so an override conversation is expected.
	await submitAcceptingOverrides(page);
	await expect(page.getByText(/day\(s\) assigned/i)).toBeVisible({ timeout: 15000 });

	// The Schedule tab's list shows it. Reload first so we assert against
	// server-fresh data rather than racing the post-save invalidation.
	await page.reload();
	await page.getByRole('tab', { name: 'Schedule' }).click();
	await page.getByRole('button', { name: 'List' }).click();
	await expect(page.locator('table tbody tr', { hasText: date })).toBeVisible({ timeout: 15000 });
});
