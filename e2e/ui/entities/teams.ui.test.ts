/**
 * E2E UI Test - Team Management
 *
 * Preceptor team CRUD with full data hierarchy validation.
 *
 * Methodology:
 * - Real Authentication: Uses actual better-auth flows
 * - Full Data Hierarchy: Creates Health System → Site → Clerkship → Association → Preceptor
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
 * Creates the full data hierarchy required for team creation:
 * Health System → Site → Clerkship + Clerkship-Site Association → Preceptor
 */
async function createFullHierarchy(page: any, prefix: string) {
	const timestamp = Date.now();

	// 1. Create Health System
	const hsRes = await page.request.post('/api/health-systems', {
		data: { name: `${prefix} Health System ${timestamp}` }
	});
	expect(hsRes.ok(), `Health System creation failed: ${await hsRes.text()}`).toBeTruthy();
	const hsJson = await hsRes.json();
	const healthSystemId = hsJson.data?.id;
	expect(healthSystemId, 'Health System ID missing from response').toBeDefined();

	// 2. Create Site linked to Health System
	const siteRes = await page.request.post('/api/sites', {
		data: { name: `${prefix} Site ${timestamp}`, health_system_id: healthSystemId }
	});
	expect(siteRes.ok(), `Site creation failed: ${await siteRes.text()}`).toBeTruthy();
	const siteJson = await siteRes.json();
	const siteId = siteJson.data?.id;
	expect(siteId, 'Site ID missing from response').toBeDefined();

	// 3. Create Clerkship
	const clerkshipRes = await page.request.post('/api/clerkships', {
		data: {
			name: `${prefix} Clerkship ${timestamp}`,
			clerkship_type: 'inpatient',
			required_days: 10
		}
	});
	expect(clerkshipRes.ok(), `Clerkship creation failed: ${await clerkshipRes.text()}`).toBeTruthy();
	const clerkshipJson = await clerkshipRes.json();
	const clerkshipId = clerkshipJson.data?.id;
	expect(clerkshipId, 'Clerkship ID missing from response').toBeDefined();

	// 4. Associate Clerkship with Site
	const assocRes = await page.request.post('/api/clerkship-sites', {
		data: { clerkship_id: clerkshipId, site_id: siteId }
	});
	expect(assocRes.ok(), `Clerkship-Site association failed: ${await assocRes.text()}`).toBeTruthy();

	// 5. Create Preceptor linked to Site
	const preceptorRes = await page.request.post('/api/preceptors', {
		data: {
			name: `${prefix} Preceptor ${timestamp}`,
			email: `${prefix.toLowerCase().replace(/\s+/g, '-')}-preceptor-${timestamp}@test.com`,
			site_ids: [siteId]
		}
	});
	expect(preceptorRes.ok(), `Preceptor creation failed: ${await preceptorRes.text()}`).toBeTruthy();
	const preceptorJson = await preceptorRes.json();
	const preceptorId = preceptorJson.data?.id;
	expect(preceptorId, 'Preceptor ID missing from response').toBeDefined();

	return { healthSystemId, siteId, clerkshipId, preceptorId, timestamp };
}

test.describe('Team Management', () => {
	test.beforeAll(async () => {
		db = await getTestDb();
	});

	// =========================================================================
	// Test 1: should display preceptors page
	// =========================================================================
	test('should display preceptors page', async ({ page }) => {
		const testUser = generateTestUser('team-list');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		await page.goto('/preceptors');
		await page.waitForLoadState('networkidle');

		const pageContent = await page.textContent('body') || '';
		expect(pageContent.toLowerCase()).toContain('preceptor');
	});

	// =========================================================================
	// Test 2: should access new team form with all required elements
	// =========================================================================
	test('should access new team form with all required elements', async ({ page }) => {
		const testUser = generateTestUser('team-form');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		await page.goto('/preceptors/teams/new');
		await page.waitForLoadState('networkidle');

		// Verify all required form elements
		await expect(page.getByText(/Create New Team/i)).toBeVisible();
		await expect(page.getByText(/Select Clerkship/i)).toBeVisible();
		await expect(page.locator('#clerkship')).toBeVisible();
		await expect(page.getByRole('button', { name: /Create Team/i })).toBeDisabled();
		await expect(page.getByRole('button', { name: /Cancel/i })).toBeVisible();
	});

	// =========================================================================
	// Test 3: should create team via API with full hierarchy
	// =========================================================================
	test('should create team via API with full hierarchy', async ({ page }) => {
		const testUser = generateTestUser('team-create-api');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create full hierarchy
		const { clerkshipId, siteId, preceptorId, timestamp } = await createFullHierarchy(page, 'Create');
		const teamName = `Test Team ${timestamp}`;

		// Create team via API
		const teamRes = await page.request.post('/api/preceptors/teams', {
			data: {
				name: teamName,
				clerkshipId: clerkshipId,
				siteIds: [siteId],
				members: [{ preceptorId: preceptorId, priority: 1, isFallbackOnly: false }]
			}
		});
		expect(teamRes.ok(), `Team creation failed: ${await teamRes.text()}`).toBeTruthy();

		// Verify in database
		const team = await executeWithRetry(() =>
			db.selectFrom('preceptor_teams').selectAll().where('name', '=', teamName).executeTakeFirst()
		);
		expect(team).toBeDefined();
		expect(team?.name).toBe(teamName);
	});

	// =========================================================================
	// Test 4: should view team details page
	// =========================================================================
	test('should view team details page', async ({ page }) => {
		const testUser = generateTestUser('team-details');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create full hierarchy and team
		const { clerkshipId, siteId, preceptorId, timestamp } = await createFullHierarchy(page, 'Details');
		const teamName = `Details Team ${timestamp}`;

		const teamRes = await page.request.post('/api/preceptors/teams', {
			data: {
				name: teamName,
				clerkshipId: clerkshipId,
				siteIds: [siteId],
				members: [{ preceptorId: preceptorId, priority: 1, isFallbackOnly: false }]
			}
		});
		expect(teamRes.ok()).toBeTruthy();
		const teamJson = await teamRes.json();
		const teamId = teamJson.data?.id;
		expect(teamId).toBeDefined();

		// Navigate to team details
		await page.goto(`/preceptors/teams/${teamId}`);
		await page.waitForLoadState('networkidle');

		// Verify team name is displayed
		const pageContent = await page.textContent('body') || '';
		expect(pageContent).toContain(teamName);
	});

	// =========================================================================
	// Test 5: should update team via API (PATCH)
	// =========================================================================
	test('should update team via API', async ({ page }) => {
		const testUser = generateTestUser('team-update');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create full hierarchy and team
		const { clerkshipId, siteId, preceptorId, timestamp } = await createFullHierarchy(page, 'Update');
		const originalName = `Update Team ${timestamp}`;
		const updatedName = `Updated Team ${timestamp}`;

		const teamRes = await page.request.post('/api/preceptors/teams', {
			data: {
				name: originalName,
				clerkshipId: clerkshipId,
				siteIds: [siteId],
				members: [{ preceptorId: preceptorId, priority: 1, isFallbackOnly: false }]
			}
		});
		expect(teamRes.ok()).toBeTruthy();
		const teamJson = await teamRes.json();
		const teamId = teamJson.data?.id;
		expect(teamId).toBeDefined();

		// Update via PATCH
		const updateRes = await page.request.patch(`/api/preceptors/teams/${teamId}`, {
			data: { name: updatedName }
		});
		expect(updateRes.ok(), `Team update failed: ${await updateRes.text()}`).toBeTruthy();

		// Verify in database
		const updatedTeam = await executeWithRetry(() =>
			db.selectFrom('preceptor_teams').selectAll().where('id', '=', teamId).executeTakeFirst()
		);
		expect(updatedTeam?.name).toBe(updatedName);
	});

	// =========================================================================
	// Test 6: should delete team via API
	// =========================================================================
	test('should delete team via API', async ({ page }) => {
		const testUser = generateTestUser('team-delete');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create full hierarchy and team
		const { clerkshipId, siteId, preceptorId, timestamp } = await createFullHierarchy(page, 'Delete');
		const teamName = `Delete Team ${timestamp}`;

		const teamRes = await page.request.post('/api/preceptors/teams', {
			data: {
				name: teamName,
				clerkshipId: clerkshipId,
				siteIds: [siteId],
				members: [{ preceptorId: preceptorId, priority: 1, isFallbackOnly: false }]
			}
		});
		expect(teamRes.ok()).toBeTruthy();
		const teamJson = await teamRes.json();
		const teamId = teamJson.data?.id;
		expect(teamId).toBeDefined();

		// Delete via API
		const deleteRes = await page.request.delete(`/api/preceptors/teams/${teamId}`);
		expect(deleteRes.ok(), `Team deletion failed: ${await deleteRes.text()}`).toBeTruthy();

		// Verify deleted from database
		const deletedTeam = await executeWithRetry(() =>
			db.selectFrom('preceptor_teams').selectAll().where('id', '=', teamId).executeTakeFirst()
		);
		expect(deletedTeam).toBeUndefined();
	});

	// =========================================================================
	// Test 7: should show sites after clerkship selection
	// =========================================================================
	test('should show sites after clerkship selection', async ({ page }) => {
		const testUser = generateTestUser('team-sites');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create full hierarchy
		const { clerkshipId } = await createFullHierarchy(page, 'Sites');

		await page.goto('/preceptors/teams/new');
		await page.waitForLoadState('networkidle');

		// Select the clerkship
		await page.locator('#clerkship').selectOption(clerkshipId);
		await page.waitForTimeout(1000);

		// Step 2 (Select Sites) should now be visible
		await expect(page.getByText(/Select Sites/i)).toBeVisible();
	});

	// =========================================================================
	// Test 8: should require at least one team member
	// =========================================================================
	test('should require at least one team member', async ({ page }) => {
		const testUser = generateTestUser('team-member-req');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create hierarchy
		const { clerkshipId, siteId, timestamp } = await createFullHierarchy(page, 'MemberReq');

		// Try to create team without members
		const teamRes = await page.request.post('/api/preceptors/teams', {
			data: {
				name: `No Members Team ${timestamp}`,
				clerkshipId: clerkshipId,
				siteIds: [siteId],
				members: [] // Empty members array
			}
		});

		// Should fail validation
		expect(teamRes.ok()).toBeFalsy();
		const errorJson = await teamRes.json();
		expect(JSON.stringify(errorJson).toLowerCase()).toContain('member');
	});
});
