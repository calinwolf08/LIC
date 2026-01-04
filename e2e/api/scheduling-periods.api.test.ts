/**
 * Scheduling Periods API Tests
 *
 * Tests for authentication and authorization of scheduling periods endpoints.
 */

import { test, expect } from '@playwright/test';
import { createApiClient } from './helpers/api-client';
import { generateTestUser } from '../utils/auth-helpers';
import { getTestDb, executeWithRetry } from '../utils/db-helpers';
import type { Kysely } from 'kysely';
import type { DB } from '../../src/lib/db/types';

let db: Kysely<DB>;

test.describe('Scheduling Periods API', () => {
	test.beforeAll(async () => {
		db = await getTestDb();
	});

	test.describe('Authentication', () => {
		test('GET /api/scheduling-periods should return 401 when unauthenticated', async ({
			request
		}) => {
			const api = createApiClient(request);

			// Make request without any session cookies
			const response = await api.get('/api/scheduling-periods');

			// Should return 401 Unauthorized
			expect(response.status()).toBe(401);

			const body = await response.json();
			expect(body.success).toBe(false);
			expect(body.error).toBeDefined();
		});

		test('POST /api/scheduling-periods should return 401 when unauthenticated', async ({
			request
		}) => {
			const api = createApiClient(request);

			// Attempt to create a schedule without authentication
			const response = await api.post('/api/scheduling-periods', {
				name: 'Test Schedule',
				start_date: '2025-01-01',
				end_date: '2025-12-31'
			});

			// Should return 401 Unauthorized
			expect(response.status()).toBe(401);

			const body = await response.json();
			expect(body.success).toBe(false);
		});
	});

	test.describe('User Isolation', () => {
		test('GET /api/scheduling-periods should only return schedules for the authenticated user', async ({
			page
		}) => {
			// Create two test users
			const user1 = generateTestUser('user1-isolation');
			const user2 = generateTestUser('user2-isolation');

			// Clear any existing session
			await page.context().clearCookies();

			// Register user 1 via API (this auto-creates their schedule)
			const signup1Response = await page.request.post('/api/auth/sign-up/email', {
				data: {
					name: user1.name,
					email: user1.email,
					password: user1.password
				}
			});
			expect(signup1Response.ok()).toBeTruthy();

			// Get user1's ID from database
			const dbUser1 = await executeWithRetry(() =>
				db.selectFrom('user').selectAll().where('email', '=', user1.email).executeTakeFirst()
			);
			expect(dbUser1).toBeDefined();

			// Clear session before signing up user 2
			await page.context().clearCookies();

			// Register user 2 via API (this auto-creates their schedule)
			const signup2Response = await page.request.post('/api/auth/sign-up/email', {
				data: {
					name: user2.name,
					email: user2.email,
					password: user2.password
				}
			});
			expect(signup2Response.ok()).toBeTruthy();

			// Get user2's ID from database
			const dbUser2 = await executeWithRetry(() =>
				db.selectFrom('user').selectAll().where('email', '=', user2.email).executeTakeFirst()
			);
			expect(dbUser2).toBeDefined();

			// Verify each user has their own schedule
			const user1Schedules = await executeWithRetry(() =>
				db
					.selectFrom('scheduling_periods')
					.selectAll()
					.where('user_id', '=', dbUser1!.id)
					.execute()
			);
			expect(user1Schedules.length).toBeGreaterThan(0);

			const user2Schedules = await executeWithRetry(() =>
				db
					.selectFrom('scheduling_periods')
					.selectAll()
					.where('user_id', '=', dbUser2!.id)
					.execute()
			);
			expect(user2Schedules.length).toBeGreaterThan(0);

			// Login as user 1 and check they only see their schedules
			await page.goto('/login');
			await page.waitForLoadState('networkidle');
			await page.fill('#email', user1.email);
			await page.fill('#password', user1.password);
			await page.getByRole('button', { name: /sign in/i }).dispatchEvent('click');
			await page.waitForURL((url) => !url.pathname.includes('login'), { timeout: 20000 });

			// Complete welcome modal if it appears
			const welcomeHeading = page.getByText('Welcome to LIC Scheduler!');
			if (await welcomeHeading.isVisible({ timeout: 2000 }).catch(() => false)) {
				await page.getByRole('button', { name: /get started/i }).click();
				await expect(welcomeHeading).not.toBeVisible({ timeout: 5000 });
			}

			// Make authenticated API request as user 1
			const user1Response = await page.request.get('/api/scheduling-periods');
			expect(user1Response.ok()).toBeTruthy();

			const user1Data = await user1Response.json();
			expect(user1Data.success).toBe(true);
			expect(user1Data.data).toBeInstanceOf(Array);

			// Verify user1 only sees their own schedules
			for (const schedule of user1Data.data) {
				expect(schedule.user_id).toBe(dbUser1!.id);
			}

			// Verify user1 doesn't see user2's schedules
			const user2ScheduleIds = user2Schedules.map((s) => s.id);
			for (const schedule of user1Data.data) {
				expect(user2ScheduleIds).not.toContain(schedule.id);
			}
		});
	});
});
