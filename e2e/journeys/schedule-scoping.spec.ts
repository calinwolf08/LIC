import { test, expect, type Page } from '@playwright/test';
import { login, ADMIN } from './helpers';

/**
 * Step 15 — schedule scoping foundation.
 *
 * Renaming the active schedule on /schedules must update the sidebar schedule
 * switcher immediately, without a page refresh. (The bug: /schedules mutated via
 * its own fetch + invalidateAll, which never touched the module-level store the
 * sidebar reads, so the dropdown stayed stale until a hard reload.)
 *
 * The test works on a throwaway schedule it creates and activates, restoring the
 * baseline "My Schedule" in a finally block so a mid-test failure can't poison
 * the shared DB that other specs depend on.
 */

async function scheduleIdByName(page: Page, name: string): Promise<string | null> {
	const res = await page.request.get('/api/scheduling-periods');
	if (!res.ok()) return null;
	const list = (await res.json()).data ?? [];
	return list.find((s: { name: string }) => s.name === name)?.id ?? null;
}

async function setActive(page: Page, scheduleId: string) {
	await page.request.put('/api/user/active-schedule', { data: { scheduleId } });
}

test('schedule rename updates the sidebar switcher without a refresh', async ({ page }) => {
	await login(page, ADMIN);

	const orig = `Scope Test ${Date.now()}`;
	const renamed = `${orig} edited`;
	let testId: string | null = null;
	const baselineId = await scheduleIdByName(page, 'My Schedule');

	try {
		// Create a throwaway schedule and make it active.
		const created = await page.request.post('/api/scheduling-periods', {
			data: { name: orig, start_date: '2026-07-01', end_date: '2026-08-31' }
		});
		expect(created.ok()).toBeTruthy();
		testId = (await created.json()).data.id;
		await setActive(page, testId!);

		// Load a page so the sidebar reflects the active schedule.
		await page.goto('/dashboard');
		await expect(page.getByRole('button', { name: orig })).toBeVisible();

		// Rename it on /schedules.
		await page.goto('/schedules');
		const card = page.locator('[data-slot="card"]', { hasText: orig }).first();
		await card.getByRole('button', { name: 'Edit' }).click();
		const dialog = page.getByRole('dialog');
		await dialog.locator('#edit-name').fill(renamed);
		await dialog.getByRole('button', { name: 'Save changes' }).click();
		await expect(page.locator('[data-slot="card"]', { hasText: renamed }).first()).toBeVisible();

		// The sidebar switcher reflects the new name with no reload.
		await expect(page.getByRole('button', { name: renamed })).toBeVisible();
	} finally {
		// Restore the baseline active schedule and remove the throwaway one.
		if (baselineId) await setActive(page, baselineId);
		if (testId) await page.request.delete(`/api/scheduling-periods/${testId}`);
	}
});
