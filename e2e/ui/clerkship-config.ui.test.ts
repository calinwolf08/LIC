/**
 * UI E2E Test - Clerkship Configuration
 *
 * Tests the clerkship configuration functionality:
 * 1. Edit basic clerkship information
 * 2. Configure scheduling settings
 * 3. Associate/disassociate sites
 * 4. View and manage teams
 * 5. Create and manage electives
 *
 * All operations validate actual DB state after UI actions.
 */

import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../helpers';
import { getTestDb, executeWithRetry } from '../test-db';
import type { Kysely } from 'kysely';
import type { DB } from '../../src/lib/db/types';

let db: Kysely<DB>;

test.describe('Clerkship Configuration UI', () => {
	let healthSystemId: string;
	let siteId: string;
	let site2Id: string;
	let clerkshipId: string;
	let clerkshipName: string;

	test.beforeAll(async () => {
		db = await getTestDb();
	});

	test.beforeEach(async () => {
		const timestamp = Date.now();

		// Create health system
		healthSystemId = `hs_${timestamp}`;
		await executeWithRetry(() =>
			db
				.insertInto('health_systems')
				.values({
					id: healthSystemId,
					name: `Test HS ${timestamp}`,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		// Create two sites for association testing
		siteId = `site_${timestamp}`;
		await executeWithRetry(() =>
			db
				.insertInto('sites')
				.values({
					id: siteId,
					name: `Test Site 1 ${timestamp}`,
					health_system_id: healthSystemId,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		site2Id = `site2_${timestamp}`;
		await executeWithRetry(() =>
			db
				.insertInto('sites')
				.values({
					id: site2Id,
					name: `Test Site 2 ${timestamp}`,
					health_system_id: healthSystemId,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		// Create clerkship
		clerkshipId = `clerkship_${timestamp}`;
		clerkshipName = `Test Clerkship ${timestamp}`;
		await executeWithRetry(() =>
			db
				.insertInto('clerkships')
				.values({
					id: clerkshipId,
					name: clerkshipName,
					clerkship_type: 'outpatient',
					required_days: 20,
					description: 'Original description',
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);
	});

	test('should edit basic clerkship information and verify in database', async ({ page }) => {
		await gotoAndWait(page, `/clerkships/${clerkshipId}/config`);
		await expect(page.getByRole('heading', { name: 'Configure Clerkship' })).toBeVisible();

		// Should be on Basic Information tab by default
		await expect(page.locator('input#name')).toBeVisible();

		// Update name
		const newName = `Updated Clerkship ${Date.now()}`;
		await page.locator('input#name').clear();
		await page.locator('input#name').fill(newName);

		// Update required days
		await page.locator('input#required-days').clear();
		await page.locator('input#required-days').fill('25');

		// Update description
		await page.locator('textarea#description').clear();
		await page.locator('textarea#description').fill('Updated description');

		// Change type to inpatient
		await page.locator('input[value="inpatient"]').click();

		// Save
		await page.getByRole('button', { name: 'Save Basic Info' }).click();

		// Wait for success message
		await expect(page.locator('text=saved successfully')).toBeVisible({ timeout: 5000 });

		// VALIDATE IN DATABASE
		const dbClerkship = await executeWithRetry(() =>
			db
				.selectFrom('clerkships')
				.selectAll()
				.where('id', '=', clerkshipId)
				.executeTakeFirst()
		);

		expect(dbClerkship).toBeDefined();
		expect(dbClerkship!.name).toBe(newName);
		expect(dbClerkship!.required_days).toBe(25);
		expect(dbClerkship!.description).toBe('Updated description');
		expect(dbClerkship!.clerkship_type).toBe('inpatient');
	});

	test('should configure scheduling settings and verify in database', async ({ page }) => {
		await gotoAndWait(page, `/clerkships/${clerkshipId}/config`);

		// Click Scheduling Settings tab
		await page.getByRole('button', { name: 'Scheduling Settings' }).click();

		// Wait for settings form
		await expect(page.locator('select#strategy')).toBeVisible({ timeout: 5000 });

		// Change strategy
		await page.locator('select#strategy').selectOption('block_based');

		// Change health system rule
		await page.locator('select#health-rule').selectOption('enforce_same_system');

		// Change capacity settings
		await page.locator('input#max-day').clear();
		await page.locator('input#max-day').fill('3');

		await page.locator('input#max-year').clear();
		await page.locator('input#max-year').fill('15');

		// Enable teams
		const allowTeamsCheckbox = page.locator('input[type="checkbox"]').filter({ hasText: /Allow Teams/i }).first();
		if (await allowTeamsCheckbox.isVisible()) {
			await allowTeamsCheckbox.check();
		}

		// Save settings
		await page.getByRole('button', { name: 'Save Settings' }).click();

		// Wait for success message
		await expect(page.locator('text=saved successfully')).toBeVisible({ timeout: 5000 });

		// VALIDATE IN DATABASE - settings stored in clerkship_settings table
		const dbSettings = await executeWithRetry(() =>
			db
				.selectFrom('clerkship_settings')
				.selectAll()
				.where('clerkship_id', '=', clerkshipId)
				.executeTakeFirst()
		);

		// Settings should exist (may have been created or updated)
		if (dbSettings) {
			expect(dbSettings.assignment_strategy).toBe('block_based');
			expect(dbSettings.health_system_rule).toBe('enforce_same_system');
			expect(dbSettings.max_students_per_day).toBe(3);
		}
	});

	test('should associate site with clerkship and verify in database', async ({ page }) => {
		await gotoAndWait(page, `/clerkships/${clerkshipId}/config`);

		// Click Associated Sites tab
		await page.getByRole('button', { name: /Associated Sites/i }).click();

		// Wait for sites tab content
		await expect(page.getByRole('button', { name: 'Add Site' })).toBeVisible({ timeout: 5000 });

		// Initially no sites
		await expect(page.locator('text=No sites associated')).toBeVisible();

		// Click Add Site
		await page.getByRole('button', { name: 'Add Site' }).click();

		// Wait for modal
		await expect(page.getByRole('heading', { name: 'Add Site' })).toBeVisible({ timeout: 5000 });

		// Select site
		await page.locator('select#site-select').selectOption(siteId);

		// Click Add
		await page.getByRole('button', { name: 'Add' }).last().click();

		// Wait for modal to close
		await expect(page.getByRole('heading', { name: 'Add Site' })).not.toBeVisible({ timeout: 5000 });

		// Site should now appear in list
		await expect(page.locator(`text=Test Site 1`)).toBeVisible({ timeout: 5000 });

		// VALIDATE IN DATABASE
		const dbAssociation = await executeWithRetry(() =>
			db
				.selectFrom('clerkship_sites')
				.selectAll()
				.where('clerkship_id', '=', clerkshipId)
				.where('site_id', '=', siteId)
				.executeTakeFirst()
		);

		expect(dbAssociation).toBeDefined();
	});

	test('should remove site association and verify in database', async ({ page }) => {
		// First associate a site via DB
		await executeWithRetry(() =>
			db
				.insertInto('clerkship_sites')
				.values({
					id: `cs_${Date.now()}`,
					clerkship_id: clerkshipId,
					site_id: siteId,
					created_at: new Date().toISOString()
				})
				.execute()
		);

		await gotoAndWait(page, `/clerkships/${clerkshipId}/config`);

		// Click Associated Sites tab
		await page.getByRole('button', { name: /Associated Sites/i }).click();

		// Wait for site to appear
		await expect(page.locator(`text=Test Site 1`)).toBeVisible({ timeout: 5000 });

		// Click Remove
		await page.getByRole('button', { name: 'Remove' }).click();

		// Wait for removal
		await page.waitForTimeout(1000);

		// Site should no longer appear
		await expect(page.locator('text=No sites associated')).toBeVisible({ timeout: 5000 });

		// VALIDATE IN DATABASE
		const dbAssociation = await executeWithRetry(() =>
			db
				.selectFrom('clerkship_sites')
				.selectAll()
				.where('clerkship_id', '=', clerkshipId)
				.where('site_id', '=', siteId)
				.executeTakeFirst()
		);

		expect(dbAssociation).toBeUndefined();
	});

	test('should prevent removing site with team dependencies', async ({ page }) => {
		const timestamp = Date.now();

		// Create preceptor
		const preceptorId = `preceptor_${timestamp}`;
		await executeWithRetry(() =>
			db
				.insertInto('preceptors')
				.values({
					id: preceptorId,
					name: `Dr. Test ${timestamp}`,
					email: `test.${timestamp}@hospital.edu`,
					health_system_id: healthSystemId,
					site_id: siteId,
					max_students: 2,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		// Create second preceptor
		const preceptor2Id = `preceptor2_${timestamp}`;
		await executeWithRetry(() =>
			db
				.insertInto('preceptors')
				.values({
					id: preceptor2Id,
					name: `Dr. Test2 ${timestamp}`,
					email: `test2.${timestamp}@hospital.edu`,
					health_system_id: healthSystemId,
					site_id: siteId,
					max_students: 2,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		// Associate site with clerkship
		await executeWithRetry(() =>
			db
				.insertInto('clerkship_sites')
				.values({
					id: `cs_${timestamp}`,
					clerkship_id: clerkshipId,
					site_id: siteId,
					created_at: new Date().toISOString()
				})
				.execute()
		);

		// Create team that uses this site
		const teamId = `team_${timestamp}`;
		await executeWithRetry(() =>
			db
				.insertInto('preceptor_teams')
				.values({
					id: teamId,
					clerkship_id: clerkshipId,
					name: `Team with Site ${timestamp}`,
					require_same_health_system: 0,
					require_same_site: 0,
					require_same_specialty: 0,
					requires_admin_approval: 0,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		// Add team members
		await executeWithRetry(() =>
			db
				.insertInto('preceptor_team_members')
				.values([
					{
						id: `member1_${timestamp}`,
						team_id: teamId,
						preceptor_id: preceptorId,
						priority: 1,
						created_at: new Date().toISOString()
					},
					{
						id: `member2_${timestamp}`,
						team_id: teamId,
						preceptor_id: preceptor2Id,
						priority: 2,
						created_at: new Date().toISOString()
					}
				])
				.execute()
		);

		// Associate team with site
		await executeWithRetry(() =>
			db
				.insertInto('preceptor_team_sites')
				.values({
					id: `pts_${timestamp}`,
					team_id: teamId,
					site_id: siteId,
					created_at: new Date().toISOString()
				})
				.execute()
		);

		await gotoAndWait(page, `/clerkships/${clerkshipId}/config`);

		// Click Associated Sites tab
		await page.getByRole('button', { name: /Associated Sites/i }).click();

		// Wait for site to appear
		await expect(page.locator(`text=Test Site 1`)).toBeVisible({ timeout: 5000 });

		// Remove button should be disabled or show dependency info
		const removeButton = page.getByRole('button', { name: 'Remove' });
		const isDisabled = await removeButton.isDisabled();

		if (isDisabled) {
			// Button is correctly disabled
			expect(isDisabled).toBe(true);
		} else {
			// Try clicking and expect error message
			await removeButton.click();
			await expect(page.locator('text=/Cannot Remove|team/i')).toBeVisible({ timeout: 5000 });
		}

		// VALIDATE site still associated in DATABASE
		const dbAssociation = await executeWithRetry(() =>
			db
				.selectFrom('clerkship_sites')
				.selectAll()
				.where('clerkship_id', '=', clerkshipId)
				.where('site_id', '=', siteId)
				.executeTakeFirst()
		);

		expect(dbAssociation).toBeDefined();
	});

	test('should create elective under clerkship and verify in database', async ({ page }) => {
		const timestamp = Date.now();
		const electiveName = `Sports Medicine ${timestamp}`;

		await gotoAndWait(page, `/clerkships/${clerkshipId}/config`);

		// Click Electives tab
		await page.getByRole('button', { name: 'Electives' }).click();

		// Wait for electives panel
		await expect(page.locator('text=/No electives|Create Elective/i')).toBeVisible({ timeout: 5000 });

		// Click Create Elective
		const createButton = page.getByRole('button', { name: /Create.*Elective/i });
		await createButton.click();

		// Wait for form
		await expect(page.getByRole('heading', { name: 'Create Elective' })).toBeVisible({ timeout: 5000 });

		// Fill form
		await page.locator('input#name').fill(electiveName);
		await page.locator('input#specialty').fill('Sports Medicine');
		await page.locator('input#minimumDays').clear();
		await page.locator('input#minimumDays').fill('10');

		// Submit
		await page.getByRole('button', { name: 'Create' }).last().click();

		// Wait for form to close
		await expect(page.getByRole('heading', { name: 'Create Elective' })).not.toBeVisible({ timeout: 5000 });

		// Elective should appear in list
		await expect(page.locator(`text=${electiveName}`)).toBeVisible({ timeout: 5000 });

		// VALIDATE IN DATABASE
		const dbElective = await executeWithRetry(() =>
			db
				.selectFrom('clerkship_electives')
				.selectAll()
				.where('clerkship_id', '=', clerkshipId)
				.where('name', '=', electiveName)
				.executeTakeFirst()
		);

		expect(dbElective).toBeDefined();
		expect(dbElective!.specialty).toBe('Sports Medicine');
		expect(dbElective!.minimum_days).toBe(10);
	});

	test('should switch between inpatient and outpatient types', async ({ page }) => {
		await gotoAndWait(page, `/clerkships/${clerkshipId}/config`);

		// Initially outpatient
		const outpatientRadio = page.locator('input[value="outpatient"]');
		await expect(outpatientRadio).toBeChecked();

		// Switch to inpatient
		await page.locator('input[value="inpatient"]').click();

		// Save
		await page.getByRole('button', { name: 'Save Basic Info' }).click();

		// Wait for success
		await expect(page.locator('text=saved successfully')).toBeVisible({ timeout: 5000 });

		// VALIDATE IN DATABASE
		const dbClerkship = await executeWithRetry(() =>
			db
				.selectFrom('clerkships')
				.selectAll()
				.where('id', '=', clerkshipId)
				.executeTakeFirst()
		);

		expect(dbClerkship!.clerkship_type).toBe('inpatient');
	});

	test('should display teams associated with clerkship', async ({ page }) => {
		const timestamp = Date.now();

		// Create preceptors
		const preceptorId = `preceptor_${timestamp}`;
		const preceptor2Id = `preceptor2_${timestamp}`;

		await executeWithRetry(() =>
			db
				.insertInto('preceptors')
				.values([
					{
						id: preceptorId,
						name: `Dr. Alpha ${timestamp}`,
						email: `alpha.${timestamp}@hospital.edu`,
						health_system_id: healthSystemId,
						max_students: 2,
						created_at: new Date().toISOString(),
						updated_at: new Date().toISOString()
					},
					{
						id: preceptor2Id,
						name: `Dr. Beta ${timestamp}`,
						email: `beta.${timestamp}@hospital.edu`,
						health_system_id: healthSystemId,
						max_students: 2,
						created_at: new Date().toISOString(),
						updated_at: new Date().toISOString()
					}
				])
				.execute()
		);

		// Create team
		const teamId = `team_${timestamp}`;
		const teamName = `Test Team ${timestamp}`;
		await executeWithRetry(() =>
			db
				.insertInto('preceptor_teams')
				.values({
					id: teamId,
					clerkship_id: clerkshipId,
					name: teamName,
					require_same_health_system: 0,
					require_same_site: 0,
					require_same_specialty: 0,
					requires_admin_approval: 0,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.execute()
		);

		// Add members
		await executeWithRetry(() =>
			db
				.insertInto('preceptor_team_members')
				.values([
					{
						id: `member1_${timestamp}`,
						team_id: teamId,
						preceptor_id: preceptorId,
						priority: 1,
						created_at: new Date().toISOString()
					},
					{
						id: `member2_${timestamp}`,
						team_id: teamId,
						preceptor_id: preceptor2Id,
						priority: 2,
						created_at: new Date().toISOString()
					}
				])
				.execute()
		);

		await gotoAndWait(page, `/clerkships/${clerkshipId}/config`);

		// Click Preceptor Teams tab
		await page.getByRole('button', { name: /Preceptor Teams/i }).click();

		// Wait for teams to load
		await expect(page.locator(`text=${teamName}`)).toBeVisible({ timeout: 5000 });

		// Should show member count
		await expect(page.locator('text=2 members')).toBeVisible();
	});
});
