// @coverage @finding(CF-C1) @req(R1.3)
/**
 * CF-C1 — The new-schedule wizard shows an inline error for an end date that
 * precedes the start date, instead of silently refusing to advance.
 *
 * Client feedback: "New schedule doesn't allow invalid end date but no form
 * warning." The Details step now renders a visible message and keeps the user on
 * the step (the create action never fires with an invalid range).
 */

import { test, expect, monthStart, monthEnd } from '../../fixtures';

test.describe('CF-C1 schedule create rejects end-before-start inline', { tag: ['@stage1'] }, () => {
	test('an end date before the start date surfaces an inline error', async ({ asFreshUser }) => {
		const { page } = asFreshUser;
		await page.goto('/schedules/new');
		await expect(page.locator('#name')).toBeVisible({ timeout: 15000 });

		await page.locator('#name').fill(`CF-C1 ${Date.now()}`);
		await page.locator('#startDate').fill(monthEnd(1)); // later
		await page.locator('#endDate').fill(monthStart(0)); // earlier → invalid

		// The inline error is shown (not a silent non-advance) …
		await expect(page.getByTestId('date-range-error')).toBeVisible({ timeout: 10000 });
		// … and the user is held on the Details step.
		await expect(page).toHaveURL(/\/schedules\/new/);

		// Correcting the range clears the error.
		await page.locator('#endDate').fill(monthEnd(2));
		await expect(page.getByTestId('date-range-error')).toHaveCount(0);
	});
});
