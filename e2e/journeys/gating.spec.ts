import { test, expect } from '@playwright/test';
import { login, ADMIN, BASIC } from './helpers';

test.describe('Stage 2 gating', () => {
	test('non-entitled user has no Auto-Generate nav and is blocked from /generate', async ({
		page
	}) => {
		await login(page, BASIC);
		await page.goto('/dashboard');

		// No Auto-Generate nav item
		await expect(page.getByRole('link', { name: 'Auto-Generate' })).toHaveCount(0);

		// Direct navigation to the gated area is forbidden
		const res = await page.goto('/generate');
		expect(res?.status()).toBe(403);

		// The generation API rejects them too
		const apiRes = await page.request.post('/api/schedules/generate', {
			data: { startDate: '2025-01-06', endDate: '2025-06-30' }
		});
		expect(apiRes.status()).toBe(403);
	});

	test('entitled user sees Auto-Generate and can open the hub', async ({ page }) => {
		await login(page, ADMIN);
		await page.goto('/dashboard');

		await expect(page.getByRole('link', { name: 'Auto-Generate' })).toBeVisible();

		const res = await page.goto('/generate');
		expect(res?.status()).toBe(200);
		await expect(page.getByRole('heading', { name: 'Auto-Generate' })).toBeVisible();
		// Sub-nav present
		await expect(page.getByRole('link', { name: 'Results' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
	});
});
