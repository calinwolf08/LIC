// @coverage @finding(CF-B1) @req(R1.2) @req(R1.3)
/**
 * CF-B1 — Finishing the new-schedule wizard makes the new schedule ACTIVE.
 *
 * Client feedback: after finishing the wizard the user was left in the previous
 * (default) schedule — wrong date range in the calendar, all the old entities
 * still visible — because the wizard created the schedule with is_active:false
 * and never activated it. This journey does NOT manually activate afterwards; it
 * proves the wizard itself switches the active schedule.
 *
 * A freshly-registered account already has a default active schedule (the auth
 * hook creates one), so this reproduces the exact "stranded in the default"
 * scenario: before → default; after → the just-created schedule.
 */

import {
	test,
	expect,
	apiOf,
	activeScheduleId,
	monthStart,
	monthEnd,
	type Page
} from '../../fixtures';

/** Walk the wizard from Details to a created schedule (no manual activation). */
async function runWizard(page: Page, opts: { name: string; start: string; end: string }) {
	await page.goto('/schedules/new');
	await expect(page.locator('#name')).toBeVisible({ timeout: 15000 });
	await page.locator('#name').fill(opts.name);
	await page.locator('#startDate').fill(opts.start);
	await page.locator('#endDate').fill(opts.end);

	for (let i = 0; i < 8; i++) {
		const create = page.getByRole('button', { name: /^create schedule$/i });
		if (await create.isVisible().catch(() => false)) break;
		await page.getByRole('button', { name: /^next$/i }).click();
		const continueAnyway = page.getByRole('button', { name: /continue anyway/i });
		if (await continueAnyway.isVisible().catch(() => false)) await continueAnyway.click();
	}
	await page.getByRole('button', { name: /^create schedule$/i }).click();
	await expect(page).toHaveURL(/\/calendar/, { timeout: 20000 });
}

test.describe('CF-B1 wizard activates the new schedule', { tag: ['@stage1'] }, () => {
	test('finishing the wizard switches the active schedule to the new one', async ({
		asFreshUser
	}) => {
		test.setTimeout(120000);
		const { page } = asFreshUser;

		const before = await activeScheduleId(page);
		expect(before).toBeTruthy(); // the fresh account starts on its default schedule

		const name = `CF-B1 ${Date.now()}`;
		await runWizard(page, { name, start: monthStart(3), end: monthEnd(4) });

		// The active schedule is now the newly-created one — NOT the default.
		const after = await activeScheduleId(page);
		expect(after).toBeTruthy();
		expect(after).not.toBe(before);

		const active = await apiOf(page).get<{ schedule?: { name: string; start_date: string } }>(
			'/api/user/active-schedule'
		);
		expect(active.data?.schedule?.name).toBe(name);
		expect(active.data?.schedule?.start_date).toBe(monthStart(3));

		// And the new schedule's name is what the app shell shows as active.
		await page.goto('/dashboard');
		await expect(page.getByText(name).first()).toBeVisible({ timeout: 15000 });
	});
});
