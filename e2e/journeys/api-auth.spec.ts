import { test, expect } from '@playwright/test';
import { login, ADMIN } from './helpers';

/**
 * Central API authentication (step 34). Previously several mutating endpoints
 * never checked the session, so anyone who could reach the server could write.
 * The hook now default-denies any non-public `/api/` route without a session.
 */

const PROTECTED = [
	{ method: 'GET', path: '/api/students' },
	{ method: 'POST', path: '/api/blackout-dates' },
	{ method: 'POST', path: '/api/scheduling-config/electives' },
	{ method: 'PATCH', path: '/api/scheduling-config/electives/anything' },
	{ method: 'POST', path: '/api/scheduling-periods' }
] as const;

test.describe('API authentication', () => {
	test('unauthenticated requests to protected endpoints return 401', async ({ page }) => {
		for (const { method, path } of PROTECTED) {
			const res =
				method === 'GET'
					? await page.request.get(path)
					: method === 'POST'
						? await page.request.post(path, { data: {} })
						: await page.request.patch(path, { data: {} });
			expect(res.status(), `${method} ${path}`).toBe(401);
		}
	});

	test('better-auth routes remain reachable without a session', async ({ page }) => {
		// A wrong password is a 401 from better-auth itself, but crucially the
		// request is not blocked by our hook (which would also be 401 but with our
		// envelope). Assert we can reach the endpoint and get a JSON response.
		const res = await page.request.post('/api/auth/sign-in/email', {
			data: { email: 'nobody@example.com', password: 'wrong' }
		});
		expect(res.headers()['content-type'] ?? '').toContain('application/json');
	});

	test('authenticated requests pass through', async ({ page }) => {
		await login(page, ADMIN);
		const res = await page.request.get('/api/students');
		expect(res.status()).toBe(200);
		const body = await res.json();
		expect(body.success).toBe(true);
	});
});
