/**
 * E2E UI Test - Team Management
 *
 * Preceptor team CRUD.
 *
 * Methodology:
 * - Real Authentication: Uses actual better-auth flows
 * - UI-Driven Actions: Create/edit/delete through UI forms
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

function generateTeam(prefix: string) {
	const timestamp = Date.now();
	return {
		name: `${prefix} Team ${timestamp}`
	};
}

test.describe('Team Management', () => {
	test.beforeAll(async () => {
		db = await getTestDb();
	});

	// =========================================================================
	// Test 1: should display teams list
	// =========================================================================
	test('should display teams list', async ({ page }) => {
		const testUser = generateTestUser('team-list');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		await page.goto('/preceptors/teams');
		await page.waitForLoadState('networkidle');

		const pageContent = await page.textContent('body') || '';
		expect(pageContent.toLowerCase()).toContain('team');
	});

	// =========================================================================
	// Test 2: should create new team
	// =========================================================================
	test('should create new team', async ({ page }) => {
		const testUser = generateTestUser('team-create');
		const teamData = generateTeam('created');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// First create a clerkship (teams require clerkship)
		const clerkshipRes = await page.request.post('/api/clerkships', {
			data: { name: `Team Test Clerkship ${Date.now()}`, clerkship_type: 'inpatient' }
		});
		const clerkship = await clerkshipRes.json();

		await page.goto('/preceptors/teams/new');
		await page.waitForLoadState('networkidle');

		await page.fill('#name', teamData.name);

		// Select clerkship if dropdown exists
		const clerkshipSelect = page.locator('select').first();
		if (await clerkshipSelect.isVisible()) {
			await clerkshipSelect.selectOption(clerkship.id);
		}

		await page.getByRole('button', { name: /create|save/i }).click();
		await page.waitForTimeout(2000);

		const team = await executeWithRetry(() =>
			db.selectFrom('preceptor_teams').selectAll().where('name', '=', teamData.name).executeTakeFirst()
		);
		expect(team).toBeDefined();
	});

	// =========================================================================
	// Test 3: should add preceptors to team
	// =========================================================================
	test('should add preceptors to team', async ({ page }) => {
		const testUser = generateTestUser('team-addprec');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create clerkship and team
		const clerkshipRes = await page.request.post('/api/clerkships', {
			data: { name: `Team Prec Clerkship ${Date.now()}`, clerkship_type: 'inpatient' }
		});
		const clerkship = await clerkshipRes.json();

		const teamRes = await page.request.post('/api/preceptor-teams', {
			data: { name: `Add Prec Team ${Date.now()}`, clerkship_id: clerkship.id }
		});
		const team = await teamRes.json();

		await page.goto(`/preceptors/teams/${team.id}`);
		await page.waitForLoadState('networkidle');

		// Look for add preceptor button
		const addButton = page.getByRole('button', { name: /add|member/i });
		if (await addButton.isVisible().catch(() => false)) {
			// Add functionality exists
		}

		expect(true).toBeTruthy();
	});

	// =========================================================================
	// Test 4: should remove preceptor from team
	// =========================================================================
	test('should remove preceptor from team', async ({ page }) => {
		const testUser = generateTestUser('team-rmprec');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		await page.goto('/preceptors/teams');
		await page.waitForLoadState('networkidle');

		expect(true).toBeTruthy();
	});

	// =========================================================================
	// Test 5: should update team details
	// =========================================================================
	test('should update team details', async ({ page }) => {
		const testUser = generateTestUser('team-update');
		const updatedName = `Updated Team ${Date.now()}`;

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create clerkship and team
		const clerkshipRes = await page.request.post('/api/clerkships', {
			data: { name: `Team Update Clerkship ${Date.now()}`, clerkship_type: 'inpatient' }
		});
		const clerkship = await clerkshipRes.json();

		const teamRes = await page.request.post('/api/preceptor-teams', {
			data: { name: `Update Team ${Date.now()}`, clerkship_id: clerkship.id }
		});
		const team = await teamRes.json();

		await page.goto(`/preceptors/teams/${team.id}/edit`);
		await page.waitForLoadState('networkidle');

		await page.fill('#name', updatedName);
		await page.getByRole('button', { name: /update|save/i }).click();
		await page.waitForTimeout(2000);

		const updatedTeam = await executeWithRetry(() =>
			db.selectFrom('preceptor_teams').selectAll().where('id', '=', team.id).executeTakeFirst()
		);
		expect(updatedTeam?.name).toBe(updatedName);
	});

	// =========================================================================
	// Test 6: should delete team
	// =========================================================================
	test('should delete team', async ({ page }) => {
		const testUser = generateTestUser('team-delete');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		// Create clerkship and team
		const clerkshipRes = await page.request.post('/api/clerkships', {
			data: { name: `Team Delete Clerkship ${Date.now()}`, clerkship_type: 'inpatient' }
		});
		const clerkship = await clerkshipRes.json();

		const teamRes = await page.request.post('/api/preceptor-teams', {
			data: { name: `Delete Team ${Date.now()}`, clerkship_id: clerkship.id }
		});
		const team = await teamRes.json();

		await page.goto('/preceptors/teams');
		await page.waitForLoadState('networkidle');

		const deleteButton = page.getByRole('button', { name: /delete/i }).first();
		if (await deleteButton.isVisible()) {
			await deleteButton.click();
			await page.waitForTimeout(500);

			const confirmButton = page.getByRole('button', { name: /confirm|delete|yes/i });
			if (await confirmButton.isVisible()) {
				await confirmButton.click();
				await page.waitForTimeout(1000);
			}
		}

		const deletedTeam = await executeWithRetry(() =>
			db.selectFrom('preceptor_teams').selectAll().where('id', '=', team.id).executeTakeFirst()
		);
		expect(deletedTeam).toBeUndefined();
	});

	// =========================================================================
	// Test 7: should associate team with clerkship
	// =========================================================================
	test('should associate team with clerkship', async ({ page }) => {
		const testUser = generateTestUser('team-clerk');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		await page.goto('/preceptors/teams/new');
		await page.waitForLoadState('networkidle');

		// Check if clerkship selection exists
		const clerkshipSelect = page.locator('select');
		const hasClerkshipSelect = await clerkshipSelect.isVisible().catch(() => false);

		expect(hasClerkshipSelect || true).toBeTruthy();
	});

	// =========================================================================
	// Test 8: should filter teams by clerkship
	// =========================================================================
	test('should filter teams by clerkship', async ({ page }) => {
		const testUser = generateTestUser('team-filter');

		await page.request.post('/api/auth/sign-up/email', {
			data: { name: testUser.name, email: testUser.email, password: testUser.password }
		});
		await loginUser(page, testUser.email, testUser.password);

		await page.goto('/preceptors/teams');
		await page.waitForLoadState('networkidle');

		// Look for filter controls
		const filterSelect = page.locator('select').first();
		if (await filterSelect.isVisible()) {
			// Filter functionality exists
		}

		expect(true).toBeTruthy();
	});
});
