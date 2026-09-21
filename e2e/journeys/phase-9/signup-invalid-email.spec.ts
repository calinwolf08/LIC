// @coverage @finding(CF-A1)
/**
 * CF-A1 — The "Sign up" link on the sign-in form validates the typed email.
 *
 * Client feedback: a coordinator typed an (invalid) email on the sign-in form,
 * clicked "Sign up", and nothing indicated the email was wrong. The hand-off now
 * validates first: an invalid email blocks navigation and surfaces the inline
 * field error; a valid one is carried to the register form so it isn't retyped.
 *
 * Anonymous flow — uses the default (logged-out) page fixture.
 */

import { test, expect } from '../../fixtures';

test.describe('CF-A1 sign-up hand-off validates the typed email', { tag: ['@stage1'] }, () => {
	test('an invalid email blocks the hand-off and shows the inline error', async ({ page }) => {
		await page.goto('/login');
		await page.locator('form[data-hydrated="true"]').waitFor({ state: 'attached', timeout: 15000 });

		await page.locator('#email').fill('not-an-email');
		await page.getByRole('link', { name: /sign up/i }).click();

		// Stayed on /login and the email field's validation error is visible.
		await expect(page).toHaveURL(/\/login/);
		await expect(page.getByText(/valid email address/i)).toBeVisible({ timeout: 10000 });
	});

	test('a valid typed email is carried to the register form', async ({ page }) => {
		await page.goto('/login');
		await page.locator('form[data-hydrated="true"]').waitFor({ state: 'attached', timeout: 15000 });

		const email = `carry_${Date.now()}@example.com`;
		await page.locator('#email').fill(email);
		await page.getByRole('link', { name: /sign up/i }).click();

		await expect(page).toHaveURL(/\/register/, { timeout: 10000 });
		await expect(page.locator('#email')).toHaveValue(email);
	});

	test('an empty email still navigates to register normally', async ({ page }) => {
		await page.goto('/login');
		await page.locator('form[data-hydrated="true"]').waitFor({ state: 'attached', timeout: 15000 });

		await page.getByRole('link', { name: /sign up/i }).click();
		await expect(page).toHaveURL(/\/register/, { timeout: 10000 });
	});
});
