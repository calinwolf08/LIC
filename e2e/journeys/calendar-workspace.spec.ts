import { test, expect } from '@playwright/test';
import { login, ADMIN, fromToday } from './helpers';
import {
	openAssignmentDialog,
	selectClerkship,
	selectPreceptor,
	pickDay,
	submitAcceptingOverrides
} from './assignment-helpers';

/**
 * Step 20 — the calendar as the working surface.
 *
 * Regression coverage for the reported issues: it opened in list view, day cells
 * showed a meaningless 3-letter abbreviation ("Int") instead of who/what, edits
 * went through a bespoke modal rather than the unified dialog, and schedule
 * health / overrides were not reviewable outside the dashboard.
 */

test('calendar opens as a calendar and the view choice round-trips through the URL', async ({
	page
}) => {
	await login(page, ADMIN);
	await page.goto('/calendar');

	// Calendar view is the default: the month grid is present and the day-list
	// heading ("Monday, …" cards) is not the primary surface.
	await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible();
	await expect(page.getByRole('button', { name: '← Previous Month' })).toBeVisible({
		timeout: 15000
	});

	// Switching to list persists to the URL, and a deep link honours it.
	await page.getByRole('button', { name: 'List', exact: true }).click();
	await expect(page).toHaveURL(/view=list/);

	// Deep-linking back to calendar view works too.
	await page.goto('/calendar?view=calendar');
	await expect(page.getByRole('button', { name: '← Previous Month' })).toBeVisible();
});

test('schedule health panel shows conflicts by type and the override log', async ({ page }) => {
	await login(page, ADMIN);
	await page.goto('/calendar');

	// The panel is present on the calendar (not only the dashboard).
	const health = page.getByTestId('schedule-health');
	await expect(health).toBeVisible();
	await expect(health.getByRole('heading', { name: 'Schedule health' })).toBeVisible();

	// Expanding reveals both sections.
	await health.getByRole('button', { name: /show details/i }).click();
	await expect(health.getByRole('heading', { name: 'Conflicts by type' })).toBeVisible();
	await expect(health.getByRole('heading', { name: 'Overrides' })).toBeVisible();
});

test('creating an assignment with an accepted warning lists it under Overrides', async ({
	page
}) => {
	await login(page, ADMIN);

	// Dedicated student, clerkship and preceptor so this test never collides with
	// assignments other specs create (capacity/double-book would add extra
	// conversations and change the outcome).
	const stamp = Date.now();
	const name = `E2E Cal ${stamp}`;
	const clerkshipName = `E2E CalClerk ${stamp}`;
	const preceptorName = `Dr. E2E Cal ${stamp}`;

	const site = (await (await page.request.get('/api/sites')).json()).data[0];
	await page.request.post('/api/clerkships', {
		data: { name: clerkshipName, clerkship_type: 'outpatient', required_days: 5 }
	});
	// The preceptor needs a health system: the not-onboarded warning (the override
	// this test is about) is only raised for a preceptor whose health system the
	// student has not onboarded to.
	await page.request.post('/api/preceptors', {
		data: {
			name: preceptorName,
			email: `e2e_calprec_${stamp}@example.com`,
			max_students: 5,
			health_system_id: site.health_system_id,
			site_ids: [site.id]
		}
	});

	await page.goto('/students/new');
	await page.locator('#name').fill(name);
	await page.locator('#email').fill(`e2e_cal_${stamp}@example.com`);
	await page.getByRole('button', { name: /^create$/i }).click();
	await expect(page).toHaveURL(/\/students$/);

	// Assign a future day from the student page; the student is not onboarded to
	// the preceptor's health system, so this raises a soft warning that must be
	// explicitly accepted.
	await page.getByRole('button', { name }).click();
	await openAssignmentDialog(page);
	await selectClerkship(page, clerkshipName);
	await selectPreceptor(page, preceptorName);
	await pickDay(page, fromToday(40));
	await submitAcceptingOverrides(page);

	// The dialog closes once the assignment is saved.
	await expect(page.getByRole('heading', { name: /add assignment/i })).toHaveCount(0, {
		timeout: 15000
	});

	// The override now appears in the calendar's override log.
	await page.goto('/calendar');
	const health = page.getByTestId('schedule-health');
	await health.getByRole('button', { name: /show details/i }).click();
	await expect(health.getByTestId('override-list')).toContainText(name, { timeout: 15000 });

	// Health-panel IA (step 40, option a): the two sections stay distinct, but the
	// relationship is explicit — this still-live override is marked as suppressing
	// a conflict (the reason it is absent from "Conflicts by type").
	const row = health.getByTestId('override-list').locator('li', { hasText: name }).first();
	await expect(row.getByTestId('override-status')).toHaveText(/suppressing a conflict/i);
});
