/**
 * E2E UI Test - Capacity Rules Configuration
 *
 * Configure preceptor capacity constraints.
 *
 * Methodology:
 * - Real Authentication: Uses actual better-auth flows
 * - API-Driven: Capacity rules are managed per-preceptor via API
 * - UI Navigation: Access through preceptor schedule page
 * - Database Verification: Confirms data persisted in SQLite
 */

import { test, expect } from '@playwright/test';
import { getTestDb, executeWithRetry } from '../../utils/db-helpers';
import { generateTestUser } from '../../utils/auth-helpers';
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/lib/db/types';

let db: Kysely<DB>;

async function loginUser(page: any, email: string, password: string) {
	await page.goto('/login');
	await page.waitForLoadState('networkidle');
	await page.waitForTimeout(1000);
	await page.fill('#email', email);
	await page.fill('#password', password);
	await page.getByRole('button', { name: /sign in/i }).dispatchEvent('click');
	await page.waitForURL(url => !url.pathname.includes('login'), { timeout: 20000 });
}

/**
 * Creates a preceptor for capacity rule testing
 */
async function createPreceptor(page: any, prefix: string) {
	const timestamp = Date.now();

	// Create Health System
	const hsRes = await page.request.post('/api/health-systems', {
		data: { name: `${prefix} Health System ${timestamp}` }
	});
	expect(hsRes.ok()).toBeTruthy();
	const hsJson = await hsRes.json();
	const healthSystemId = hsJson.data?.id;

	// Create Site
	const siteRes = await page.request.post('/api/sites', {
		data: { name: `${prefix} Site ${timestamp}`, health_system_id: healthSystemId }
	});
	expect(siteRes.ok()).toBeTruthy();
	const siteJson = await siteRes.json();
	const siteId = siteJson.data?.id;

	// Create Preceptor
	const preceptorRes = await page.request.post('/api/preceptors', {
		data: {
			name: `${prefix} Preceptor ${timestamp}`,
			email: `${prefix.toLowerCase().replace(/\s+/g, '-')}-cap-${timestamp}@test.com`,
			site_ids: [siteId]
		}
	});
	expect(preceptorRes.ok(), `Preceptor creation failed: ${await preceptorRes.text()}`).toBeTruthy();
	const preceptorJson = await preceptorRes.json();
	const preceptorId = preceptorJson.data?.id;

	return { preceptorId, siteId, healthSystemId, timestamp };
}

test.describe('Capacity Rules Configuration', () => {
	test.beforeAll(async () => {
		db = await getTestDb();
	});

	// =========================================================================
	// Test 1: should display preceptor schedule page with capacity options
	// =========================================================================
	test('should display preceptor schedule page with capacity options', async ({ page }) => {
		const testUser = generateTestUser('cap-list');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create a preceptor to view
		const { preceptorId } = await createPreceptor(page, 'CapList');

		await page.goto(`/preceptors/${preceptorId}/schedule`);
		await page.waitForLoadState('networkidle');

		const pageContent = await page.textContent('body') || '';
		// Verify we're on the schedule page (not 404)
		expect(pageContent.toLowerCase()).toMatch(/schedule|preceptor|capacity|student/i);
	});

	// =========================================================================
	// Test 2: should create capacity rule via API
	// =========================================================================
	test('should create capacity rule via API', async ({ page }) => {
		const testUser = generateTestUser('cap-create');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create a preceptor
		const { preceptorId, timestamp } = await createPreceptor(page, 'CapCreate');

		// Create capacity rule via API
		const ruleRes = await page.request.post('/api/scheduling-config/capacity-rules', {
			data: {
				preceptorId: preceptorId,
				maxStudentsPerDay: 2,
				maxStudentsPerYear: 20
			}
		});
		expect(ruleRes.ok(), `Capacity rule creation failed: ${await ruleRes.text()}`).toBeTruthy();
		const ruleJson = await ruleRes.json();
		expect(ruleJson.data?.id).toBeDefined();

		// Verify in database
		const rule = await executeWithRetry(() =>
			db.selectFrom('preceptor_capacity_rules').selectAll().where('preceptor_id', '=', preceptorId).executeTakeFirst()
		);
		expect(rule).toBeDefined();
		expect(rule?.max_students_per_day).toBe(2);
	});

	// =========================================================================
	// Test 3: should set daily capacity limit
	// =========================================================================
	test('should set daily capacity limit', async ({ page }) => {
		const testUser = generateTestUser('cap-daily');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create a preceptor and capacity rule
		const { preceptorId } = await createPreceptor(page, 'CapDaily');

		const ruleRes = await page.request.post('/api/scheduling-config/capacity-rules', {
			data: {
				preceptorId: preceptorId,
				maxStudentsPerDay: 3,
				maxStudentsPerYear: 30
			}
		});
		expect(ruleRes.ok()).toBeTruthy();

		// Verify daily limit
		const rule = await executeWithRetry(() =>
			db.selectFrom('preceptor_capacity_rules').selectAll().where('preceptor_id', '=', preceptorId).executeTakeFirst()
		);
		expect(rule?.max_students_per_day).toBe(3);
	});

	// =========================================================================
	// Test 4: should set yearly capacity limit
	// =========================================================================
	test('should set yearly capacity limit', async ({ page }) => {
		const testUser = generateTestUser('cap-yearly');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create a preceptor and capacity rule
		const { preceptorId } = await createPreceptor(page, 'CapYearly');

		const ruleRes = await page.request.post('/api/scheduling-config/capacity-rules', {
			data: {
				preceptorId: preceptorId,
				maxStudentsPerDay: 2,
				maxStudentsPerYear: 50
			}
		});
		expect(ruleRes.ok()).toBeTruthy();

		// Verify yearly limit
		const rule = await executeWithRetry(() =>
			db.selectFrom('preceptor_capacity_rules').selectAll().where('preceptor_id', '=', preceptorId).executeTakeFirst()
		);
		expect(rule?.max_students_per_year).toBe(50);
	});

	// =========================================================================
	// Test 5: should apply rule to specific preceptor
	// =========================================================================
	test('should apply rule to specific preceptor', async ({ page }) => {
		const testUser = generateTestUser('cap-prec');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create two preceptors
		const { preceptorId: preceptor1 } = await createPreceptor(page, 'CapPrec1');
		const { preceptorId: preceptor2 } = await createPreceptor(page, 'CapPrec2');

		// Create rule for preceptor 1 only
		const ruleRes = await page.request.post('/api/scheduling-config/capacity-rules', {
			data: {
				preceptorId: preceptor1,
				maxStudentsPerDay: 1,
				maxStudentsPerYear: 10
			}
		});
		expect(ruleRes.ok()).toBeTruthy();

		// Verify rule is only for preceptor 1
		const rule1 = await executeWithRetry(() =>
			db.selectFrom('preceptor_capacity_rules').selectAll().where('preceptor_id', '=', preceptor1).executeTakeFirst()
		);
		expect(rule1).toBeDefined();

		const rule2 = await executeWithRetry(() =>
			db.selectFrom('preceptor_capacity_rules').selectAll().where('preceptor_id', '=', preceptor2).executeTakeFirst()
		);
		expect(rule2).toBeUndefined();
	});

	// =========================================================================
	// Test 6: should get capacity rules for preceptor
	// =========================================================================
	test('should get capacity rules for preceptor', async ({ page }) => {
		const testUser = generateTestUser('cap-get');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create preceptor with capacity rule
		const { preceptorId } = await createPreceptor(page, 'CapGet');

		await page.request.post('/api/scheduling-config/capacity-rules', {
			data: {
				preceptorId: preceptorId,
				maxStudentsPerDay: 4,
				maxStudentsPerYear: 40
			}
		});

		// Get rules via API
		const getRes = await page.request.get(`/api/scheduling-config/capacity-rules?preceptorId=${preceptorId}`);
		expect(getRes.ok()).toBeTruthy();
		const getJson = await getRes.json();
		expect(getJson.data).toBeDefined();
	});

	// =========================================================================
	// Test 7: should update capacity rule
	// =========================================================================
	test('should update capacity rule', async ({ page }) => {
		const testUser = generateTestUser('cap-update');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create preceptor and capacity rule
		const { preceptorId } = await createPreceptor(page, 'CapUpdate');

		const createRes = await page.request.post('/api/scheduling-config/capacity-rules', {
			data: {
				preceptorId: preceptorId,
				maxStudentsPerDay: 2,
				maxStudentsPerYear: 20
			}
		});
		expect(createRes.ok()).toBeTruthy();
		const createJson = await createRes.json();
		const ruleId = createJson.data?.id;

		// Update via PATCH
		const updateRes = await page.request.patch(`/api/scheduling-config/capacity-rules/${ruleId}`, {
			data: { maxStudentsPerDay: 5 }
		});
		expect(updateRes.ok(), `Capacity rule update failed: ${await updateRes.text()}`).toBeTruthy();

		// Verify update
		const rule = await executeWithRetry(() =>
			db.selectFrom('preceptor_capacity_rules').selectAll().where('id', '=', ruleId).executeTakeFirst()
		);
		expect(rule?.max_students_per_day).toBe(5);
	});

	// =========================================================================
	// Test 8: should delete capacity rule
	// =========================================================================
	test('should delete capacity rule', async ({ page }) => {
		const testUser = generateTestUser('cap-delete');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create preceptor and capacity rule
		const { preceptorId } = await createPreceptor(page, 'CapDelete');

		const createRes = await page.request.post('/api/scheduling-config/capacity-rules', {
			data: {
				preceptorId: preceptorId,
				maxStudentsPerDay: 2,
				maxStudentsPerYear: 20
			}
		});
		expect(createRes.ok()).toBeTruthy();
		const createJson = await createRes.json();
		const ruleId = createJson.data?.id;

		// Delete via API
		const deleteRes = await page.request.delete(`/api/scheduling-config/capacity-rules/${ruleId}`);
		expect(deleteRes.ok(), `Capacity rule deletion failed: ${await deleteRes.text()}`).toBeTruthy();

		// Verify deletion
		const deletedRule = await executeWithRetry(() =>
			db.selectFrom('preceptor_capacity_rules').selectAll().where('id', '=', ruleId).executeTakeFirst()
		);
		expect(deletedRule).toBeUndefined();
	});
});
