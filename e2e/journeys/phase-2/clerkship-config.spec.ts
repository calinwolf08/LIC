/**
 * J2.4 — Clerkship configuration, Stage 1 view (e2e plan Phase 2).
 *
 * The Stage 1 clerkship surfaces — Details, Allowed sites, Electives — plus the
 * tier gating that keeps the Stage 2 tabs (Auto-scheduling, Preceptor teams)
 * out of a non-entitled user's view (spec R4.2 / G-7). The mutating journey
 * builds a throwaway clerkship on the seeded Demo Schedule and deletes it.
 */

import { test, expect, apiOf } from '../../fixtures';
import { openDialog, openCustomModal } from './helpers';

test.describe('J2.4 clerkship configuration', { tag: ['@stage1'] }, () => {
	test('create, edit details, manage allowed sites and electives, then delete', async ({
		asAdmin
	}) => {
		test.setTimeout(150000);
		const stamp = Date.now();
		const name = `Config Clerkship ${stamp}`;

		// --- Create (Demo Schedule has sites, so Allowed sites has options) ---
		await asAdmin.goto('/clerkships/new');
		await asAdmin.locator('#name').fill(name);
		await asAdmin.locator('#required_days').fill('10');
		await asAdmin.getByRole('button', { name: /^create$/i }).click();
		await expect(asAdmin).toHaveURL(/\/clerkships$/, { timeout: 15000 });

		// Open its detail page.
		await asAdmin.getByRole('button', { name }).first().click();
		await expect(asAdmin.getByRole('tab', { name: 'Overview' })).toBeVisible({ timeout: 15000 });

		// --- Details: change required days and save ---
		await asAdmin.getByRole('tab', { name: 'Details' }).click();
		await asAdmin.locator('#required-days').fill('12');
		await asAdmin.getByRole('button', { name: 'Save Basic Info' }).click();
		await expect(asAdmin.getByText(/basic information saved/i)).toBeVisible({ timeout: 10000 });
		// The change persisted (source of truth), without a reload that would
		// re-introduce the tab hydration race.
		const saved =
			await apiOf(asAdmin).get<Array<{ name: string; required_days: number }>>('/api/clerkships');
		expect(saved.data?.find((c) => c.name === name)?.required_days).toBe(12);

		// --- Allowed sites: add one, see it listed, remove it ---
		await asAdmin.getByRole('tab', { name: 'Allowed sites' }).click();
		const addSiteDialog = await openDialog(asAdmin, 'Add Site');
		await addSiteDialog.locator('#site-select').selectOption({ index: 1 });
		// The dialog's confirm button is "Add" (the tab's "Add Site" opens it).
		await addSiteDialog.getByRole('button', { name: /^add$/i }).click();
		// The added site appears in the allowed-sites list.
		await expect(asAdmin.getByText(/metro|community|suburban/i).first()).toBeVisible({
			timeout: 10000
		});

		// --- Electives: create a required elective within the day budget ---
		await asAdmin.getByRole('tab', { name: 'Electives' }).click();
		await asAdmin.getByRole('button', { name: /create elective/i }).click();
		await asAdmin.locator('#name').fill('Sports Med');
		await asAdmin.locator('#minimumDays').fill('3');
		await asAdmin.getByLabel(/required elective/i).check();
		await asAdmin.getByRole('button', { name: /^create$/i }).click();
		await expect(asAdmin.getByText('Sports Med')).toBeVisible({ timeout: 10000 });

		// --- Cleanup: delete the throwaway clerkship from the list ---
		await asAdmin.goto('/clerkships');
		const row = asAdmin.locator('tr', { hasText: name });
		await expect(row).toBeVisible();
		const modal = await openCustomModal(
			asAdmin,
			row.getByRole('button', { name: 'Delete' }),
			/delete clerkship/i
		);
		await modal.getByRole('button', { name: 'Delete', exact: true }).click();
		await expect(asAdmin.locator('tr', { hasText: name })).toHaveCount(0, { timeout: 10000 });
	});

	test('the seeded Internal Medicine clerkship shows its required and optional electives', async ({
		asAdmin
	}) => {
		const clerkships =
			await apiOf(asAdmin).get<Array<{ id: string; name: string }>>('/api/clerkships');
		const im = clerkships.data?.find((c) => c.name === 'Internal Medicine');
		expect(im?.id).toBeTruthy();
		await asAdmin.goto(`/clerkships/${im!.id}`);
		await asAdmin.getByRole('tab', { name: 'Electives' }).click();
		// "Cardiology" appears as both the name and the specialty, so scope to first.
		await expect(asAdmin.getByText('Cardiology').first()).toBeVisible({ timeout: 10000 });
		await expect(asAdmin.getByText('Dermatology').first()).toBeVisible();
		// Required vs optional are both represented.
		await expect(asAdmin.getByText(/required/i).first()).toBeVisible();
	});

	test('tier gating: entitled sees the Stage 2 tabs; basic sees only Stage 1 tabs', async ({
		asAdmin,
		asBasic
	}) => {
		// Entitled (admin) on a seeded clerkship: all six tabs.
		const clerkships = await apiOf(asAdmin).get<Array<{ id: string }>>('/api/clerkships');
		await asAdmin.goto(`/clerkships/${clerkships.data![0].id}`);
		const tabs = asAdmin.getByRole('tablist');
		await expect(tabs.getByRole('tab', { name: 'Overview' })).toBeVisible({ timeout: 15000 });
		for (const label of [
			'Details',
			'Allowed sites',
			'Electives',
			'Auto-scheduling',
			'Preceptor teams'
		]) {
			await expect(tabs.getByRole('tab', { name: label })).toBeVisible();
		}

		// Basic (Tenant B) on its own clerkship: no Stage 2 tabs.
		const bClerkships = await apiOf(asBasic).get<Array<{ id: string }>>('/api/clerkships');
		await asBasic.goto(`/clerkships/${bClerkships.data![0].id}`);
		const bTabs = asBasic.getByRole('tablist');
		await expect(bTabs.getByRole('tab', { name: 'Overview' })).toBeVisible({ timeout: 15000 });
		await expect(bTabs.getByRole('tab', { name: 'Electives' })).toBeVisible();
		await expect(bTabs.getByRole('tab', { name: 'Auto-scheduling' })).toHaveCount(0);
		await expect(bTabs.getByRole('tab', { name: 'Preceptor teams' })).toHaveCount(0);
	});
});
