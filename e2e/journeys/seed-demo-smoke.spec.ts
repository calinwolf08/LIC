import { test, expect } from '@playwright/test';
import { login, ADMIN } from './helpers';

/**
 * Step 36 — the demo seed must give a cold database something to look at.
 *
 * These are smoke checks against the seeded admin scenario: the calendar has
 * real assignments (a seeded student's name is on the schedule) and schedule
 * health surfaces the seeded capacity findings as a non-zero conflict pill.
 */

test('the seeded calendar lists a seeded student assignment', async ({ page }) => {
	await login(page, ADMIN);
	// List view enumerates every assignment regardless of which month is shown.
	await page.goto('/calendar?view=list');

	// Alice Johnson has the clean multi-day block in the demo seed.
	await expect(page.getByText('Alice Johnson').first()).toBeVisible({ timeout: 15000 });
});

test('schedule health shows the seeded capacity findings as a non-zero conflict pill', async ({
	page
}) => {
	await login(page, ADMIN);
	await page.goto('/calendar');

	const health = page.getByTestId('schedule-health');
	await expect(health).toBeVisible();

	// The seed's four over-capacity days surface as a non-zero conflict count.
	const pill = health.getByTestId('health-violation-count');
	await expect(pill).toBeVisible({ timeout: 15000 });
	await expect(pill).toContainText(/conflict/i);
});
