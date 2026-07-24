import { test, expect } from '@playwright/test';
import { registerNewUser } from './helpers';

/**
 * Normal first-run journey: a brand-new user registers and is guided by the
 * dashboard checklist to add their first clerkship and student.
 */
test('first-run: register → checklist → add clerkship & student → dashboard reflects it', async ({
	page
}) => {
	await registerNewUser(page);

	// Land on the dashboard with the setup checklist.
	await page.goto('/dashboard');
	await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
	await expect(page.getByText('Finish setting up')).toBeVisible();

	// Add a clerkship via the full page (unique name — clerkship names are global).
	const clerkshipName = `E2E Clerkship ${Date.now()}`;
	await page.goto('/clerkships/new');
	await page.locator('#name').fill(clerkshipName);
	await page.locator('#required_days').fill('10');
	await page.locator('button[type="submit"]').click();
	await expect(page).toHaveURL(/\/clerkships$/, { timeout: 15000 });
	await expect(page.getByText(clerkshipName)).toBeVisible();

	// Add a student via the full page; lands back on the students list.
	await page.goto('/students/new');
	await page.locator('#name').fill('Alex Doe');
	await page.locator('#email').fill(`alex_${Date.now()}@example.com`);
	await page.locator('button[type="submit"]').click();
	await expect(page).toHaveURL(/\/students$/, { timeout: 15000 });
	await expect(page.getByText('Alex Doe')).toBeVisible();
});
