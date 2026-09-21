// @coverage @req(R1.1) @req(R1.2)
/**
 * J1.1 — Account lifecycle (e2e plan Phase 1).
 *
 * Register with the validation edge cases, land schedule-first, sign out and
 * back in, prove remember-me changes the session cookie's lifetime, and prove a
 * deep link taken while logged out round-trips through /login back to its full
 * path + query. Auth is always driven through the real forms.
 */

import { test, expect, uniqueEmail, apiOf } from '../../fixtures';

test.describe('J1.1 account lifecycle', { tag: ['@stage1'] }, () => {
	test('register: inline validation blocks bad input, a clean submit lands schedule-first', async ({
		page
	}) => {
		await page.goto('/register');
		await page.locator('form[data-hydrated="true"]').waitFor({ state: 'attached' });

		// Submitting an empty / bad form shows inline field errors and does NOT navigate.
		await page.locator('#name').fill('A'); // too short
		await page.locator('#email').fill('not-an-email');
		await page.locator('#password').fill('short'); // < 8
		await page.locator('#confirmPassword').fill('different');
		await page.getByRole('button', { name: /create account/i }).click();

		await expect(page).toHaveURL(/\/register/);
		await expect(page.getByText('Name must be at least 2 characters')).toBeVisible();
		await expect(page.getByText('Please enter a valid email address')).toBeVisible();
		await expect(page.getByText('Password must be at least 8 characters').first()).toBeVisible();
		await expect(page.getByText('Passwords do not match')).toBeVisible();

		// Fix everything → the account is created and the app routes into the
		// schedule-first flow (a brand-new account has no data yet).
		const email = uniqueEmail('j11');
		await page.locator('#name').fill('Journey One One');
		await page.locator('#email').fill(email);
		await page.locator('#password').fill('password123');
		await page.locator('#confirmPassword').fill('password123');
		await page.getByRole('button', { name: /create account/i }).click();

		await expect(page).not.toHaveURL(/\/register/, { timeout: 15000 });
		// The sign-up hook creates a first schedule, so the switcher is present.
		await page.goto('/dashboard');
		await expect(page.getByTestId('schedule-switcher')).toBeVisible({ timeout: 15000 });
	});

	test('register: a duplicate email is refused in-context, not as a crash', async ({ page }) => {
		await page.goto('/register');
		await page.locator('form[data-hydrated="true"]').waitFor({ state: 'attached' });
		await page.locator('#name').fill('Duplicate User');
		await page.locator('#email').fill('admin@example.com'); // already seeded
		await page.locator('#password').fill('password123');
		await page.locator('#confirmPassword').fill('password123');
		await page.getByRole('button', { name: /create account/i }).click();

		// Stays on /register with a visible error alert (not a 500, not a redirect).
		await expect(page).toHaveURL(/\/register/);
		await expect(page.getByRole('alert')).toBeVisible({ timeout: 15000 });
	});

	test('remember-me makes the session cookie persistent; without it, it is session-only', async ({
		browser,
		contextOptions,
		asFreshUser
	}) => {
		const { user } = asFreshUser;

		const cookieExpiry = async (rememberMe: boolean): Promise<number> => {
			const ctx = await browser.newContext(contextOptions);
			const page = await ctx.newPage();
			await page.goto('/login');
			await page.locator('form[data-hydrated="true"]').waitFor({ state: 'attached' });
			await page.locator('#email').fill(user.email);
			await page.locator('#password').fill(user.password);
			if (rememberMe) await page.locator('#rememberMe').check();
			await page.getByRole('button', { name: /sign in/i }).click();
			await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
			const cookies = await ctx.cookies();
			const session = cookies.find((c) => /session|better-auth/i.test(c.name) && c.expires > 0);
			// A session-only cookie reports expires === -1 in Playwright.
			const anySession = cookies.find((c) => /session|better-auth/i.test(c.name));
			expect(anySession, 'a session cookie should be set after login').toBeTruthy();
			const expiry = session?.expires ?? -1;
			await ctx.close();
			return expiry;
		};

		const remembered = await cookieExpiry(true);
		const notRemembered = await cookieExpiry(false);
		// Remember-me sets a real future expiry; the plain login is session-scoped.
		expect(remembered).toBeGreaterThan(Date.now() / 1000);
		expect(notRemembered).toBeLessThan(remembered);
	});

	test('a deep link taken while logged out round-trips through login with its full path + query', async ({
		browser,
		contextOptions,
		asFreshUser
	}) => {
		const { user } = asFreshUser;
		const ctx = await browser.newContext(contextOptions);
		const page = await ctx.newPage();
		try {
			// Anonymous deep link to a schedule-scoped page WITH a query string.
			await page.goto('/students?tab=progress');
			await expect(page).toHaveURL(/\/login\?redirectTo=/, { timeout: 15000 });
			const redirectTo = new URL(page.url()).searchParams.get('redirectTo');
			expect(redirectTo).toBe('/students?tab=progress');

			await page.locator('form[data-hydrated="true"]').waitFor({ state: 'attached' });
			await page.locator('#email').fill(user.email);
			await page.locator('#password').fill(user.password);
			await page.getByRole('button', { name: /sign in/i }).click();

			// Lands back on the ORIGINAL target, query string intact.
			await expect(page).toHaveURL(/\/students\?tab=progress/, { timeout: 15000 });
		} finally {
			await ctx.close();
		}
	});

	test('protected API is 401 (JSON envelope) when logged out; auth routes stay reachable', async ({
		browser,
		contextOptions
	}) => {
		const ctx = await browser.newContext(contextOptions);
		const page = await ctx.newPage();
		try {
			const res = await apiOf(page).get('/api/students');
			expect(res.status).toBe(401);
			expect(res.ok).toBe(false);
			// A better-auth route answers without a session (used by the login form).
			const authRes = await page.request.get('/api/auth/get-session');
			expect(authRes.status()).toBeLessThan(500);
		} finally {
			await ctx.close();
		}
	});

	test('a wrong password shows an in-context error, not a 500', async ({
		asFreshUser,
		browser,
		contextOptions
	}) => {
		const { user } = asFreshUser;
		const ctx = await browser.newContext(contextOptions);
		const page = await ctx.newPage();
		try {
			await page.goto('/login');
			await page.locator('form[data-hydrated="true"]').waitFor({ state: 'attached' });
			await page.locator('#email').fill(user.email);
			await page.locator('#password').fill('wrong-password-xyz');
			await page.getByRole('button', { name: /sign in/i }).click();
			await expect(page.getByRole('alert')).toBeVisible({ timeout: 15000 });
			await expect(page).toHaveURL(/\/login/);
		} finally {
			await ctx.close();
		}
	});
});
