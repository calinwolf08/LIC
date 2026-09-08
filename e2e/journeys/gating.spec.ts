import { test, expect, apiOf } from '../fixtures';

test.describe('Stage 2 gating', { tag: ['@smoke', '@stage2'] }, () => {
	test('non-entitled user has no Auto-Generate nav and is blocked from /generate', async ({
		asBasic
	}) => {
		await asBasic.goto('/dashboard');

		// No Auto-Generate nav item
		await expect(asBasic.getByRole('link', { name: 'Auto-Generate' })).toHaveCount(0);

		// Direct navigation to the gated area is forbidden
		const res = await asBasic.goto('/generate');
		expect(res?.status()).toBe(403);

		// The generation API rejects them too, with the shared error envelope
		const apiRes = await apiOf(asBasic).post('/api/schedules/generate', {
			startDate: '2025-01-06',
			endDate: '2025-06-30'
		});
		expect(apiRes.status).toBe(403);
		expect(apiRes.ok).toBe(false);
	});

	test('entitled user sees Auto-Generate and can open the hub', async ({ asAdmin }) => {
		await asAdmin.goto('/dashboard');

		await expect(asAdmin.getByRole('link', { name: 'Auto-Generate' })).toBeVisible();

		const res = await asAdmin.goto('/generate');
		expect(res?.status()).toBe(200);
		await expect(asAdmin.getByRole('heading', { name: 'Auto-Generate' })).toBeVisible();
		// Sub-nav present
		await expect(asAdmin.getByRole('link', { name: 'Results' })).toBeVisible();
		await expect(asAdmin.getByRole('link', { name: 'Settings' })).toBeVisible();
	});
});
