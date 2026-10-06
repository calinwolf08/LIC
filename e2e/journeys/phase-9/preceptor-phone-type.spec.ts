// @coverage @finding(CF-F1)
/**
 * CF-F1 — A preceptor's phone number can be tagged cell / office / home.
 *
 * Client feedback: "Preceptor — adding phone indicate cell vs office vs home."
 * The new-preceptor form now offers a phone-type select; the value persists and
 * shows on the preceptor's detail page.
 */

import { test, expect, apiOf, type Page } from '../../fixtures';
import { openCustomModal } from '../phase-2/helpers';

async function deletePreceptor(page: Page, name: string) {
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

test.describe('CF-F1 preceptor phone type', { tag: ['@stage1'] }, () => {
	test('phone type is collected on create and shown on the detail page', async ({ asAdmin }) => {
		test.setTimeout(150000);
		const stamp = Date.now();
		const name = `Dr. Phone ${stamp}`;

		try {
			// --- Step 1: basic info incl. phone + type ---
			await asAdmin.goto('/preceptors/new');
			await asAdmin.locator('#name').fill(name);
			await asAdmin.locator('#email').fill(`phone_${stamp}@example.com`);
			await asAdmin.locator('#phone').fill('+1 (555) 111-2222');
			await asAdmin.locator('#phone_type').selectOption('cell');
			await asAdmin.getByRole('button', { name: /next/i }).click();

			// --- Step 2: health system + a site, then create ---
			await expect(asAdmin.getByRole('heading', { name: /health system/i })).toBeVisible({
				timeout: 15000
			});
			await asAdmin.locator('#health_system_id').selectOption({ index: 1 });
			const siteCheckbox = asAdmin.getByRole('checkbox').first();
			await expect(siteCheckbox).toBeVisible();
			await siteCheckbox.check();
			await asAdmin.getByRole('button', { name: /create & continue/i }).click();
			await expect(asAdmin.getByRole('button', { name: /add pattern/i })).toBeVisible({
				timeout: 15000
			});

			// --- Persisted with the type ---
			const list = await apiOf(asAdmin).get<Array<{ id: string; name: string; phone_type: string }>>(
				'/api/preceptors'
			);
			const created = list.data?.find((p) => p.name === name);
			expect(created?.phone_type).toBe('cell');

			// --- Shown on the detail page ---
			await asAdmin.goto(`/preceptors/${created!.id}`);
			await expect(asAdmin.getByText('(cell)')).toBeVisible({ timeout: 15000 });
		} finally {
			await deletePreceptor(asAdmin, name);
		}
	});
});
