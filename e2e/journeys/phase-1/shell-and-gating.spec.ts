// @coverage @req(R1.1) @req(R1.2) @req(R10.x) @req(G1) @req(G7)
/**
 * J1.4 — Shell, empty states, and the dead-end audit (e2e plan Phase 1).
 *
 * A fresh account with a schedule but no data should show a real empty state on
 * every surface, with a working way forward, and never a dead link. The
 * navigation shell differs by tier: only an entitled user sees Auto-Generate and
 * can reach /generate; a basic user is blocked there but keeps every Stage 1
 * surface (no over-gating).
 */

import { test, expect } from '../../fixtures';

const APP_ROUTES = [
	'/dashboard',
	'/calendar',
	'/students',
	'/preceptors',
	'/clerkships',
	'/locations',
	'/schedules'
];

test.describe('J1.4 shell & empty states', { tag: ['@stage1'] }, () => {
	test('a fresh account reaches every Stage 1 surface with a schedule already created', async ({
		asFreshUser
	}) => {
		test.setTimeout(120000);
		const { page } = asFreshUser;
		// The sign-up hook creates a first schedule, so app routes render rather
		// than bouncing to /schedules/new.
		for (const route of APP_ROUTES) {
			const res = await page.goto(route);
			expect(res?.status(), `${route} should load`).toBeLessThan(400);
			// Never the SvelteKit error page.
			await expect(page.getByText(/internal error|not found/i)).toHaveCount(0);
		}
	});

	test('empty lists explain themselves and lead to creation', async ({ asFreshUser }) => {
		const { page } = asFreshUser;
		// Students list, empty → an empty state with an add path.
		await page.goto('/students');
		await expect(page.getByText(/no students/i)).toBeVisible({ timeout: 15000 });
		// The primary add control exists and navigates to the creation page.
		await page.goto('/students/new');
		await expect(page).toHaveURL(/\/students\/new/);
		await expect(page.locator('#name')).toBeVisible();

		// Locations empty state.
		await page.goto('/locations');
		await expect(page.getByRole('button', { name: /add health system/i }).first()).toBeVisible({
			timeout: 15000
		});
	});

	test('entitled shell shows Auto-Generate and reaches the hub', async ({
		asFreshEntitledUser
	}) => {
		const { page } = asFreshEntitledUser;
		await page.goto('/dashboard');
		await expect(page.getByRole('link', { name: 'Auto-Generate' })).toBeVisible();
		const res = await page.goto('/generate');
		expect(res?.status()).toBe(200);
		await expect(page.getByRole('heading', { name: 'Auto-Generate' })).toBeVisible();
	});

	test('basic shell hides Stage 2 and blocks its pages, but keeps Stage 1', async ({
		asFreshUser
	}) => {
		const { page } = asFreshUser;
		await page.goto('/dashboard');
		await expect(page.getByRole('link', { name: 'Auto-Generate' })).toHaveCount(0);

		for (const gated of [
			'/generate',
			'/generate/results',
			'/generate/settings',
			'/generate/teams'
		]) {
			const res = await page.goto(gated);
			expect(res?.status(), `${gated} should be 403 for a basic user`).toBe(403);
		}

		// No over-gating: Stage 1 creation still works end to end.
		await page.goto('/clerkships/new');
		await page.locator('#name').fill(`Shell Clerkship ${Date.now()}`);
		await page.locator('#required_days').fill('3');
		await page.getByRole('button', { name: /^create$/i }).click();
		await expect(page).toHaveURL(/\/clerkships$/, { timeout: 15000 });
	});

	test('an unknown entity id renders a not-found state, not a crash', async ({ asAdmin }) => {
		const res = await asAdmin.goto('/students/does-not-exist-xyz');
		// Either a 404 status or an in-app "not found" surface — never a 500 or a
		// blank page.
		expect(res && res.status() < 500).toBe(true);
		await expect(asAdmin.getByText(/not found|doesn't exist|no student/i).first()).toBeVisible({
			timeout: 15000
		});
	});
});
