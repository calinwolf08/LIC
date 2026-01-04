/**
 * E2E UI Test - Elective Management
 *
 * Elective CRUD through clerkship configuration page.
 *
 * Methodology:
 * - Real Authentication: Uses actual better-auth flows
 * - Full Data Hierarchy: Creates Clerkship → Electives via config page
 * - UI-Driven Actions: Tests actual page loads and form interactions
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
 * Creates a clerkship with required_days for testing electives
 */
async function createClerkship(page: any, prefix: string) {
	const timestamp = Date.now();
	const clerkshipRes = await page.request.post('/api/clerkships', {
		data: {
			name: `${prefix} Clerkship ${timestamp}`,
			clerkship_type: 'outpatient',
			required_days: 30 // Required for elective day calculations
		}
	});
	expect(clerkshipRes.ok(), `Clerkship creation failed: ${await clerkshipRes.text()}`).toBeTruthy();
	const clerkshipJson = await clerkshipRes.json();
	const clerkshipId = clerkshipJson.data?.id;
	expect(clerkshipId, 'Clerkship ID missing from response').toBeDefined();
	return { clerkshipId, timestamp };
}

test.describe('Elective Management', () => {
	test.beforeAll(async () => {
		db = await getTestDb();
	});

	// =========================================================================
	// Test 1: should display clerkship config electives tab
	// =========================================================================
	test('should display clerkship config electives tab', async ({ page }) => {
		const testUser = generateTestUser('elec-config');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create a clerkship
		const { clerkshipId } = await createClerkship(page, 'ConfigElec');

		// Navigate to clerkship config page
		await page.goto(`/clerkships/${clerkshipId}/config`);
		await page.waitForLoadState('networkidle');

		// Click on Electives tab
		await page.getByRole('button', { name: /Electives/i }).click();
		await page.waitForTimeout(500);

		// Verify electives section loads
		const pageContent = await page.textContent('body') || '';
		expect(pageContent.toLowerCase()).toContain('elective');
	});

	// =========================================================================
	// Test 2: should create elective via API
	// =========================================================================
	test('should create elective via API', async ({ page }) => {
		const testUser = generateTestUser('elec-create');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create a clerkship
		const { clerkshipId, timestamp } = await createClerkship(page, 'CreateElec');
		const electiveName = `Test Elective ${timestamp}`;

		// Create elective via API
		const electiveRes = await page.request.post(`/api/scheduling-config/electives?clerkshipId=${clerkshipId}`, {
			data: {
				name: electiveName,
				minimumDays: 5,
				isRequired: true
			}
		});
		expect(electiveRes.ok(), `Elective creation failed: ${await electiveRes.text()}`).toBeTruthy();
		const electiveJson = await electiveRes.json();
		expect(electiveJson.data?.id).toBeDefined();

		// Verify in database
		const elective = await executeWithRetry(() =>
			db.selectFrom('clerkship_electives').selectAll().where('name', '=', electiveName).executeTakeFirst()
		);
		expect(elective).toBeDefined();
		expect(elective?.name).toBe(electiveName);
	});

	// =========================================================================
	// Test 3: should display create elective form
	// =========================================================================
	test('should display create elective form', async ({ page }) => {
		const testUser = generateTestUser('elec-form');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create a clerkship
		const { clerkshipId } = await createClerkship(page, 'FormElec');

		// Navigate to clerkship config page
		await page.goto(`/clerkships/${clerkshipId}/config`);
		await page.waitForLoadState('networkidle');

		// Click on Electives tab
		await page.getByRole('button', { name: /Electives/i }).click();
		await page.waitForTimeout(500);

		// Click Create Elective button
		await page.getByRole('button', { name: /Create Elective/i }).click();
		await page.waitForTimeout(500);

		// Verify form elements are visible
		await expect(page.locator('#name')).toBeVisible();
		await expect(page.locator('#minimumDays')).toBeVisible();
		await expect(page.getByRole('button', { name: /Cancel/i })).toBeVisible();
	});

	// =========================================================================
	// Test 4: should view elective in clerkship config
	// =========================================================================
	test('should view elective in clerkship config', async ({ page }) => {
		const testUser = generateTestUser('elec-view');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create a clerkship
		const { clerkshipId, timestamp } = await createClerkship(page, 'ViewElec');
		const electiveName = `View Elective ${timestamp}`;

		// Create elective via API
		await page.request.post(`/api/scheduling-config/electives?clerkshipId=${clerkshipId}`, {
			data: {
				name: electiveName,
				minimumDays: 5,
				isRequired: false
			}
		});

		// Navigate to clerkship config page
		await page.goto(`/clerkships/${clerkshipId}/config`);
		await page.waitForLoadState('networkidle');

		// Click on Electives tab
		await page.getByRole('button', { name: /Electives/i }).click();
		await page.waitForTimeout(1000);

		// Verify elective appears in the list
		const pageContent = await page.textContent('body') || '';
		expect(pageContent).toContain(electiveName);
	});

	// =========================================================================
	// Test 5: should update elective via API (PATCH)
	// =========================================================================
	test('should update elective via API', async ({ page }) => {
		const testUser = generateTestUser('elec-update');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create a clerkship and elective
		const { clerkshipId, timestamp } = await createClerkship(page, 'UpdateElec');
		const originalName = `Update Elective ${timestamp}`;
		const updatedName = `Updated Elective ${timestamp}`;

		const electiveRes = await page.request.post(`/api/scheduling-config/electives?clerkshipId=${clerkshipId}`, {
			data: {
				name: originalName,
				minimumDays: 5,
				isRequired: true
			}
		});
		expect(electiveRes.ok()).toBeTruthy();
		const electiveJson = await electiveRes.json();
		const electiveId = electiveJson.data?.id;
		expect(electiveId).toBeDefined();

		// Update via PATCH
		const updateRes = await page.request.patch(`/api/scheduling-config/electives/${electiveId}`, {
			data: { name: updatedName }
		});
		expect(updateRes.ok(), `Elective update failed: ${await updateRes.text()}`).toBeTruthy();

		// Verify in database
		const updatedElective = await executeWithRetry(() =>
			db.selectFrom('clerkship_electives').selectAll().where('id', '=', electiveId).executeTakeFirst()
		);
		expect(updatedElective?.name).toBe(updatedName);
	});

	// =========================================================================
	// Test 6: should delete elective via API
	// =========================================================================
	test('should delete elective via API', async ({ page }) => {
		const testUser = generateTestUser('elec-delete');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create a clerkship and elective
		const { clerkshipId, timestamp } = await createClerkship(page, 'DeleteElec');
		const electiveName = `Delete Elective ${timestamp}`;

		const electiveRes = await page.request.post(`/api/scheduling-config/electives?clerkshipId=${clerkshipId}`, {
			data: {
				name: electiveName,
				minimumDays: 5,
				isRequired: false
			}
		});
		expect(electiveRes.ok()).toBeTruthy();
		const electiveJson = await electiveRes.json();
		const electiveId = electiveJson.data?.id;
		expect(electiveId).toBeDefined();

		// Delete via API
		const deleteRes = await page.request.delete(`/api/scheduling-config/electives/${electiveId}`);
		expect(deleteRes.ok(), `Elective deletion failed: ${await deleteRes.text()}`).toBeTruthy();

		// Verify deleted from database
		const deletedElective = await executeWithRetry(() =>
			db.selectFrom('clerkship_electives').selectAll().where('id', '=', electiveId).executeTakeFirst()
		);
		expect(deletedElective).toBeUndefined();
	});

	// =========================================================================
	// Test 7: should show days summary for electives
	// =========================================================================
	test('should show days summary for electives', async ({ page }) => {
		const testUser = generateTestUser('elec-days');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create a clerkship with specific required_days
		const { clerkshipId, timestamp } = await createClerkship(page, 'DaysElec');

		// Create an elective
		await page.request.post(`/api/scheduling-config/electives?clerkshipId=${clerkshipId}`, {
			data: {
				name: `Days Elective ${timestamp}`,
				minimumDays: 10,
				isRequired: true
			}
		});

		// Navigate to clerkship config page
		await page.goto(`/clerkships/${clerkshipId}/config`);
		await page.waitForLoadState('networkidle');

		// Click on Electives tab
		await page.getByRole('button', { name: /Electives/i }).click();
		await page.waitForTimeout(1000);

		// Verify days summary is displayed (looking for day-related text)
		const pageContent = await page.textContent('body') || '';
		expect(pageContent.toLowerCase()).toMatch(/day/i);
	});

	// =========================================================================
	// Test 8: should require minimum days for elective
	// =========================================================================
	test('should require minimum days for elective', async ({ page }) => {
		const testUser = generateTestUser('elec-mindays');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create a clerkship
		const { clerkshipId, timestamp } = await createClerkship(page, 'MinDaysElec');

		// Try to create elective without minimumDays (or with invalid minimumDays)
		const electiveRes = await page.request.post(`/api/scheduling-config/electives?clerkshipId=${clerkshipId}`, {
			data: {
				name: `No Min Days Elective ${timestamp}`,
				minimumDays: 0, // Invalid - should be positive
				isRequired: true
			}
		});

		// Should fail validation
		expect(electiveRes.ok()).toBeFalsy();
		const errorJson = await electiveRes.json();
		expect(JSON.stringify(errorJson).toLowerCase()).toMatch(/minimum|days|positive/i);
	});
});
