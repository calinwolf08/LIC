/**
 * Identity helpers shared by the fixtures and by journeys that need to sign in
 * as a specific person mid-test (e.g. tenant A → tenant B comparisons).
 *
 * Everything goes through the real forms — no auth bypass — so a journey proves
 * the same code path a coordinator uses.
 */

import { expect, type Page } from '@playwright/test';

export interface Credentials {
	email: string;
	password: string;
}

/** Seeded, Stage 2 entitled (`autogen`). Owns the "Demo Schedule". */
export const ADMIN: Credentials = { email: 'admin@example.com', password: 'password123' };
/** Seeded, NOT entitled. Owns "Tenant B Schedule". */
export const BASIC: Credentials = { email: 'basic@example.com', password: 'password123' };

/** A unique, clearly test-owned e-mail address. */
export function uniqueEmail(prefix = 'e2e'): string {
	return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
}

/**
 * Log in through the real login form and wait until we've left /login.
 *
 * Waits on the form's explicit `data-hydrated` signal so the submit handler is
 * guaranteed attached before the single click — no blind retry loop.
 */
export async function loginViaForm(page: Page, user: Credentials): Promise<void> {
	await page.goto('/login');
	await page.locator('form[data-hydrated="true"]').waitFor({ state: 'attached', timeout: 15000 });
	await page.locator('#email').fill(user.email);
	await page.locator('#password').fill(user.password);
	await page.getByRole('button', { name: /sign in/i }).click();
	await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
}

/**
 * Name the organization on /onboarding/organization (where a new account lands)
 * and wait until the app takes over.
 */
export async function completeOrganizationOnboarding(page: Page, name: string): Promise<void> {
	await expect(page).toHaveURL(/\/onboarding\/organization/, { timeout: 15000 });
	await page.locator('form[data-hydrated="true"]').waitFor({ state: 'attached', timeout: 15000 });
	await page.locator('#name').fill(name);
	await page.getByRole('button', { name: /continue/i }).click();
	await expect(page).not.toHaveURL(/\/onboarding\//, { timeout: 15000 });
}

/**
 * Register a brand-new account through the real register form, then name its
 * organization. The auth hook creates a first schedule and the app routes the
 * new user into the schedule-first flow.
 */
export async function registerViaForm(
	page: Page,
	opts: { name?: string; password?: string; email?: string; organizationName?: string } = {}
): Promise<Credentials & { name: string; organizationName: string }> {
	const email = opts.email ?? uniqueEmail();
	const password = opts.password ?? 'password123';
	const name = opts.name ?? 'E2E User';
	const organizationName = opts.organizationName ?? 'E2E Program';
	await page.goto('/register');
	await page.locator('form[data-hydrated="true"]').waitFor({ state: 'attached', timeout: 15000 });
	await page.locator('#name').fill(name);
	await page.locator('#email').fill(email);
	await page.locator('#password').fill(password);
	const confirm = page.locator('#confirmPassword');
	if (await confirm.count()) await confirm.fill(password);
	await page.getByRole('button', { name: /create account|sign up|register/i }).click();
	await expect(page).not.toHaveURL(/\/register/, { timeout: 15000 });
	await completeOrganizationOnboarding(page, organizationName);
	return { email, password, name, organizationName };
}

/** Drop the session cookie so the next navigation is anonymous. */
export async function signOut(page: Page): Promise<void> {
	await page.context().clearCookies();
}
