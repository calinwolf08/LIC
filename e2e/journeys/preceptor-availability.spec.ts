import { test, expect } from '@playwright/test';
import { login, ADMIN } from './helpers';

/**
 * Step 16 — preceptor availability repair.
 *
 * Regression coverage for the reported issues:
 *  - "Add pattern" threw `$$props.sites is undefined` and availability never rendered.
 *  - The wizard's final step claimed "no sites" even though one was chosen.
 *  - The availability editor sat below a calendar (had to scroll to reach it).
 */

test('availability tab: editor sits above the calendar and adding a pattern does not crash', async ({
	page
}) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (e) => pageErrors.push(e.message));

	await login(page, ADMIN);

	// Open the first seeded preceptor (seeded preceptors have a site).
	await page.goto('/preceptors');
	await page.locator('table tbody tr').first().locator('a').first().click();
	await expect(page.getByRole('tab', { name: 'Availability' })).toBeVisible();
	await page.getByRole('tab', { name: 'Availability' }).click();

	// Editor ("Set availability") is rendered above the calendar.
	const editor = page.getByRole('heading', { name: 'Set availability' });
	const calendar = page.getByRole('heading', { name: 'Availability calendar' });
	await expect(editor).toBeVisible();
	await expect(calendar).toBeVisible();
	const editorBox = await editor.boundingBox();
	const calendarBox = await calendar.boundingBox();
	expect(editorBox!.y).toBeLessThan(calendarBox!.y);

	// Add a pattern — previously this threw ("$$props.sites is undefined") and
	// rendered nothing.
	await page.getByRole('button', { name: '+ Add Pattern' }).click();
	// The pattern form rendered (submit button present) — i.e. it did not crash.
	const submit = page.getByRole('button', { name: 'Add Pattern', exact: true });
	await expect(submit).toBeVisible();
	await submit.click();

	// The pattern was accepted and staged (the list shows it), and the save
	// action is now available — proving the form worked end to end.
	await expect(page.getByText(/Patterns \(1\)/)).toBeVisible({ timeout: 10000 });
	await expect(page.getByRole('button', { name: /save all|save \d+ dates/i })).toBeVisible();

	// No sites-undefined TypeError was thrown at any point.
	expect(pageErrors.join('\n')).not.toMatch(/sites/i);
});

test('preceptor wizard: choosing a site yields a usable availability step (no "no sites")', async ({
	page
}) => {
	await login(page, ADMIN);

	const name = `Dr. Avail ${Date.now()}`;
	await page.goto('/preceptors/new');
	await page.locator('#name').fill(name);
	await page.locator('#email').fill(`avail_${Date.now()}@example.com`);
	await page.getByRole('button', { name: /next/i }).click();

	// Step 2: pick a health system that has seeded sites, then select a site.
	await expect(page.getByRole('heading', { name: 'Health System & Sites' })).toBeVisible();
	await page.locator('#health_system_id').selectOption({ label: 'Metro Health Network' });
	const siteCheckbox = page.getByRole('checkbox').first();
	await expect(siteCheckbox).toBeVisible();
	await siteCheckbox.check();
	await page.getByRole('button', { name: /create & continue/i }).click();

	// Step 3: the availability builder is usable — NOT the "no sites" dead end.
	await expect(page.getByRole('heading', { name: new RegExp(`Availability Patterns for`) })).toBeVisible({
		timeout: 15000
	});
	await expect(page.getByText(/no sites are assigned/i)).toHaveCount(0);
});
