/**
 * E2E Authentication Helpers
 *
 * Helper functions for authentication operations in E2E tests.
 * Uses real better-auth flows (no E2E_TESTING bypass).
 */

import type { Page } from '@playwright/test';

export interface UserCredentials {
	name: string;
	email: string;
	password: string;
}

/**
 * Register a new user via the UI
 */
export async function registerUser(page: Page, user: UserCredentials): Promise<void> {
	await page.goto('/register');
	await page.waitForLoadState('networkidle');

	await page.fill('#name', user.name);
	await page.fill('#email', user.email);
	await page.fill('#password', user.password);
	await page.fill('#confirmPassword', user.password);

	await page.click('button[type="submit"]');
	await page.waitForURL(/^\/(?!register)/, { timeout: 10000 });
}

/**
 * Login an existing user via the UI
 */
export async function loginUser(page: Page, email: string, password: string): Promise<void> {
	await page.goto('/login');
	await page.waitForLoadState('networkidle');

	await page.fill('#email', email);
	await page.fill('#password', password);

	await page.click('button[type="submit"]');
	await page.waitForURL(/^\/(?!login|register)/, { timeout: 10000 });
}

/**
 * Login with remember me option
 */
export async function loginWithRememberMe(page: Page, email: string, password: string): Promise<void> {
	await page.goto('/login');
	await page.waitForLoadState('networkidle');

	await page.fill('#email', email);
	await page.fill('#password', password);
	await page.click('#rememberMe');

	await page.click('button[type="submit"]');
	await page.waitForURL(/^\/(?!login|register)/, { timeout: 10000 });
}

/**
 * Logout the current user
 */
export async function logout(page: Page): Promise<void> {
	// Click user menu and logout
	const userMenuButton = page.locator('[data-testid="user-menu"]');
	if (await userMenuButton.isVisible()) {
		await userMenuButton.click();
		await page.click('[data-testid="logout"]');
	} else {
		// Try alternative logout mechanism (direct navigation or button)
		const logoutButton = page.getByRole('button', { name: /logout|sign out/i });
		if (await logoutButton.isVisible()) {
			await logoutButton.click();
		}
	}
	await page.waitForURL('/login', { timeout: 10000 });
}

/**
 * Check if user is currently authenticated
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
	// If we can access a protected route without redirect, we're authenticated
	const currentUrl = page.url();
	if (currentUrl.includes('/login') || currentUrl.includes('/register')) {
		return false;
	}
	return true;
}

/**
 * Generate unique test user credentials
 */
export function generateTestUser(prefix: string = 'test'): UserCredentials {
	const timestamp = Date.now();
	return {
		name: `${prefix} User ${timestamp}`,
		email: `${prefix}.${timestamp}@test.edu`,
		password: 'TestPassword123!'
	};
}
