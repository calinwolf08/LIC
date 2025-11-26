/**
 * UI E2E Tests - Team Management
 *
 * Tests for creating and managing preceptor teams through the UI
 */

import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../helpers';
import { getTestDb, executeWithRetry } from '../test-db';
import type { Kysely } from 'kysely';
import type { DB } from '../../src/lib/db/types';

let db: Kysely<DB>;

test.describe('Team Management UI', () => {
	let clerkshipId: string;
	let preceptor1Id: string;
	let preceptor2Id: string;
	let preceptor3Id: string;
	let healthSystemId: string;
	let siteId: string;

	test.beforeAll(async () => {
		// Get the already-initialized test database (created by global setup)
		db = await getTestDb();
	});

	test.beforeEach(async () => {
		// No need to clear data - using unique timestamps for test isolation
		// Create health system
		healthSystemId = `hs_${Date.now()}`;
		await executeWithRetry(() =>
			db
				.insertInto('health_systems')
				.values({
					id: healthSystemId,
					name: 'Test Health System',
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		// Create site
		siteId = `site_${Date.now()}`;
		await executeWithRetry(() =>
			db
				.insertInto('sites')
				.values({
					id: siteId,
					name: 'Test Site',
					health_system_id: healthSystemId,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		// Create test clerkship
		clerkshipId = `clerkship_${Date.now()}`;
		const timestamp = Date.now();
		await executeWithRetry(() =>
			db
				.insertInto('clerkships')
				.values({
					id: clerkshipId,
					name: `Test Clerkship for Teams ${timestamp}`,
					specialty: 'Internal Medicine',
					clerkship_type: 'outpatient',
					required_days: 20,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		// Create test preceptors
		preceptor1Id = `preceptor_${Date.now()}_1`;
		await executeWithRetry(() =>
			db
				.insertInto('preceptors')
				.values({
					id: preceptor1Id,
					name: 'Dr. Alice Johnson',
					email: `alice.${Date.now()}@example.com`,
					specialty: 'Cardiology',
					health_system_id: healthSystemId,
					site_id: siteId,
					max_students: 2,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		preceptor2Id = `preceptor_${Date.now()}_2`;
		await executeWithRetry(() =>
			db
				.insertInto('preceptors')
				.values({
					id: preceptor2Id,
					name: 'Dr. Bob Smith',
					email: `bob.${Date.now()}@example.com`,
					specialty: 'Cardiology',
					health_system_id: healthSystemId,
					site_id: siteId,
					max_students: 2,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		preceptor3Id = `preceptor_${Date.now()}_3`;
		await executeWithRetry(() =>
			db
				.insertInto('preceptors')
				.values({
					id: preceptor3Id,
					name: 'Dr. Charlie Davis',
					email: `charlie.${Date.now()}@example.com`,
					specialty: 'Cardiology',
					health_system_id: healthSystemId,
					site_id: siteId,
					max_students: 2,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);
	});

	test.afterEach(async () => {
		// Cleanup handled by beforeEach
	});

	test('should create a team with multiple preceptors and see it in the list', async ({ page }) => {
		// Navigate to clerkship configuration
		await gotoAndWait(page, '/scheduling-config');

		// Click on Configure button for the test clerkship
		const configureButton = page.locator(`button:has-text("Configure")`).first();
		await expect(configureButton).toBeVisible({ timeout: 10000 });
		await configureButton.click();

		// Wait for clerkship detail page to load
		await page.waitForURL(/\/scheduling-config\/clerkships\/.+/);

		// Click on Teams tab
		const teamsTab = page.locator('button:has-text("Teams")');
		await expect(teamsTab).toBeVisible();
		await teamsTab.click();

		// Verify empty state
		await expect(page.locator('text=No teams configured')).toBeVisible();

		// Click "Create First Team" or "Add Team" button
		const addTeamButton = page.locator('button:has-text("Add Team"), button:has-text("Create First Team")').first();
		await expect(addTeamButton).toBeVisible();
		await addTeamButton.click();

		// Wait for modal to appear
		await expect(page.locator('h2:has-text("Create Team")')).toBeVisible();

		// Fill in team name
		const nameInput = page.locator('input#name');
		await nameInput.fill('Cardiology Team A');

		// Add first preceptor
		const preceptorSelect = page.locator('select').first();
		const aliceOption = await preceptorSelect.locator('option').filter({ hasText: 'Dr. Alice Johnson' }).first();
		const aliceValue = await aliceOption.getAttribute('value');
		if (aliceValue) {
			await preceptorSelect.selectOption(aliceValue);
		}

		const roleInput = page.locator('input[placeholder="Role (optional)"]');
		await roleInput.fill('Lead');

		const addButton = page.locator('button:has-text("Add")').nth(1); // Use the second "Add" button (in the modal)
		await addButton.click();

		// Verify first member was added
		await expect(page.locator('text=1. Dr. Alice Johnson')).toBeVisible();

		// Add second preceptor
		const bobOption = await preceptorSelect.locator('option').filter({ hasText: 'Dr. Bob Smith' }).first();
		const bobValue = await bobOption.getAttribute('value');
		if (bobValue) {
			await preceptorSelect.selectOption(bobValue);
		}
		await roleInput.fill('Assistant');
		await addButton.click();

		// Verify second member was added
		await expect(page.locator('text=2. Dr. Bob Smith')).toBeVisible();

		// Check some formation rules
		const requireSameSpecialty = page.locator('input#requireSameSpecialty');
		await requireSameSpecialty.check();

		// Submit form
		const createButton = page.locator('button[type="submit"]:has-text("Create Team")');
		await expect(createButton).toBeEnabled();
		await createButton.click();

		// Wait for modal to close
		await expect(page.locator('h2:has-text("Create Team")')).not.toBeVisible({ timeout: 5000 });

		// Verify team appears in the list
		await expect(page.locator('h3:has-text("Cardiology Team A")')).toBeVisible({ timeout: 5000 });
		await expect(page.locator('text=2 members')).toBeVisible();
		await expect(page.locator('text=1. Dr. Alice Johnson')).toBeVisible();
		await expect(page.locator('text=2. Dr. Bob Smith')).toBeVisible();
		await expect(page.locator('text=✓ Same specialty required')).toBeVisible();
	});

	test('should show validation error when trying to create team with less than 2 members', async ({ page }) => {
		// Navigate to clerkship configuration
		await gotoAndWait(page, `/scheduling-config/clerkships/${clerkshipId}`);

		// Click on Teams tab
		const teamsTab = page.locator('button:has-text("Teams")');
		await teamsTab.click();

		// Click Add Team button
		const addTeamButton = page.locator('button:has-text("Add Team"), button:has-text("Create First Team")').first();
		await addTeamButton.click();

		// Try to submit without adding members
		const createButton = page.locator('button[type="submit"]:has-text("Create Team")');
		await expect(createButton).toBeDisabled();

		// Add only one member
		const preceptorSelect = page.locator('select').first();
		const aliceOption = await preceptorSelect.locator('option').filter({ hasText: 'Dr. Alice Johnson' }).first();
		const aliceValue = await aliceOption.getAttribute('value');
		if (aliceValue) {
			await preceptorSelect.selectOption(aliceValue);
		}
		const addButton = page.locator('button:has-text("Add")').nth(1);
		await addButton.click();

		// Verify button is still disabled
		await expect(createButton).toBeDisabled();

		// Add second member - now button should be enabled
		const bobOption = await preceptorSelect.locator('option').filter({ hasText: 'Dr. Bob Smith' }).first();
		const bobValue = await bobOption.getAttribute('value');
		if (bobValue) {
			await preceptorSelect.selectOption(bobValue);
		}
		await addButton.click();

		await expect(createButton).toBeEnabled();
	});

	test('should edit an existing team', async ({ page }) => {
		// Listen for console messages from the browser
		page.on('console', (msg) => {
			console.log(`[BROWSER] ${msg.type()}: ${msg.text()}`);
		});

		// Create a team first via API
		const teamId = `team_${Date.now()}`;
		await executeWithRetry(() =>
			db
				.insertInto('preceptor_teams')
				.values({
					id: teamId,
					clerkship_id: clerkshipId,
					name: 'Original Team Name',
					require_same_health_system: 0,
					require_same_site: 0,
					require_same_specialty: 1,
					requires_admin_approval: 0,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		await executeWithRetry(() =>
			db
				.insertInto('preceptor_team_members')
				.values([
					{
						id: `member_1_${Date.now()}`,
						team_id: teamId,
						preceptor_id: preceptor1Id,
						role: 'Lead',
						priority: 1,
						created_at: new Date().toISOString()
					},
					{
						id: `member_2_${Date.now()}`,
						team_id: teamId,
						preceptor_id: preceptor2Id,
						role: null,
						priority: 2,
						created_at: new Date().toISOString()
					}
				])
				.execute()
		);

		// Navigate to clerkship configuration
		await gotoAndWait(page, `/scheduling-config/clerkships/${clerkshipId}`);

		// Click on Teams tab
		const teamsTab = page.locator('button:has-text("Teams")');
		await teamsTab.click();

		// Verify team is visible
		await expect(page.locator('h3:has-text("Original Team Name")')).toBeVisible();

		// Click Edit button
		const editButton = page.locator('button:has-text("Edit")').first();
		await editButton.click();

		// Wait for modal
		await expect(page.locator('h2:has-text("Edit Team")')).toBeVisible();

		// Change team name
		const nameInput = page.locator('input#name');
		await nameInput.clear();
		await nameInput.fill('Updated Team Name');

		// Toggle a checkbox
		const requireSameSite = page.locator('input#requireSameSite');
		await requireSameSite.check();

		// Submit
		const updateButton = page.locator('button[type="submit"]:has-text("Update Team")');
		await updateButton.click();

		// Wait for modal to close
		await expect(page.locator('h2:has-text("Edit Team")')).not.toBeVisible({ timeout: 5000 });

		// Verify changes
		await expect(page.locator('h3:has-text("Updated Team Name")')).toBeVisible({ timeout: 5000 });
		await expect(page.locator('text=✓ Same site required')).toBeVisible();
	});

	test('should delete a team', async ({ page }) => {
		// Create a team first via API
		const teamId = `team_${Date.now()}`;
		await executeWithRetry(() =>
			db
				.insertInto('preceptor_teams')
				.values({
					id: teamId,
					clerkship_id: clerkshipId,
					name: 'Team to Delete',
					require_same_health_system: 0,
					require_same_site: 0,
					require_same_specialty: 0,
					requires_admin_approval: 0,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		await executeWithRetry(() =>
			db
				.insertInto('preceptor_team_members')
				.values([
					{
						id: `member_1_${Date.now()}`,
						team_id: teamId,
						preceptor_id: preceptor1Id,
						role: null,
						priority: 1,
						created_at: new Date().toISOString()
					},
					{
						id: `member_2_${Date.now()}`,
						team_id: teamId,
						preceptor_id: preceptor2Id,
						role: null,
						priority: 2,
						created_at: new Date().toISOString()
					}
				])
				.execute()
		);

		// Navigate to clerkship configuration
		await gotoAndWait(page, `/scheduling-config/clerkships/${clerkshipId}`);

		// Click on Teams tab
		const teamsTab = page.locator('button:has-text("Teams")');
		await teamsTab.click();

		// Verify team is visible
		await expect(page.locator('h3:has-text("Team to Delete")')).toBeVisible();

		// Setup dialog handler to accept confirmation
		page.on('dialog', dialog => dialog.accept());

		// Click Delete button
		const deleteButton = page.locator('button:has-text("Delete")').first();
		await deleteButton.click();

		// Verify team is removed
		await expect(page.locator('h3:has-text("Team to Delete")')).not.toBeVisible({ timeout: 5000 });
		await expect(page.locator('text=No teams configured')).toBeVisible();
	});

	test('should allow reordering team members with priority', async ({ page }) => {
		// Navigate to clerkship configuration
		await gotoAndWait(page, `/scheduling-config/clerkships/${clerkshipId}`);

		// Click on Teams tab
		const teamsTab = page.locator('button:has-text("Teams")');
		await teamsTab.click();

		// Click Add Team button
		const addTeamButton = page.locator('button:has-text("Add Team"), button:has-text("Create First Team")').first();
		await addTeamButton.click();

		// Add three members
		const preceptorSelect = page.locator('select').first();
		const addButton = page.locator('button:has-text("Add")').nth(1);

		// Add Alice
		let aliceOption = await preceptorSelect.locator('option').filter({ hasText: 'Dr. Alice Johnson' }).first();
		let aliceValue = await aliceOption.getAttribute('value');
		if (aliceValue) await preceptorSelect.selectOption(aliceValue);
		await addButton.click();

		// Add Bob
		const bobOption = await preceptorSelect.locator('option').filter({ hasText: 'Dr. Bob Smith' }).first();
		const bobValue = await bobOption.getAttribute('value');
		if (bobValue) await preceptorSelect.selectOption(bobValue);
		await addButton.click();

		// Add Charlie
		const charlieOption = await preceptorSelect.locator('option').filter({ hasText: 'Dr. Charlie Davis' }).first();
		const charlieValue = await charlieOption.getAttribute('value');
		if (charlieValue) await preceptorSelect.selectOption(charlieValue);
		await addButton.click();

		// Verify initial order
		const memberList = page.locator('div:has-text("1. Dr. Alice Johnson")').first();
		await expect(memberList).toBeVisible();

		// Click down arrow on first member to move it down
		const firstDownButton = page.locator('button:has-text("↓")').first();
		await firstDownButton.click();

		// After moving down, Bob should now be first
		await expect(page.locator('text=1. Dr. Bob Smith')).toBeVisible();
		await expect(page.locator('text=2. Dr. Alice Johnson')).toBeVisible();
	});

	test('should prevent adding duplicate preceptors to team', async ({ page }) => {
		// Navigate to clerkship configuration
		await gotoAndWait(page, `/scheduling-config/clerkships/${clerkshipId}`);

		// Click on Teams tab
		const teamsTab = page.locator('button:has-text("Teams")');
		await teamsTab.click();

		// Click Add Team button
		const addTeamButton = page.locator('button:has-text("Add Team"), button:has-text("Create First Team")').first();
		await addTeamButton.click();

		// Add Alice
		const preceptorSelect = page.locator('select').first();
		const aliceOption = await preceptorSelect.locator('option').filter({ hasText: 'Dr. Alice Johnson' }).first();
		const aliceValue = await aliceOption.getAttribute('value');
		if (aliceValue) await preceptorSelect.selectOption(aliceValue);

		const addButton = page.locator('button:has-text("Add")').nth(1);
		await addButton.click();

		// Verify Alice was added
		await expect(page.locator('text=1. Dr. Alice Johnson')).toBeVisible();

		// Try to add Alice again - she should not be in the dropdown
		const options = await preceptorSelect.locator('option').allTextContents();
		const hasAlice = options.some(opt => opt.includes('Alice Johnson'));
		expect(hasAlice).toBe(false);
	});
});
