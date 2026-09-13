// @coverage @req(R3.1) @req(R3.2) @req(R3.3) @req(R3.4) @req(R3.5) @req(R3.6)
/**
 * J2.2 — Preceptor from the wizard to a usable calendar (e2e plan Phase 2).
 *
 * The full creation wizard: basic info → health system & site → an availability
 * pattern that materialises into concrete dates → the list shows the
 * availability-configured indicator and the detail Availability tab reproduces
 * the builder. Plus R3.5: a preceptor is schedulable with only a name (no site,
 * no availability) and then reads "Not Set".
 *
 * Runs on the seeded Demo Schedule (which has health systems and sites) and
 * deletes the preceptors it creates so the schedule is left as found.
 */

import { test, expect } from '../../fixtures';
import { openCustomModal } from './helpers';

async function deletePreceptor(page: import('@playwright/test').Page, name: string) {
	await page.goto('/preceptors');
	const row = page.locator('tr', { hasText: name });
	if (!(await row.isVisible().catch(() => false))) return;
	const modal = await openCustomModal(
		page,
		row.getByRole('button', { name: 'Delete' }),
		'Delete Preceptor'
	);
	await modal.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(page.locator('tr', { hasText: name })).toHaveCount(0, { timeout: 15000 });
}

test.describe('J2.2 preceptor wizard & availability', { tag: ['@stage1'] }, () => {
	test('wizard → site → weekly availability pattern → list shows Configured', async ({
		asAdmin
	}) => {
		test.setTimeout(150000);
		const stamp = Date.now();
		const name = `Dr. Wizard ${stamp}`;

		try {
			// --- Step 1: basic info ---
			await asAdmin.goto('/preceptors/new');
			await asAdmin.locator('#name').fill(name);
			await asAdmin.locator('#email').fill(`wiz_${stamp}@example.com`);
			await asAdmin.locator('#max_students').fill('2');
			await asAdmin.getByRole('button', { name: /next/i }).click();

			// --- Step 2: health system & a site ---
			await expect(asAdmin.getByRole('heading', { name: /health system/i })).toBeVisible({
				timeout: 15000
			});
			await asAdmin.locator('#health_system_id').selectOption({ index: 1 });
			const siteCheckbox = asAdmin.getByRole('checkbox').first();
			await expect(siteCheckbox).toBeVisible();
			await siteCheckbox.check();
			await asAdmin.getByRole('button', { name: /create & continue/i }).click();

			// --- Step 3: add a weekly availability pattern (Mon/Wed/Fri) ---
			await expect(asAdmin.getByRole('button', { name: /add pattern/i })).toBeVisible({
				timeout: 15000
			});
			await asAdmin.getByRole('button', { name: /\+ add pattern/i }).click();
			// Site auto-selects when the preceptor has exactly one; pick the weekdays.
			for (const day of ['Mon', 'Wed', 'Fri']) {
				await asAdmin.getByRole('button', { name: day, exact: true }).click();
			}
			await asAdmin.getByRole('button', { name: /^add pattern$/i }).click();

			// Save all → materialises dates → lands back on the preceptors list.
			await asAdmin.getByRole('button', { name: /save all|save \d+ dates/i }).click();
			await expect(asAdmin).toHaveURL(/\/preceptors$/, { timeout: 20000 });

			// --- The list shows this preceptor with availability configured ---
			const row = asAdmin.locator('tr', { hasText: name });
			await expect(row).toBeVisible({ timeout: 15000 });
			await expect(row.getByTestId('availability-indicator')).toHaveAttribute(
				'data-configured',
				'true',
				{ timeout: 10000 }
			);

			// --- The detail Availability tab reproduces the builder ---
			await row.getByRole('button', { name: 'Manage' }).click();
			await expect(asAdmin).toHaveURL(/\/preceptors\/[^/]+$/, { timeout: 15000 });
			await asAdmin.getByRole('tab', { name: 'Availability' }).click();
			await expect(asAdmin.getByRole('button', { name: /add pattern/i })).toBeVisible({
				timeout: 15000
			});
		} finally {
			await deletePreceptor(asAdmin, name);
		}
	});

	test('a preceptor is schedulable with only a name; the list reads "Not Set" (R3.5)', async ({
		asAdmin
	}) => {
		test.setTimeout(120000);
		const stamp = Date.now();
		const name = `Dr. NameOnly ${stamp}`;
		try {
			await asAdmin.goto('/preceptors/new');
			await asAdmin.locator('#name').fill(name);
			await asAdmin.locator('#email').fill(`nameonly_${stamp}@example.com`);
			await asAdmin.getByRole('button', { name: /next/i }).click();
			// Skip the site step (sites are optional) → continue to availability.
			await asAdmin.getByRole('button', { name: /create & continue/i }).click();
			// Skip availability entirely.
			const skip = asAdmin.getByRole('button', { name: /skip for now/i });
			const goList = asAdmin.getByRole('button', { name: /go to preceptors list/i });
			await expect(skip.or(goList)).toBeVisible({ timeout: 15000 });
			if (await skip.isVisible().catch(() => false)) await skip.click();
			else await goList.click();
			await expect(asAdmin).toHaveURL(/\/preceptors$/, { timeout: 15000 });

			// Present in the list, availability not configured.
			const row = asAdmin.locator('tr', { hasText: name });
			await expect(row).toBeVisible({ timeout: 15000 });
			await expect(row.getByTestId('availability-indicator')).toHaveAttribute(
				'data-configured',
				'false'
			);
		} finally {
			await deletePreceptor(asAdmin, name);
		}
	});
});
