import { test, expect, type Page } from '@playwright/test';
import { login, ADMIN } from './helpers';

/**
 * Schedule lifecycle journeys (seeded admin): create a schedule through the
 * wizard, edit it, switch the active schedule, reach the duplicate entry point,
 * and delete it. The seeded baseline active schedule is "My Schedule" (created
 * by the auth hook and populated by the seed); other specs depend on it, so
 * afterEach restores it as active no matter what.
 */

const BASE = 'My Schedule';

/** Step through the new-schedule wizard, skipping every entity step. */
async function createEmptySchedule(page: Page, name: string) {
	await page.goto('/schedules/new');
	await expect(page.getByRole('heading', { name: 'Create New Schedule' })).toBeVisible();
	await page.locator('#name').fill(name);
	await page.locator('#startDate').fill('2027-01-04');
	await page.locator('#endDate').fill('2027-06-30');

	// Details → step 1, then Next + "Continue Anyway" through the six entity steps.
	await page.getByRole('button', { name: 'Next' }).click();
	for (let step = 1; step <= 6; step++) {
		await page.getByRole('button', { name: 'Next' }).click();
		await page.getByRole('button', { name: 'Continue Anyway' }).click();
	}
	await page.getByRole('button', { name: 'Create Schedule' }).click();
	// Creation lands on the calendar.
	await expect(page).toHaveURL(/\/calendar/, { timeout: 20000 });
}

/** Restore the seeded schedule as active via the authenticated API. */
async function restoreActiveSchedule(page: Page) {
	try {
		const res = await page.request.get('/api/scheduling-periods');
		if (!res.ok()) return;
		const body = await res.json();
		const list = body.data ?? body ?? [];
		const base = Array.isArray(list) ? list.find((s: { name: string }) => s.name === BASE) : null;
		if (base?.id) {
			await page.request.put('/api/user/active-schedule', { data: { scheduleId: base.id } });
		}
	} catch {
		// best-effort restore
	}
}

test.afterEach(async ({ page }) => {
	await restoreActiveSchedule(page);
});

test('schedules: create via wizard, edit, set active, and delete', async ({ page }) => {
	await login(page, ADMIN);

	const name = `E2E Schedule ${Date.now()}`;
	const renamed = `${name} (edited)`;

	await createEmptySchedule(page, name);

	// It appears in the schedules list.
	await page.goto('/schedules');
	const card = page.locator('[data-slot="card"]', { hasText: name }).first();
	await expect(card).toBeVisible();

	// --- Edit its name/dates ---
	await card.getByRole('button', { name: 'Edit' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByText('Edit schedule')).toBeVisible();
	await dialog.locator('#edit-name').fill(renamed);
	await dialog.getByRole('button', { name: 'Save changes' }).click();
	const editedCard = page.locator('[data-slot="card"]', { hasText: renamed }).first();
	await expect(editedCard).toBeVisible();

	// --- Set it active, then restore the seeded schedule as active ---
	await editedCard.getByRole('button', { name: 'Set active' }).click();
	await expect(editedCard.getByText('Active')).toBeVisible({ timeout: 10000 });

	const demoCard = page.locator('[data-slot="card"]', { hasText: BASE }).first();
	await demoCard.getByRole('button', { name: 'Set active' }).click();
	await expect(demoCard.getByText('Active')).toBeVisible({ timeout: 10000 });

	// --- Delete the schedule we created ---
	const targetCard = page.locator('[data-slot="card"]', { hasText: renamed }).first();
	await targetCard.getByRole('button', { name: 'Delete' }).click();
	const confirm = page.getByRole('dialog');
	await expect(confirm.getByText(`Delete ${renamed}?`)).toBeVisible();
	await confirm.getByRole('button', { name: 'Delete schedule' }).click();
	await expect(page.locator('[data-slot="card"]', { hasText: renamed })).toHaveCount(0);
});

test('schedules: duplicate opens the prefilled wizard', async ({ page }) => {
	await login(page, ADMIN);

	await page.goto('/schedules');
	const demoCard = page.locator('[data-slot="card"]', { hasText: BASE }).first();
	await expect(demoCard).toBeVisible();
	await demoCard.getByRole('button', { name: 'Duplicate' }).click();

	// Lands on the wizard in duplicate mode with the source prefilled.
	await expect(page).toHaveURL(/\/schedules\/new\?source=/);
	await expect(page.getByRole('heading', { name: 'Duplicate Schedule' })).toBeVisible();
	await expect(page.locator('#name')).toHaveValue(new RegExp(`Copy of ${BASE}`));
});
