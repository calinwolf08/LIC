// @coverage @req(R2.1) @req(R2.2) @req(R2.3)
/**
 * J2.3 — The student detail page as the hub for one student (e2e plan Phase 2).
 *
 * Create → Overview shows identity read-only → Details tab inline edit → complete
 * onboarding at one health system → Progress lists every clerkship in the
 * schedule → the list reflects the student's status. Plus: duplicate email is
 * refused inline, `/students/[id]/edit` redirects to the detail page (editing is
 * inline, spec §6), and delete-blocked-by-assignments surfaces in-context.
 */

import { test, expect, apiOf, uniqueEmail } from '../../fixtures';
import { customModal, openCustomModal } from './helpers';

test.describe('J2.3 student hub', { tag: ['@stage1'] }, () => {
	test('create → hub tabs, inline edit, onboarding, progress, list status', async ({ asAdmin }) => {
		test.setTimeout(120000);
		// Runs on the seeded Demo Schedule (which has health systems and clerkships
		// so Onboarding and Progress have content); the created student carries no
		// assignments and is deleted at the end to leave the schedule as found.
		const stamp = Date.now();
		const name = `Hub Student ${stamp}`;
		const renamed = `${name} (edited)`;
		const email = uniqueEmail('hub');

		// --- Create ---
		await asAdmin.goto('/students/new');
		await asAdmin.locator('#name').fill(name);
		await asAdmin.locator('#email').fill(email);
		await asAdmin.getByRole('button', { name: /^create$/i }).click();
		await expect(asAdmin).toHaveURL(/\/students$/, { timeout: 15000 });

		// --- Open the detail hub; Overview shows identity read-only ---
		await asAdmin.getByRole('button', { name }).click();
		await expect(asAdmin.getByRole('tab', { name: 'Overview' })).toBeVisible();
		await expect(asAdmin.getByRole('heading', { name })).toBeVisible();

		// --- Details tab: inline edit ---
		await asAdmin.getByRole('tab', { name: 'Details' }).click();
		await asAdmin.locator('#name').fill(renamed);
		await asAdmin.getByRole('button', { name: /^update$/i }).click();
		await expect(asAdmin.getByText(/student updated/i)).toBeVisible({ timeout: 10000 });

		// --- Onboarding tab: complete at the first seeded health system ---
		await asAdmin.getByRole('tab', { name: 'Onboarding' }).click();
		const hsCheckbox = asAdmin.getByRole('checkbox').first();
		await expect(hsCheckbox).toBeVisible({ timeout: 10000 });
		await hsCheckbox.check();
		await expect(asAdmin.getByText(/completed/i).first()).toBeVisible({ timeout: 10000 });

		// --- Progress tab: lists clerkships in the schedule (0 done for a new student) ---
		await asAdmin.getByRole('tab', { name: 'Progress' }).click();
		await expect(asAdmin.getByText(/clerkship progress|left \//i).first()).toBeVisible({
			timeout: 10000
		});

		// --- Schedule tab renders (empty for a brand-new student) ---
		await asAdmin.getByRole('tab', { name: 'Schedule' }).click();

		// --- The list shows the student as unscheduled with 0% completion ---
		await asAdmin.goto('/students');
		const row = asAdmin.locator('tr', { hasText: renamed });
		await expect(row).toBeVisible();
		// A brand-new student has nothing scheduled → 0% completion. (The state
		// label is "none" when no requirements are computed yet.)
		await expect(row.getByTestId('student-status')).toHaveAttribute('data-percent', '0');

		// --- Cleanup: delete the throwaway student (no assignments → succeeds) ---
		const delModal = await openCustomModal(
			asAdmin,
			row.getByRole('button', { name: 'Delete' }),
			'Delete Student'
		);
		await delModal.getByRole('button', { name: 'Delete', exact: true }).click();
		await expect(asAdmin.locator('tr', { hasText: renamed })).toHaveCount(0, { timeout: 10000 });
	});

	test('duplicate email is refused inline', async ({ asAdmin, sandbox }) => {
		await sandbox.create(asAdmin, { name: `StuDup ${Date.now()}` });
		const email = uniqueEmail('dup');
		for (let i = 0; i < 2; i++) {
			await asAdmin.goto('/students/new');
			await asAdmin.locator('#name').fill(`Dup ${i} ${Date.now()}`);
			await asAdmin.locator('#email').fill(email);
			await asAdmin.getByRole('button', { name: /^create$/i }).click();
			if (i === 0) {
				await expect(asAdmin).toHaveURL(/\/students$/, { timeout: 15000 });
			}
		}
		// Second attempt with the same email stays on the form with an inline error.
		await expect(asAdmin.getByText(/already exists|in use|duplicate/i).first()).toBeVisible({
			timeout: 10000
		});
		await expect(asAdmin).toHaveURL(/\/students\/new/);
	});

	test('/students/[id]/edit redirects to the inline detail page (spec §6)', async ({ asAdmin }) => {
		const students = await apiOf(asAdmin).get<Array<{ id: string }>>('/api/students');
		const id = students.data?.[0]?.id;
		expect(id).toBeTruthy();
		await asAdmin.goto(`/students/${id}/edit`);
		await expect(asAdmin).toHaveURL(new RegExp(`/students/${id}$`), { timeout: 15000 });
	});

	test('deleting a student who has assignments is refused in-context', async ({ asAdmin }) => {
		// Runs on the seeded Demo Schedule. Alice Johnson holds the seeded clean
		// block, so the delete is refused and she remains — non-destructive.
		await asAdmin.goto('/students');
		const row = asAdmin.locator('tr', { hasText: 'Alice Johnson' });
		await expect(row).toBeVisible({ timeout: 15000 });
		await row.getByRole('button', { name: 'Delete' }).click();
		const modal = customModal(asAdmin, 'Delete Student');
		await modal.getByRole('button', { name: 'Delete', exact: true }).click();
		// The dialog shows the refusal inline and stays open; Alice is not deleted.
		await expect(modal.getByText(/assignment|cannot|associated|scheduled/i).first()).toBeVisible({
			timeout: 10000
		});
		await modal.getByRole('button', { name: 'Cancel' }).click();
		await expect(asAdmin.locator('tr', { hasText: 'Alice Johnson' })).toBeVisible();
	});
});
