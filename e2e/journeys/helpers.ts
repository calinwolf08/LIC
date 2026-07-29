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
 */
export async function login(page: Page, user: { email: string; password: string }) {
	await page.goto('/login');
	await page.waitForLoadState('networkidle');

	const email = page.locator('#email');
	const password = page.locator('#password');
	const signIn = page.getByRole('button', { name: /sign in/i });
	await signIn.waitFor({ state: 'visible' });

	// The submit handler only fires once the form has hydrated; under container
	// load hydration can take several seconds, so retry the fill+click and give
	// each attempt a generous window to actually leave /login.
	for (let attempt = 0; attempt < 6; attempt++) {
		if (await email.count()) await email.fill(user.email);
		if (await password.count()) await password.fill(user.password);
		await signIn.click();
		try {
			await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 6000 });
			return;
		} catch {
			// still on /login — the click likely landed before hydration; retry.
		}
	}
	await expect(page).not.toHaveURL(/\/login/, { timeout: 6000 });
}

/**
 * Register a brand-new user through the real register form.
 * Returns the generated email.
 */
export async function registerNewUser(page: Page): Promise<string> {
	const email = `e2e_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
	await page.goto('/register');
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

/** Dismiss any open toast so it doesn't intercept clicks. */
export async function settle(page: Page) {
	await page.waitForTimeout(300);
}
