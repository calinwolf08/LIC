import { test, expect } from '@playwright/test';
import { login, ADMIN, registerNewUser, monthStart, monthEnd } from './helpers';

/**
 * Step 39 — the "no active schedule" empty state.
 *
 * Every schedule-scoped surface reads empty when the user has a schedule but
 * none is selected as active. That must say so (and offer a way forward), not
 * look blank. (A user with *zero* schedules is redirected to /schedules/new by
 * the app layout, so the reachable empty case is "has schedules, none active".)
 */

/** A user who has a schedule on file but no active selection. */
async function noActiveScheduleUser(page: import('@playwright/test').Page) {
	await registerNewUser(page);

	// The sign-up hook creates one active "My Schedule". Add a second schedule so
	// deleting the first does not drop the account to zero schedules (which would
	// redirect to /schedules/new instead of showing the empty state).
	const created = await page.request.post('/api/scheduling-periods', {
		data: { name: 'Spare Schedule', start_date: monthStart(0), end_date: monthEnd(2) }
	});
	expect(created.ok()).toBeTruthy();

	const active = await (await page.request.get('/api/user/active-schedule')).json();
	const activeId = active.data?.schedule?.id;
	expect(activeId, 'fresh account should start with an active schedule').toBeTruthy();

	// Delete the active schedule — this clears active_schedule_id, leaving the
	// spare schedule on file but nothing selected.
	const del = await page.request.delete(`/api/scheduling-periods/${activeId}`);
	expect(del.ok()).toBeTruthy();

	const after = await (await page.request.get('/api/user/active-schedule')).json();
	expect(after.data?.schedule ?? null).toBeNull();
}

for (const path of ['/dashboard', '/calendar', '/locations']) {
	test(`no-active-schedule state shows on ${path} and leads to schedule management`, async ({
		page
	}) => {
		await noActiveScheduleUser(page);

		await page.goto(path);
		await expect(page.getByText('No active schedule')).toBeVisible({ timeout: 15000 });

		const cta = page.getByTestId('no-schedule-cta');
		await expect(cta).toBeVisible();
		await cta.click();
		await expect(page).toHaveURL(/\/schedules$/);
	});
}

test('the seeded admin (who has a schedule) sees no empty-schedule state', async ({ page }) => {
	await login(page, ADMIN);
	await page.goto('/dashboard');
	// The dashboard has real content, so the no-schedule state must be absent.
	await expect(page.getByText('No active schedule')).toHaveCount(0);
});
