// @coverage @finding(CF-C4) @finding(CF-C5) @finding(CF-D2) @req(R1.3)
/**
 * CF-C4 / CF-C5 — The new-schedule wizard explains what selection means and
 * auto-selects entities the user creates inline.
 *
 * Client feedback: "Selection meaning not clear — thought they were now just 'in'
 * that site" (C5) and "Added health system not automatically selected" (C4). The
 * entity steps now read "Include …" with helper text, and an entity created from
 * inside a step is added to the selection automatically.
 */

import { test, expect, monthStart, monthEnd } from '../../fixtures';

test.describe('CF-C4/C5 wizard selection clarity + auto-select', { tag: ['@stage1'] }, () => {
	test('the Health Systems step explains inclusion and auto-selects a created one', async ({
		asFreshUser
	}) => {
		test.setTimeout(120000);
		const { page } = asFreshUser;

		await page.goto('/schedules/new');
		await expect(page.locator('#name')).toBeVisible({ timeout: 15000 });
		await page.locator('#name').fill(`CF-wiz ${Date.now()}`);
		await page.locator('#startDate').fill(monthStart(0));
		await page.locator('#endDate').fill(monthEnd(1));
		await page.getByRole('button', { name: /^next$/i }).click();

		// C5: the step is framed as inclusion, with plain-language help.
		await expect(page.getByRole('heading', { name: /include health systems/i })).toBeVisible({
			timeout: 15000
		});
		await expect(page.getByText(/chooses what's.*included/i)).toBeVisible();

		// C4: create a health system inline (only #name in the DOM is the modal's,
		// since the Details step's #name is not rendered on this step).
		await page
			.getByRole('button', { name: /add health system/i })
			.first()
			.click();
		// D2: the health-system form no longer collects a location (it lives on sites).
		await expect(page.locator('#location')).toHaveCount(0);
		const hsName = `Kaiser ${Date.now()}`;
		await page.locator('#name').fill(hsName);
		await page.getByRole('button', { name: /^create$/i }).click();

		// The new health system appears and is already selected (count = 1).
		await expect(page.getByText(hsName)).toBeVisible({ timeout: 15000 });
		await expect(page.getByText('1 selected')).toBeVisible();

		// C5 also frames the Sites step as inclusion.
		await page.getByRole('button', { name: /^next$/i }).click();
		await expect(page.getByRole('heading', { name: /include sites/i })).toBeVisible({
			timeout: 15000
		});
	});
});
