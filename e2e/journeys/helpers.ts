import { expect, type Page } from '@playwright/test';

export {
	TEST_SCHEDULE as SEED_SCHEDULE,
	fromToday,
	today,
	monthStart,
	monthEnd
} from '../../src/lib/db/scripts/seed-schedule';

export const ADMIN = { email: 'admin@example.com', password: 'password123' };
export const BASIC = { email: 'basic@example.com', password: 'password123' };

/**
 * Log in through the real login form and wait until we've left /login.
 *
 * Waits on the form's explicit `data-hydrated` signal (step 38) so the submit
 * handler is guaranteed attached before the single click — no blind retry loop.
 */
export async function login(page: Page, user: { email: string; password: string }) {
	await page.goto('/login');

	// Hydration is the real precondition for the click landing on a live handler.
	await page.locator('form[data-hydrated="true"]').waitFor({ state: 'attached', timeout: 15000 });

	await page.locator('#email').fill(user.email);
	await page.locator('#password').fill(user.password);
	await page.getByRole('button', { name: /sign in/i }).click();

	await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
}

/**
 * Register a brand-new user through the real register form.
 * Returns the generated email.
 */
export async function registerNewUser(page: Page): Promise<string> {
	const email = `e2e_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
	await page.goto('/register');
	// Wait for the form to hydrate before touching it (step 38).
	await page.locator('form[data-hydrated="true"]').waitFor({ state: 'attached', timeout: 15000 });
	// Register form fields mirror the login form ids where possible.
	await page.locator('#name').fill('E2E User');
	await page.locator('#email').fill(email);
	await page.locator('#password').fill('password123');
	const confirm = page.locator('#confirmPassword');
	if (await confirm.count()) await confirm.fill('password123');
	await page.getByRole('button', { name: /create account|sign up|register/i }).click();
	await expect(page).not.toHaveURL(/\/register/, { timeout: 15000 });
	return email;
}
